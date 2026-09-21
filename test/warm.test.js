// warm.js — the night-time warm overlay (README "Night").
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const rgb = (el) => el.style.backgroundColor.match(/\d+/g).map(Number);

describe('warm overlay', () => {
  test('mounts a click-through amber overlay inside the night window', async () => {
    const page = load('warm.js', { now: '2026-09-21 23:30' });
    await page.flush();
    const el = page.$('#kg-warm');
    assert.ok(el, 'overlay element mounted');
    assert.equal(el.getAttribute('aria-hidden'), 'true');
    assert.match(el.style.cssText, /pointer-events:\s*none/);
    assert.match(el.style.cssText, /mix-blend-mode:\s*multiply/);
    const [r, g, b] = rgb(el);
    assert.ok(r > g && g > b, `tint is amber, got rgb(${r},${g},${b})`);
  });

  test('does nothing during the day', async () => {
    const page = load('warm.js', { now: '2026-09-21 12:00' });
    await page.flush();
    assert.equal(page.$('#kg-warm'), null);
  });

  test('ramps in: half an hour into a 60-minute ramp is lighter than full strength', async () => {
    const early = load('warm.js', { now: '2026-09-21 21:30' });
    const late = load('warm.js', { now: '2026-09-21 23:30' });
    await early.flush(); await late.flush();
    const e = rgb(early.$('#kg-warm')), l = rgb(late.$('#kg-warm'));
    assert.ok(e[2] > l[2], `blue channel ${e[2]} at 21:30 should exceed ${l[2]} at 23:30`);
  });

  test('the window wraps past midnight and ends at the configured hour', async () => {
    const before = load('warm.js', { now: '2026-09-22 05:00' });
    const after = load('warm.js', { now: '2026-09-22 07:00' });
    await before.flush(); await after.flush();
    assert.ok(before.$('#kg-warm'), 'still warm at 05:00');
    assert.equal(after.$('#kg-warm'), null, 'gone at 07:00');
  });

  test('respects the stored schedule, strengths and on/off switch', async () => {
    const off = load('warm.js', { now: '2026-09-21 23:30', storage: { fgWarm: { on: false } } });
    await off.flush();
    assert.equal(off.$('#kg-warm'), null, 'switched off in the popup');

    const custom = load('warm.js', { now: '2026-09-21 15:00', storage: { fgWarm: { start: '14:00', end: '16:00', ramp: 0, warmth: 100, dim: 0 } } });
    await custom.flush();
    assert.deepEqual(rgb(custom.$('#kg-warm')), [255, 158, 74], 'full tint, no dim, no ramp');
  });

  test('a corrupt strength falls back to the default instead of rgb(NaN)', async () => {
    const page = load('warm.js', { now: '2026-09-21 23:30', storage: { fgWarm: { warmth: 'lots', dim: null, ramp: undefined } } });
    await page.flush();
    const el = page.$('#kg-warm');
    assert.ok(el);
    assert.doesNotMatch(el.style.backgroundColor, /NaN/);
  });

  test('leaves allow-listed sites alone, matching subdomains and stripping www', async () => {
    const skipped = load('warm.js', { url: 'https://www.photos.example.com/x', now: '2026-09-21 23:30', storage: { fgWarm: { skip: ['https://Example.com/'] } } });
    const other = load('warm.js', { url: 'https://notexample.com/', now: '2026-09-21 23:30', storage: { fgWarm: { skip: ['example.com'] } } });
    await skipped.flush(); await other.flush();
    assert.equal(skipped.$('#kg-warm'), null);
    assert.ok(other.$('#kg-warm'));
  });

  test('reacts to settings changed in the popup without a reload', async () => {
    const page = load('warm.js', { now: '2026-09-21 23:30' });
    await page.flush();
    assert.ok(page.$('#kg-warm'));
    await page.storage.set({ fgWarm: { on: false } });
    assert.equal(page.$('#kg-warm'), null, 'removed on the storage change');
    await page.storage.set({ fgWarm: { on: true } });
    assert.ok(page.$('#kg-warm'), 'back when switched on again');
  });

  test('follows the clock: appears when the minute tick crosses the start time', async () => {
    const page = load('warm.js', { now: '2026-09-21 20:59' });
    await page.flush();
    assert.equal(page.$('#kg-warm'), null);
    page.clock.advance(2 * 60_000);
    assert.ok(page.$('#kg-warm'), 'mounted by the interval tick');
  });

  test('fails open: if storage cannot be read the page loads without the overlay maths breaking', async () => {
    const page = load('warm.js', { now: '2026-09-21 23:30', storageFail: true });
    await page.flush();
    // The script falls back to the defaults on a failed read and must not throw.
    assert.equal(page.jsdomErrors.length, 0);
    assert.ok(page.$('#kg-warm'), 'defaults still apply');
  });

  test('reports the site to the background script once', async () => {
    const page = load('warm.js', { url: 'https://m.youtube.com/watch?v=abc' });
    await page.flush();
    assert.deepEqual(page.runtime.sent, [{ type: 'seen', host: 'm.youtube.com', standalone: false }]);
  });

  test('stays out of frames and non-http pages', async () => {
    const page = load('warm.js', { url: 'https://example.com/', now: '2026-09-21 23:30', globals: { window: { top: {} } } });
    await page.flush();
    assert.equal(page.$('#kg-warm'), null);
    assert.equal(page.runtime.sent.length, 0);
  });
});
