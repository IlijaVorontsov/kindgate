// Kindgate test harness
//
// The content scripts are strict IIFEs that reach for `browser`, `location`,
// `Date`, the timers and the DOM as free globals. Nothing is exported, so the
// harness does not import them: it wraps a script's source in a function whose
// parameters shadow those globals, and calls it with fakes. jsdom supplies the
// document; everything with a clock, a network or a navigation is replaced by
// a small recording double so a test can say "it is 23:00 on youtube.com with
// these settings" and then look at what the script did.
//
//   const page = load('warm.js', { url: 'https://www.youtube.com/', now: '2026-09-21 23:00' });
//   await page.flush();
//   page.$('#kg-warm')                      // the overlay
//   page.nav                                // navigations the script asked for
//   page.runtime.sent                       // runtime.sendMessage calls
//   await page.storage.set({ fgWarm: {...} })   // fires onChanged like Safari does
//   page.clock.advance(60_000)              // fires timers, moves Date.now()
//
// Times without a zone ('2026-09-21 23:00') are local, matching what the
// scripts read through getHours().

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');

// ---- browser.storage.local ------------------------------------------------------
function fakeStorage(initial = {}) {
  const data = structuredClone(initial);
  const listeners = new Set();
  let failure = null;
  let hang = false;
  const guard = () => {
    if (hang) return new Promise(() => {});      // never answers
    if (failure) return Promise.reject(failure);
  };
  const emit = (changes) => { for (const fn of listeners) fn(changes, 'local'); };

  const local = {
    calls: [],                       // [{ op, arg }] in order, for assertions
    async get(keys) {
      local.calls.push({ op: 'get', arg: keys });
      await guard();
      if (keys == null) return structuredClone(data);
      if (typeof keys === 'string') keys = [keys];
      const out = {};
      if (Array.isArray(keys)) {
        for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      } else {
        for (const k of Object.keys(keys)) out[k] = k in data ? structuredClone(data[k]) : keys[k];
      }
      return out;
    },
    async set(obj) {
      local.calls.push({ op: 'set', arg: structuredClone(obj) });
      await guard();
      const changes = {};
      for (const k of Object.keys(obj)) {
        changes[k] = { oldValue: structuredClone(data[k]), newValue: structuredClone(obj[k]) };
        data[k] = structuredClone(obj[k]);
      }
      emit(changes);
    },
    async remove(keys) {
      local.calls.push({ op: 'remove', arg: keys });
      await guard();
      const changes = {};
      for (const k of [].concat(keys)) { if (k in data) { changes[k] = { oldValue: data[k] }; delete data[k]; } }
      emit(changes);
    },
    async clear() {
      local.calls.push({ op: 'clear' });
      await guard();
      for (const k of Object.keys(data)) delete data[k];
    },
    // Raw view for assertions; do not hand it to the script.
    get data() { return structuredClone(data); },
    // Make every later call reject, e.g. a tab left open across an update.
    fail(err = new Error('storage unavailable')) { failure = err; },
    // Make every later call wait forever, e.g. Safari never answering.
    stall() { hang = true; },
  };
  const onChanged = {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    hasListener: (fn) => listeners.has(fn),
  };
  return { local, onChanged, session: local, sync: local };
}

