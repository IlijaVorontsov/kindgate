// Kindgate — Warm screen at night
//
// After a set hour every page gets warmer and darker, easing in over a ramp so
// it never snaps. Blue light late in the evening is the part of screen use that
// most reliably pushes sleep later; this is the same trick as Night Shift, but
// it also applies to the page itself, which Night Shift on iOS does not reach
// with much strength.
//
// Implementation: a single fixed, click-through overlay multiplied over the
// page. Multiply scales each colour channel, so whites become amber and blacks
// stay black — contrast survives. Nothing on the page is restyled, so no site
// layout can break.
//
// Everything is local: two times, two strengths, an allow-list of sites to
// leave alone. Nothing is recorded.

(() => {
  'use strict';
  if (window.top !== window) return;
  if (!/^https?:$/.test(location.protocol)) return;

  const HOST = location.hostname.toLowerCase().replace(/^www\./, '');
  const DEFAULTS = {
    on: true,
    start: '21:00',   // begin warming
    end: '07:00',     // back to normal
    warmth: 70,       // 0–100, how far towards amber
    dim: 20,          // 0–100, how much light comes off overall
    ramp: 60,         // minutes to fade in at the start and out at the end
    skip: [],         // hostnames left untouched (photo editing, colour work)
  };
  // Full-strength tint. Roughly 2000 K — candlelight.
  const TINT = [255, 158, 74];
  const MAX_DIM = 0.55;   // dim 100 still leaves the page readable
  const TICK_MS = 60000;

  const api = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
            : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;

  // Settings come back from storage as whatever is stored there. A missing or
  // non-numeric strength used to reach the colour maths and come out as
  // rgb(NaN,NaN,NaN) — no tint at all, and nothing to say why.
  const num = (v, fallback, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  };

  let cfg = Object.assign({}, DEFAULTS);
  let el = null;
  let timer = null;

  // ---- schedule ------------------------------------------------------------------
  const toMin = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return (Number(m[1]) * 60 + Number(m[2])) % 1440;
  };
  // Minutes from `from` to `to` going forwards round the clock.
  const forward = (from, to) => ((to - from) % 1440 + 1440) % 1440;

  // 0 outside the night window, 1 at full strength, ramping at both ends.
  function strength(now) {
    const start = toMin(cfg.start), end = toMin(cfg.end);
    if (start === null || end === null) return 0;
    const span = forward(start, end);
    if (!span) return 0;                      // start === end: never on
    const into = forward(start, now);
    if (into >= span) return 0;               // outside the window
    const ramp = Math.min(num(cfg.ramp, DEFAULTS.ramp, 0, 1440), Math.floor(span / 2));
    if (!ramp) return 1;
    const left = span - into;
    return Math.min(1, into / ramp, left / ramp);
  }

  function skipped() {
    return (Array.isArray(cfg.skip) ? cfg.skip : []).some((raw) => {
      const s = String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (!s) return false;
      return s.includes('.') ? (HOST === s || HOST.endsWith('.' + s)) : HOST.includes(s);
    });
  }

  // ---- overlay ------------------------------------------------------------------
  function mount() {
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.id = 'kg-warm';
    el.setAttribute('aria-hidden', 'true');
    // Inline as well as in warm.css: the stylesheet can lose to a page's own
    // rules on id selectors, and this overlay must not become clickable.
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;mix-blend-mode:multiply;background:#fff;transition:background-color 1.2s linear';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function paint(k) {
    if (k <= 0) { if (el) el.style.backgroundColor = '#fff'; return; }
    const warm = k * (num(cfg.warmth, DEFAULTS.warmth, 0, 100) / 100);
    const dark = 1 - k * (num(cfg.dim, DEFAULTS.dim, 0, 100) / 100) * MAX_DIM;
    const ch = TINT.map((c) => Math.round((255 - (255 - c) * warm) * dark));
    mount().style.backgroundColor = `rgb(${ch[0]},${ch[1]},${ch[2]})`;
  }

  function apply() {
    if (!cfg.on || skipped()) {
      if (el) { el.remove(); el = null; }
      return;
    }
    const d = new Date();
    const k = strength(d.getHours() * 60 + d.getMinutes());
    if (k <= 0) { if (el) { el.remove(); el = null; } return; }
    paint(k);
  }

  // A fullscreen element paints above everything else, so the overlay has to
  // move inside it to keep tinting a fullscreen video.
  function refollow() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!el) return;
    const parent = fs || document.body || document.documentElement;
    if (el.parentNode !== parent) parent.appendChild(el);
  }

  // ---- run ------------------------------------------------------------------
  function start() {
    apply();
    clearInterval(timer);
    timer = setInterval(apply, TICK_MS);
  }

  function boot() {
    if (!api) { start(); return; }
    api.get(['fgWarm']).then((d) => {
      cfg = Object.assign({}, DEFAULTS, (d && d.fgWarm) || {});
      start();
    }).catch(start);
  }

  const onStorage = (changes, area) => {
    if (area && area !== 'local') return;
    if (!changes || !changes.fgWarm) return;
    cfg = Object.assign({}, DEFAULTS, changes.fgWarm.newValue || {});
    apply();
  };
  try {
    const s = (typeof browser !== 'undefined' ? browser : chrome).storage;
    if (s && s.onChanged) s.onChanged.addListener(onStorage);
  } catch { /* ignore */ }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  document.addEventListener('fullscreenchange', refollow);
  document.addEventListener('webkitfullscreenchange', refollow);

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
