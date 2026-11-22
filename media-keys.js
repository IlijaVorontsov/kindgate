// Kindgate — media keys for any HTML5 video (for a hardware keyboard: Mac, iPad)
//
// Default keys below; each can be rebound in the popup (Media keys), along
// with the speed step and the jump length. Keys are matched by position, not
// by the letter they type, so the same physical keys work on any layout:
//
//   QWERTY  Colemak
//   Q       Q        speed 1.0×, again: back to the speed before
//   W       W        speed −0.1×
//   E       F        speed +0.1×
//   A       A        fullscreen on / off
//   S       R        back 10 s
//   D       S        forward 10 s
//
// Bare letters can't be extension commands (those need a modifier), so this is
// a capture-phase keydown listener in every frame. It stays out of the way:
// it ignores keys typed into text fields or held with a modifier, and it lets
// the page have the key whenever there is no video to act on.
//
// The speed you pick is global: every video in every tab and window plays at
// it, and it is remembered. This is the only speed control in Kindgate; the
// one exception is the NSDR recording, which player.js keeps at 1x.

(() => {
  'use strict';
  if (window.__kgMediaKeys) return;
  window.__kgMediaKeys = true;

  const MIN_RATE = 0.1, MAX_RATE = 16;
  // Defaults; the popup can rebind each action and change the step and jump
  // (storage key fgMediaKeys: { map: { action: { code, label } | null }, step, seek }).
  const DEFAULT_MAP = { reset: 'KeyQ', slower: 'KeyW', faster: 'KeyE', fullscreen: 'KeyA', back: 'KeyS', forward: 'KeyD' };
  let STEP = 0.1, SEEK = 10;
  let KEYS = {};
  function applyKeys(cfg) {
    const map = Object.assign({}, DEFAULT_MAP);
    if (cfg && cfg.map) for (const a of Object.keys(DEFAULT_MAP)) if (a in cfg.map) map[a] = cfg.map[a] ? cfg.map[a].code : null;
    KEYS = {};
    for (const [action, code] of Object.entries(map)) if (code) KEYS[code] = action;
    STEP = (cfg && Number(cfg.step)) || 0.1;
    SEEK = (cfg && Number(cfg.seek)) || 10;
  }
  applyKeys(null);
  const REPEATABLE = new Set(['slower', 'faster', 'back', 'forward']);

  // ---- on/off switch (popup → fgFeatures.mediaKeys, default on) ---------------
  let enabled = true;
  const store = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
              : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  const readFlag = (f) => {
    const was = enabled;
    enabled = !(f && f.mediaKeys === false);
    if (enabled && !was && typeof applyAll === 'function') applyAll();   // switched back on
  };
  if (store) {
    try {
      const r = store.get(['fgFeatures', 'fgMediaKeys']);
      if (r && typeof r.then === 'function') r.then((d) => { readFlag(d && d.fgFeatures); applyKeys(d && d.fgMediaKeys); });
    } catch { /* ignore */ }
  }
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((ch) => {
      if (ch.fgFeatures) readFlag(ch.fgFeatures.newValue);
      if (ch.fgMediaKeys) applyKeys(ch.fgMediaKeys.newValue);
    });
  }

  // ---- when not to act --------------------------------------------------------
  const TEXT_INPUTS = /^(text|search|email|url|tel|password|number|date|datetime-local|month|week|time)$/i;
  function isEditable(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.isContentEditable) return true;
      const tag = n.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') return TEXT_INPUTS.test(n.type || 'text');
      const role = n.getAttribute && n.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
    }
    return false;
  }

  // ---- which video ------------------------------------------------------------
  function allVideos(root, out) {
    for (const v of root.querySelectorAll('video')) out.push(v);
    // Open shadow roots: custom players (Twitch, some news sites) hide the
    // <video> inside one. Walked on a key press, and every few seconds in the
    // visible tab while a global speed is set; background tabs never walk it.
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) allVideos(el.shadowRoot, out);
    return out;
  }
  function visibleArea(v) {
    const r = v.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function pickVideo() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    let vids = allVideos(document, []).filter((v) => v.readyState > 0 || v.currentSrc);
    if (fs) {
      const inFs = vids.filter((v) => v === fs || fs.contains(v));
      if (inFs.length) vids = inFs;
    }
    if (!vids.length) return null;
    // Playing first, then largest. A video you cannot see never counts, or a
    // scrolled-away autoplay clip would swallow the page's own letter keys.
    const score = (v) => { const a = visibleArea(v); return a > 0 ? a + (!v.paused && !v.ended ? 1e9 : 0) : 0; };
    let best = null, top = 0;
    for (const v of vids) { const s = score(v); if (s > top) { top = s; best = v; } }
    return best || (fs ? vids[0] : null);
  }

  // ---- speed: one global rate for every video, in every tab and window ----
  // Like Global Speed: the rate you pick is saved (fgMediaRate) and every
  // frame applies it to its videos, now and whenever a new one loads, so it
  // carries over between tabs, windows and Safari restarts. Until you press a
  // speed key it is unset and videos play at whatever the site chooses.
  // Sites that change the rate themselves (a reset on the next video, their
  // own speed menu) are overruled; one that keeps fighting back is left alone.
  // Listeners also go on each video we touch: media events don't bubble out of
  // a shadow root, so the document-level ones would miss custom players.
  let globalRate = null;
  let prevRate = null;                           // what Q returns to from 1x (fgMediaPrevRate)
  const tracked = new WeakSet();
  const fights = new WeakMap();                  // video -> recent forced re-applies
  let ours = false;

  const NSDR_ID = 'hEypv90GzDE';                 // player.js keeps the NSDR at 1x
  const handsOff = () => location.href.includes(NSDR_ID);
  const same = (a, b) => Math.abs(a - b) < 0.005;
  const clamp = (r) => Math.min(MAX_RATE, Math.max(MIN_RATE, r));
  // Snap to the step's grid (0.05, 0.1, 0.25, 0.5), so 1.25 + 0.1 lands on 1.3 or 1.4 cleanly.
  const step = (r) => clamp(Number((Math.round(r / STEP) * STEP).toFixed(2)));

  function gaveUp(v) {
    const now = Date.now();
    const recent = (fights.get(v) || []).filter((t) => now - t < 2000);
    recent.push(now);
    fights.set(v, recent);
    return recent.length > 6;
  }
  // mode: 'force' to set it now (your own change, another tab's), 'react' when
  // the page or a new video changed something. One write each: a gliding
  // change over several small steps was tried and measured no better in
  // Safari, possibly worse (fewer frames shown right after the change).
  function applyTo(v, mode) {
    if (!enabled || globalRate == null || handsOff()) return;
    if (!(v instanceof HTMLVideoElement)) return;          // audio players keep their own speed
    track(v);
    v.setAttribute('data-kg-rate', String(globalRate));
    if (same(v.playbackRate, globalRate)) return;
    if (mode === 'react' && gaveUp(v)) return;
    ours = true;
    try { v.playbackRate = globalRate; } catch { /* ignore */ }
    ours = false;
  }
  function applyAll(mode) {
    if (!enabled || globalRate == null) return;
    for (const v of allVideos(document, [])) applyTo(v, mode || 'force');
  }
  // Background tabs catch up when they become visible, or when their video
  // starts (the document-level listeners below); only the visible tab walks
  // its whole page, now and every few seconds for videos inside shadow roots,
  // whose media events never reach the document.
  const visible = () => document.visibilityState !== 'hidden';
  const applyIfVisible = () => { if (visible()) applyAll(); };
  document.addEventListener('visibilitychange', applyIfVisible);
  setInterval(applyIfVisible, 3000);

  // Every playbackRate change can cost Safari a small hiccup, so a burst of
  // presses (tapping fast, or holding the key) becomes one change: the first
  // press applies at once, the rest only when the burst ends. The readout still
  // follows every press. Saving is held back the same way, and this frame
  // ignores the echo of its own save: an older value arriving while you keep
  // pressing used to snap the speed back for a moment.
  const BURST_MS = 220;
  const FRAME_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let lastPress = 0, applyTimer = 0;
  function setGlobal(r) {
    globalRate = r;
    clearTimeout(applyTimer);
    const now = Date.now();
    const inBurst = now - lastPress < BURST_MS;
    lastPress = now;
    const settle = () => {
      applyAll('force');
      if (!store) return;
      try { const p = store.set({ fgMediaRate: globalRate, fgMediaPrevRate: prevRate, fgMediaRateFrom: FRAME_ID }); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    };
    if (!inBurst) applyAll('force');             // first press: at once
    applyTimer = setTimeout(settle, BURST_MS);   // and once more, and saved, when the presses stop
    return r;
  }
  function track(v) {
    if (tracked.has(v)) return;
    tracked.add(v);
    const reapply = () => applyTo(v, 'react');
    for (const evt of ['loadedmetadata', 'playing', 'ratechange']) v.addEventListener(evt, reapply);
  }
  for (const evt of ['loadstart', 'loadedmetadata', 'playing']) {
    document.addEventListener(evt, (e) => { if (e.target instanceof HTMLMediaElement) applyTo(e.target, 'react'); }, true);
  }
  const takeRate = (r) => { globalRate = (r == null || !Number(r)) ? null : clamp(Number(r)); applyIfVisible(); };
  if (store) {
    try {
      const r = store.get(['fgMediaRate', 'fgMediaPrevRate', 'fgSpeed']);
      if (r && typeof r.then === 'function') r.then((d) => {
        if (d && Number(d.fgMediaPrevRate)) prevRate = clamp(Number(d.fgMediaPrevRate));
        // The old YouTube "default speed" setting becomes the starting global
        // speed, once, so nobody who had set it loses it.
        const old = d && Number(d.fgSpeed);
        if ((!d || d.fgMediaRate == null) && old && old !== 1) {
          takeRate(old);
          try { store.set({ fgMediaRate: clamp(old), fgMediaRateFrom: FRAME_ID }); store.remove && store.remove('fgSpeed'); } catch { /* ignore */ }
          return;
        }
        takeRate(d && d.fgMediaRate);
      });
    } catch { /* ignore */ }
  }
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((ch) => {
      if (!ch.fgMediaRate) return;
      const from = ch.fgMediaRateFrom && ch.fgMediaRateFrom.newValue;
      if (from === FRAME_ID) return;             // our own save coming back
      if (ch.fgMediaPrevRate) prevRate = Number(ch.fgMediaPrevRate.newValue) ? clamp(Number(ch.fgMediaPrevRate.newValue)) : null;
      takeRate(ch.fgMediaRate.newValue);
    });
  }

  // Q: from any speed to 1x, remembering it; at 1x, back to the remembered one.
  function toggleNormal(v) {
    const cur = globalRate != null ? globalRate : (v.playbackRate || 1);
    if (!same(cur, 1)) { prevRate = cur; return setGlobal(1); }
    if (prevRate && !same(prevRate, 1)) return setGlobal(prevRate);
    return setGlobal(1);
  }

  // ---- seek -------------------------------------------------------------------
  function seek(v, delta) {
    let end = v.duration;
    if (!isFinite(end) && v.seekable && v.seekable.length) end = v.seekable.end(v.seekable.length - 1);
    const t = Math.max(0, v.currentTime + delta);
    v.currentTime = isFinite(end) ? Math.min(t, Math.max(0, end - 0.1)) : t;
  }

  // ---- fullscreen -------------------------------------------------------------
  // Prefer the site's own fullscreen button: it keeps the site's controls and
  // subtitles. Our key press is a user gesture, and the click runs inside it.
  const SITE_BUTTONS = [
    '.ytp-fullscreen-button',                          // YouTube (and its embeds)
    '[data-a-target="player-fullscreen-button"]',      // Twitch
    'button[data-fullscreen-button]',                  // Vimeo
    '.vjs-fullscreen-control',                         // video.js players
    '.jw-icon-fullscreen',                             // JW Player
    '.plyr__control[data-plyr="fullscreen"]',          // Plyr
  ];
  const FS_LABEL = /full ?screen|vollbild/i;
  // Climb from the video to its player, but stop before a box that holds a
  // second video, and only trust a bare aria-label close to the video, so a
  // neighbouring player or an image gallery's "full screen" is never pressed.
  function siteFullscreenButton(v) {
    let box = v.parentElement;
    for (let i = 0; box && i < 8; i++, box = box.parentElement) {
      if (box.querySelectorAll('video').length > 1) break;
      for (const sel of SITE_BUTTONS) { const b = box.querySelector(sel); if (b) return b; }
      if (i < 3) {
        for (const b of box.querySelectorAll('button[aria-label], [role="button"][aria-label]')) {
          if (FS_LABEL.test(b.getAttribute('aria-label'))) return b;
        }
      }
    }
    return null;
  }

  function toggleFullscreen(v) {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) { v.webkitExitFullscreen(); return; }
    const btn = siteFullscreenButton(v);
    if (btn) { btn.click(); return; }
    if (v.requestFullscreen) {
      const p = v.requestFullscreen();
      if (p && p.catch) p.catch(() => { if (v.webkitEnterFullscreen) try { v.webkitEnterFullscreen(); } catch { /* ignore */ } });
    } else if (v.webkitEnterFullscreen) {
      try { v.webkitEnterFullscreen(); } catch { /* ignore */ }
    }
  }

  // ---- on-screen feedback -----------------------------------------------------
  let hud = null, hudTimer = 0;
  function flash(v, text) {
    if (!hud) { hud = document.createElement('div'); hud.className = 'kg-mk-hud'; hud.setAttribute('aria-live', 'polite'); }
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const host = fs && fs !== v ? fs : (document.body || document.documentElement);
    if (hud.parentNode !== host) host.appendChild(hud);
    const r = v.getBoundingClientRect();
    hud.style.top = `${Math.max(8, r.top + 12)}px`;
    hud.style.left = `${Math.max(8, r.left + 12)}px`;
    hud.textContent = text;
    hud.classList.add('kg-mk-on');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud && hud.classList.remove('kg-mk-on'), 800);
  }
  const fmtRate = (r) => `${Number(r.toFixed(2))}×`;

  // ---- the listener -----------------------------------------------------------
  // A key we acted on is ours for its whole press: its keypress and keyup are
  // stopped too, so a site that listens for those (YouTube's F for fullscreen
  // is the same physical key as Colemak's +0.1×) never sees it either.
  const swallowing = new Set();
  window.addEventListener('blur', () => swallowing.clear());   // its keyup went to another window
  for (const type of ['keypress', 'keyup']) {
    window.addEventListener(type, (e) => {
      if (!swallowing.has(e.code)) return;
      if (type === 'keyup') swallowing.delete(e.code);
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  const isNetflix = /(^|\.)netflix\.com$/.test(location.hostname);

  window.addEventListener('keydown', (e) => {
    if (!enabled || e.defaultPrevented || e.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const action = KEYS[e.code];
    if (!action) return;
    if (e.repeat && !REPEATABLE.has(action)) return;
    const target = (e.composedPath && e.composedPath()[0]) || e.target;
    if (isEditable(target) || isEditable(document.activeElement)) return;
    // Netflix's player errors out when currentTime is set from outside; leave
    // seeking to its own arrow keys there.
    if (isNetflix && (action === 'back' || action === 'forward')) return;

    const v = pickVideo();
    if (!v) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowing.add(e.code);

    switch (action) {
      case 'reset': flash(v, fmtRate(toggleNormal(v))); break;
      case 'slower': flash(v, fmtRate(setGlobal(step((globalRate || v.playbackRate || 1) - STEP)))); break;
      case 'faster': flash(v, fmtRate(setGlobal(step((globalRate || v.playbackRate || 1) + STEP)))); break;
      case 'back': seek(v, -SEEK); flash(v, `−${SEEK} s`); break;
      case 'forward': seek(v, SEEK); flash(v, `+${SEEK} s`); break;
      case 'fullscreen': toggleFullscreen(v); break;
    }
  }, true);
})();