// ---- browser.runtime / browser.permissions ----------------------------------------
function fakeRuntime({ origins = [] } = {}) {
  const messageListeners = new Set();
  const runtime = {
    sent: [],                        // runtime.sendMessage payloads
    native: [],                      // runtime.sendNativeMessage [{ app, payload }]
    id: 'kindgate-test',
    getURL: (p) => 'safari-web-extension://kindgate-test/' + String(p).replace(/^\//, ''),
    sendMessage(msg) {
      runtime.sent.push(structuredClone(msg));
      // Deliver to background-style listeners in the same page, like a
      // round-trip through Safari would, and resolve with the first reply.
      let reply;
      for (const fn of messageListeners) { const r = fn(msg, { id: runtime.id }); if (reply === undefined) reply = r; }
      return Promise.resolve(reply);
    },
    sendNativeMessage(app, payload) {
      runtime.native.push({ app, payload: structuredClone(payload) });
      return Promise.resolve();
    },
    onMessage: {
      addListener: (fn) => messageListeners.add(fn),
      removeListener: (fn) => messageListeners.delete(fn),
      hasListener: (fn) => messageListeners.has(fn),
    },
    // Test-side: pretend a content script sent this to the background.
    deliver(msg, sender = {}) { return runtime.sendMessage(msg, sender); },
  };
  const permissions = {
    getAll: async () => ({ origins: origins.slice(), permissions: ['storage', 'nativeMessaging'] }),
  };
  return { runtime, permissions };
}

// ---- Date + timers ------------------------------------------------------------------
// One fake clock drives both, so advancing it fires the timers that fall due
// and Date.now() inside their callbacks agrees with the time they fired at.
function parseWhen(when) {
  if (when instanceof Date) return when.getTime();
  if (typeof when === 'number') return when;
  const s = String(when).trim().replace(' ', 'T');
  const t = new Date(s.length === 16 ? s + ':00' : s).getTime();   // '2026-09-21T23:00' is local
  if (Number.isNaN(t)) throw new Error(`harness: cannot parse time ${when}`);
  return t;
}

function fakeClock(start = '2026-09-21 12:00') {
  let now = parseWhen(start);
  let seq = 0;
  const timers = new Map();   // id -> { at, fn, args, every }

  class FakeDate extends Date {
    constructor(...args) { if (args.length === 0) super(now); else super(...args); }
    static now() { return now; }
  }

  const add = (fn, ms, args, every) => {
    const id = ++seq;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: now + delay, fn, args, every: every ? Math.max(1, delay) : 0 });
    return id;
  };
  const clock = {
    Date: FakeDate,
    now: () => now,
    setTimeout: (fn, ms, ...args) => add(fn, ms, args, false),
    setInterval: (fn, ms, ...args) => add(fn, ms, args, true),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => add(() => fn(now), 16, [], false),
    cancelAnimationFrame: (id) => timers.delete(id),
    pending: () => timers.size,
    // Move time forward, firing due timers in order. Intervals re-arm.
    advance(ms) {
      const target = now + Math.max(0, ms);
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next.t.at)) next = { id, t };
        if (!next) break;
        now = Math.max(now, next.t.at);
        if (next.t.every) next.t.at = now + next.t.every; else timers.delete(next.id);
        next.t.fn(...next.t.args);
      }
      now = target;
    },
    // Jump to an absolute time without firing anything (a tab woken later).
    set(when) { now = parseWhen(when); },
    at(when) { return parseWhen(when); },
  };
  return clock;
}

// ---- location -------------------------------------------------------------------------
// jsdom's own location is unforgeable and cannot navigate; the scripts get this
// one instead, which records every navigation they ask for.
function fakeLocation(url) {
  let u = new URL(url);
  const nav = [];
  const loc = {
    get href() { return u.href; },
    set href(v) { nav.push({ how: 'href', url: String(v) }); },
    get protocol() { return u.protocol; },
    get host() { return u.host; },
    get hostname() { return u.hostname; },
    get origin() { return u.origin; },
    get port() { return u.port; },
    get pathname() { return u.pathname; },
    get search() { return u.search; },
    get hash() { return u.hash; },
    set hash(v) { u.hash = v; },
    replace(v) { nav.push({ how: 'replace', url: String(v) }); },
    assign(v) { nav.push({ how: 'assign', url: String(v) }); },
    reload() { nav.push({ how: 'reload', url: u.href }); },
    toString() { return u.href; },
    // Test-side: the page is now here (SPA route change, after history.pushState).
    __set(v) { u = new URL(v, u); },
  };
  return { loc, nav };
}

// ---- loader ---------------------------------------------------------------------------
const BLANK = '<!doctype html><html><head></head><body></body></html>';

/**
 * Run one of the repo's scripts against a fake page.
 *
 * @param {string} file        e.g. 'warm.js'
 * @param {object} [opts]
 * @param {string} [opts.url]           page URL; sets host, origin and jsdom's own location
 * @param {string} [opts.html]          initial markup
 * @param {string} [opts.now]           local time the clock starts at
 * @param {object} [opts.storage]       initial browser.storage.local contents
 * @param {boolean} [opts.noStorage]    run without extension storage at all (desktop browser)
 * @param {boolean} [opts.storageFail]  every storage call rejects (a tab left open across an update)
 * @param {boolean} [opts.storageStall] every storage call hangs forever
 * @param {boolean} [opts.loading]      pretend the parser is still running (document_start)
 * @param {object} [opts.localStorage]  seed the page's own localStorage (objects are JSON-encoded)
 * @param {object} [opts.sessionStorage] seed the page's sessionStorage the same way
 * @param {string[]} [opts.origins]     permissions.getAll().origins for background.js
 * @param {object} [opts.globals]       extra or overriding globals for the script
 */
