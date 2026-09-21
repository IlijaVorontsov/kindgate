// Repository invariants. No DOM, no jsdom: `npm run check` runs only this file,
// so it works on a machine that has never run `npm install`.
//
// These encode the rules in CLAUDE.md that are easy to break by accident and
// that nothing else would catch before a build lands on a phone.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const manifest = JSON.parse(read('manifest.json'));

// Everything at the repo root that is part of the extension. Anything else at
// the root must be in build.sh's STRIP list or it ships inside the .appex.
const EXTENSION_ROOT = new Set([
  'manifest.json', 'background.js', 'brand.css', 'fonts', 'images', 'lists',
  'youtube.js', 'youtube.css', 'instagram.js', 'instagram.css',
  'checkin.js', 'checkin.css', 'pause.js', 'pause.css', 'warm.js', 'warm.css',
  'pip.js', 'pip.css', 'player.js', 'upsell.js',
  'popup.html', 'popup.js', 'popup.css',
]);

describe('manifest.json', () => {
  test('is Manifest V3 with a major.minor version', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.match(manifest.version, /^\d+\.\d+(\.\d+)?$/);
    assert.equal(manifest.name, 'Kindgate');
  });

  test('every file it references exists', () => {
    const files = [];
    for (const cs of manifest.content_scripts) files.push(...(cs.js || []), ...(cs.css || []));
    files.push(...(manifest.background?.scripts || []));
    files.push(manifest.action.default_popup);
    files.push(...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon));
    for (const f of files) assert.ok(exists(f), `${f} is referenced by manifest.json but missing`);
    for (const war of manifest.web_accessible_resources) {
      for (const pattern of war.resources) {
        const dir = pattern.split('/')[0];
        assert.ok(exists(dir), `web_accessible_resources points at ${dir}/ which is missing`);
      }
    }
  });

  test('content scripts use valid match patterns and a known run_at', () => {
    const MATCH = /^(<all_urls>|\*:\/\/(\*|\*\.[^/*]+|[^/*]+)\/.*)$/;
    for (const cs of manifest.content_scripts) {
      for (const m of cs.matches) assert.match(m, MATCH, `bad match pattern ${m}`);
      assert.ok(['document_start', 'document_end', 'document_idle'].includes(cs.run_at), `run_at ${cs.run_at}`);
      assert.equal(cs.all_frames, false, 'Kindgate never runs in frames');
    }
  });

  test('brand.css loads first wherever a stylesheet is injected', () => {
    for (const cs of manifest.content_scripts) {
      if (cs.css && cs.css.length) assert.equal(cs.css[0], 'brand.css', `${cs.js.join(',')} injects CSS without brand.css first`);
    }
    assert.match(read('popup.html'), /<link[^>]+href="brand\.css"/, 'popup.html links brand.css');
  });

  test('declares only the permissions CLAUDE.md allows', () => {
    // Adding one needs a `security` changelog fragment and this list updated.
    assert.deepEqual([...manifest.permissions].sort(), ['nativeMessaging', 'storage']);
    assert.equal(manifest.host_permissions, undefined, 'no host permissions beyond content_scripts matches');
  });

  test('the popup obeys its own CSP: no inline or remote scripts', () => {
    const html = read('popup.html');
    assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'");
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      assert.match(m[1], /src="[^:"]+"/, 'popup.html script must be a local file');
      assert.equal(m[2].trim(), '', 'no inline script in popup.html');
    }
    assert.doesNotMatch(html, /\son[a-z]+="/i, 'no inline event handlers in popup.html');
  });

  test('every script is registered; nothing registered is orphaned', () => {
    const registered = new Set([
      ...manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
      ...(manifest.background?.scripts || []),
      'popup.js', 'popup.css', 'popup.html',
    ]);
    for (const f of fs.readdirSync(ROOT)) {
      if (/\.(js|css)$/.test(f) && !registered.has(f)) assert.fail(`${f} is in the root but not registered in manifest.json or popup.html`);
    }
  });
});

describe('source hygiene', () => {
  const scripts = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));

  test('every script parses', () => {
    for (const f of scripts) {
      assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), `${f} has a syntax error`);
    }
  });

  test('content scripts never talk to the network', () => {
    // Storage only, no remote calls (CLAUDE.md). fetch() is allowed solely
    // for bundled resources via runtime.getURL.
    for (const f of scripts) {
      const src = read(f);
      assert.doesNotMatch(src, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource\(/, `${f} opens a network channel`);
      for (const m of src.matchAll(/fetch\(([^)]*)\)/g)) {
        assert.match(m[1], /getURL/, `${f}: fetch(${m[1]}) is not a bundled resource`);
      }
    }
  });

  test('content scripts never write into the visited site\'s localStorage except the feature mirror', () => {
    // A visited site can read its own localStorage. Only the popup (its own
    // origin), the documented fg:features mirror and YouTube's own player
    // preference (player.js sets the quality the way YouTube itself does)
    // may write there. Cue and win logs must never land here.
    const ALLOWED = { 'youtube.js': ['fg:features'], 'instagram.js': ['fg:features'], 'pip.js': ['fg:features'], 'player.js': ['yt-player-quality'] };
    for (const f of scripts) {
      if (f === 'popup.js') continue;
      for (const m of read(f).matchAll(/localStorage\.setItem\(\s*'([^']+)'/g)) {
        assert.ok((ALLOWED[f] || []).includes(m[1]), `${f} writes ${m[1]} into the visited site's localStorage`);
      }
    }
  });

  test('stylesheets carry no raw colours outside brand.css (ratchet)', () => {
    // CLAUDE.md: brand.css owns the palette. Existing debt is frozen here;
    // the count may go down, never up. Lower the number when you fix some.
    const BASELINE = { 'checkin.css': 53, 'instagram.css': 3, 'pip.css': 5, 'popup.css': 2, 'warm.css': 1, 'youtube.css': 2 };
    for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.css') && x !== 'brand.css')) {
      const hexes = read(f).replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b/gi) || [];
      const allowed = BASELINE[f] || 0;
      assert.ok(hexes.length <= allowed, `${f} has ${hexes.length} raw hex colours, baseline is ${allowed}: use a --kg-* token from brand.css`);
    }
  });

  test('brand.css defines the tokens the scripts read at runtime', () => {
    const tokens = new Set([...read('brand.css').matchAll(/(--kg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const f of scripts) {
      for (const m of read(f).matchAll(/brand\('(--kg-[a-z0-9-]+)'/g)) {
        assert.ok(tokens.has(m[1]), `${f} reads ${m[1]} but brand.css does not define it`);
      }
    }
  });
});

describe('build and release plumbing', () => {
  test('build.sh strips everything at the root that is not the extension', () => {
    const strip = new Set(read('build.sh').match(/^STRIP="([^"]+)"/m)[1].split(/\s+/));
    for (const entry of fs.readdirSync(ROOT)) {
      if (entry.startsWith('.')) continue;                 // rsync excludes dotfiles
      if (EXTENSION_ROOT.has(entry)) continue;
      assert.ok(strip.has(entry), `${entry} is at the repo root but not in build.sh's STRIP list; it would ship inside the .appex`);
    }
    for (const entry of EXTENSION_ROOT) assert.ok(!strip.has(entry), `${entry} is part of the extension but STRIP removes it`);
  });

  test('CHANGELOG.md has an Unreleased section and fragments are well named', () => {
    assert.match(read('CHANGELOG.md'), /^## \[Unreleased\]/m);
    const TYPES = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];
    for (const f of fs.readdirSync(path.join(ROOT, 'changelog.d'))) {
      if (f.toLowerCase() === 'readme.md') continue;
      const parts = f.split('.');
      assert.ok(parts.length >= 3 && parts.at(-1) === 'md' && TYPES.includes(parts.at(-2)), `changelog.d/${f}: expected <topic>.<type>.md`);
      assert.ok(read(`changelog.d/${f}`).trim().length, `changelog.d/${f} is empty`);
    }
  });

  test('README documents the current version and every popup-visible feature key', () => {
    const readme = read('README.md');
    // The feature keys the content scripts read must each be explained
    // somewhere in the README so behaviour and spec stay in step.
    const keys = new Set();
    for (const f of ['youtube.js', 'instagram.js']) {
      const m = read(f).match(/FEATURE_DEFAULTS = \{([\s\S]*?)\};/);
      for (const k of m[1].matchAll(/\b(yt|ig)[A-Z][A-Za-z]+\b/g)) keys.add(k[0]);
    }
    assert.ok(keys.size >= 10, 'found the feature flag table');
    const popup = read('popup.html') + read('popup.js');
    for (const k of keys) {
      if (k === 'igCheckpointEvery') continue;
      assert.ok(popup.includes(k), `feature ${k} has no control in the popup`);
    }
    assert.ok(readme.length > 1000);
  });
});