function load(file, opts = {}) {
  const url = opts.url || 'https://example.com/';
  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on('jsdomError', (e) => jsdomErrors.push(e));
  virtualConsole.on('error', (...a) => console.error(...a));
  virtualConsole.on('warn', () => {});
  const dom = new JSDOM(opts.html ?? BLANK, { url, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });
  const { window } = dom;
  const document = window.document;
  if (opts.loading) Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
  for (const [k, v] of Object.entries(opts.localStorage || {})) window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  for (const [k, v] of Object.entries(opts.sessionStorage || {})) window.sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));

  const clock = fakeClock(opts.now);
  const storage = fakeStorage(opts.storage);
  // The scripts read storage synchronously on load, so a failure mode has to
  // be in place before the script runs; calling fail() afterwards is too late.
  if (opts.storageFail) storage.local.fail();
  if (opts.storageStall) storage.local.stall();
  const { runtime, permissions } = fakeRuntime({ origins: opts.origins });
  const browser = opts.noStorage ? { runtime, permissions } : { storage, runtime, permissions };
  const { loc, nav } = fakeLocation(url);

  const globals = {
    window, document, location: loc,
    history: window.history, navigator: window.navigator, screen: window.screen,
    localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    MutationObserver: window.MutationObserver, IntersectionObserver: undefined, ResizeObserver: undefined,
    getComputedStyle: window.getComputedStyle.bind(window),
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement, Event: window.Event, CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent, MouseEvent: window.MouseEvent, TouchEvent: window.TouchEvent, HTMLMediaElement: window.HTMLMediaElement,
    browser, chrome: undefined,
    Date: clock.Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    requestAnimationFrame: clock.requestAnimationFrame, cancelAnimationFrame: clock.cancelAnimationFrame,
    fetch: () => Promise.reject(new Error('harness: no network in tests')),
    ...(opts.globals || {}),
  };

  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let fn;
  try {
    fn = new Function(...Object.keys(globals), `${src}\n//# sourceURL=${file}`);
  } catch (e) {
    throw new Error(`harness: ${file} does not parse: ${e.message}`);
  }
  fn(...Object.values(globals));

  const page = {
    window, document, storage: storage.local, onChanged: storage.onChanged, runtime, clock, location: loc, nav, jsdomErrors,
    $: (sel) => document.querySelector(sel),
    $$: (sel) => Array.from(document.querySelectorAll(sel)),
    text: (sel) => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim(),
    // Let pending promises (storage reads, microtasks) settle.
    async flush(rounds = 6) { for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r)); },
    // Finish a document_start page: parser done, DOMContentLoaded fired.
    async domReady() {
      if (opts.loading) Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'complete' });
      document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
      await page.flush();
    },
    // SPA route change as YouTube/Instagram do it.
    async spa(to) { loc.__set(to); window.history.pushState({}, '', loc.pathname + loc.search + loc.hash); await page.flush(); },
    // A real user tap: the scripts listen for a touch that does not scroll,
    // falling back to click. Fire both in the order Safari does.
    async tap(target) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) throw new Error(`harness: nothing matches ${target}`);
      const touch = { clientX: 10, clientY: 10, identifier: 1, target: el };
      const start = new window.Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(start, 'touches', { value: [touch] });
      const end = new window.Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(end, 'touches', { value: [] });
      Object.defineProperty(end, 'changedTouches', { value: [touch] });
      el.dispatchEvent(start);
      el.dispatchEvent(end);
      // Safari follows a tap with a synthesised click; handlers must not fire twice.
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await page.flush();
    },
    click(target) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    },
    close() { window.close(); },
  };
  return page;
}

module.exports = { load, fakeStorage, fakeClock, fakeLocation, fakeRuntime, ROOT };
