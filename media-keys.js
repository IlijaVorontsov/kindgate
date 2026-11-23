// Kindgate — media keys for any HTML5 video, on a Mac; one global speed everywhere
//
// On the iPhone and iPad there are no keys: the script binds none there and
// only keeps the global speed (set from the popup's Video speed row, or carried
// over from a player).
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
  // Keys only on a Mac. An iPad asks for the desktop site as "MacIntel" but
  // has touch points; the iPhone and iPad get the speed and no key listener.
  const KEYS_ON = /^Mac/.test(navigator.platform) && !navigator.maxTouchPoints;

  // ---- on/off switch (popup → fgFeatures.mediaKeys, default on) ---------------
  let enabled = true;
  let carry = false;                             // fgFeatures.speedCarry, default off
  const store = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
              : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  const readFlag = (f) => {
    const was = enabled;
    const wasCarry = carry;
    enabled = !(f && f.mediaKeys === false);
    carry = !!(f && f.speedCarry === true);
    if ((enabled || carry) && !(was || wasCarry) && typeof applyAll === 'function') applyAll();   // switched back on
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
  // frame starts its videos at it, so it carries over between tabs, windows and
  // Safari restarts. Until a speed is set, videos play at whatever the site
  // chooses.
  //
  // It is a starting speed, not a lock. Each video gets the global rate when it
  // starts (a new source), or when the global rate itself changes (a key, or
  // another tab). After that, whatever it plays at is left alone: a speed you
  // pick in the player's own menu holds for that video. Only in the first
  // moments of a load, when sites reset the rate themselves, is a change with
  // no tap or key behind it set back (and a site that keeps at it is let be).
  //
  // "Carry speed changes from the player over to all videos" (fgFeatures.
  // speedCarry, default off): a change in the player that follows your own tap
  // or key, outside an ad and outside a load, becomes the global rate, exactly
  // as a key press would.
  //
  // Listeners go on each video we see: media events don't bubble out of a
  // shadow root, so the document-level ones would miss custom players.
  let globalRate = null;
  let prevRate = null;                           // what Q returns to from 1x (fgMediaPrevRate)
  let rateGen = 0;                               // bumped whenever the global rate changes
  const seen = new WeakMap();                    // video -> { src, gen }: started at this global rate
  const loads = new WeakMap();                   // video -> { at, started }: its last load event
  const tracked = new WeakSet();
  const fights = new WeakMap();                  // video -> recent load-time re-applies
  const written = new WeakMap();                 // video -> the rate we last wrote, until its ratechange arrives

  const NSDR_ID = 'hEypv90GzDE';                 // player.js keeps the NSDR at 1x
  const handsOff = () => location.href.includes(NSDR_ID);
  const same = (a, b) => Math.abs(a - b) < 0.005;
  const clamp = (r) => Math.min(MAX_RATE, Math.max(MIN_RATE, r));
  // Snap to the step's grid (0.05, 0.1, 0.25, 0.5), so 1.25 + 0.1 lands on 1.3 or 1.4 cleanly.
  const step = (r) => clamp(Number((Math.round(r / STEP) * STEP).toFixed(2)));
  // On iOS the media-keys switch is gone from the popup, so a value stored
  // under it earlier must not switch the speed off there.
  const speedOn = () => !KEYS_ON || enabled || carry;

  // Your own taps, clicks and keys in this frame: a rate change soon after one
  // is yours; one without is the site's.
  const GESTURE_MS = 1500;                       // tap/key -> the player's rate change
  const LOAD_MS = 2500;                          // after a load event, sites reset the rate
  const MENU_MS = 10000;                         // a tap on a video's own controls -> its speed menu
  let lastGesture = 0;
  const controlTaps = new WeakMap();             // video with native controls -> last tap on it
  // (No key listener at all on iOS, not even this one that only watches.)
  for (const t of ['pointerdown', 'pointerup', 'click', 'touchend'].concat(KEYS_ON ? ['keydown'] : [])) {
    window.addEventListener(t, (e) => {
      if (!e.isTrusted) return;
      lastGesture = Date.now();
      // Safari's own controls open a native speed menu that sends the page no
      // events, so choosing in it can take longer than GESTURE_MS.
      const v = (e.composedPath ? e.composedPath()[0] : e.target);
      if (v instanceof HTMLVideoElement && v.controls) controlTaps.set(v, lastGesture);
    }, true);
  }
  const isYouTube = /(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname);
  const inAd = (v) => !!((v.closest && v.closest('.ad-showing, .ad-interrupting')) ||
    (isYouTube && document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting')));
  // In Safari's own fullscreen player the page sees no taps, but outside a
  // load only you change the rate there. (Picture in Picture has no speed
  // control, so a change there is always the site's.)
  // YouTube's own player keeps a speed of its own (its menu, and the speed it
  // gives the next video). yt-rate.js, in the page's world on youtube.com,
  // copies the video's speed into it when it hears this event on the video.
  const onYouTubeSite = window === window.top && /^(www\.|m\.)?youtube\.com$/.test(location.hostname);
  const toPlayer = (v) => {
    if (!onYouTubeSite || inAd(v)) return;
    try { v.dispatchEvent(new CustomEvent('kg-yt-rate')); } catch { /* ignore */ }
  };
  const nativeFullscreen = (v) => !!(v.webkitDisplayingFullscreen || v.webkitPresentationMode === 'fullscreen');

  function gaveUp(v) {
    const now = Date.now();
    const recent = (fights.get(v) || []).filter((t) => now - t < 2000);
    recent.push(now);
    fights.set(v, recent);
    return recent.length > 6;
  }
  const srcOf = (v) => v.currentSrc || v.src || '';
  // why: 'start' (a load event, a sweep, a key, another tab) applies the global
  // rate only to a video that has not started at it yet; 'site' re-applies it
  // over a rate the site set itself during a load. One write each: a gliding
  // change over several small steps was tried and measured no better in
  // Safari, possibly worse (fewer frames shown right after the change).
  function applyTo(v, why) {
    if (!(v instanceof HTMLVideoElement)) return;          // audio players keep their own speed
    track(v);
    if (!speedOn() || globalRate == null || handsOff()) return;
    const s = seen.get(v), src = srcOf(v);
    if (why !== 'site' && s && s.src === src && s.gen === rateGen) return;   // already started at it
    seen.set(v, { src, gen: rateGen });
    v.setAttribute('data-kg-rate', String(globalRate));
    if (same(v.playbackRate, globalRate)) { toPlayer(v); return; }
    if (why === 'site' && gaveUp(v)) return;
    written.set(v, globalRate);
    try { v.playbackRate = globalRate; } catch { written.delete(v); return; }
    toPlayer(v);
  }
  function applyAll() {
    if (!speedOn() || globalRate == null) return;
    for (const v of allVideos(document, [])) applyTo(v, 'start');
  }
  function loaded(v, fresh) {
    const l = loads.get(v);
    if (fresh) { seen.delete(v); loads.set(v, { at: Date.now(), started: false }); }
    else if (l) l.at = Date.now();
    else loads.set(v, { at: Date.now(), started: false });
  }
  function onRate(v) {
    if (!speedOn() || handsOff()) return;
    const r = v.playbackRate;
    // The event for our own write (it arrives later, maybe after the global
    // rate has moved on in a burst of key presses).
    const w = written.get(v);
    if (w != null) { written.delete(v); if (same(r, w)) return; }
    if (!r || (globalRate != null && same(r, globalRate))) return;   // already the global
    const now = Date.now();
    const l = loads.get(v);
    const loadAt = l ? l.at : 0;
    const sinceLoad = now - loadAt;
    // A tap counts only if it came after the latest load event: the tap that
    // started a video must not cover the site resetting its speed afterwards.
    const tapped = (lastGesture > loadAt && now - lastGesture < GESTURE_MS) ||
      ((controlTaps.get(v) || 0) > loadAt && now - controlTaps.get(v) < MENU_MS);
    // readyState 0: the element is (re)loading and resetting its own rate.
    const yours = (tapped || (nativeFullscreen(v) && sinceLoad > LOAD_MS)) && v.readyState > 0 && !inAd(v);
    if (yours) {
      // A speed picked in Safari's own fullscreen player (or any control
      // that bypasses YouTube's menu) goes into YouTube's player too.
      toPlayer(v);
      if (carry) setGlobal(clamp(Number(r.toFixed(2))), v);
      return;                                     // otherwise it holds for this video
    }
    if (sinceLoad < LOAD_MS) applyTo(v, 'site');  // the site resetting it while loading
  }
  // Background tabs catch up when they become visible, or when their video
  // starts (the document-level listeners below); only the visible tab walks
  // its whole page, now and every few seconds for videos inside shadow roots,
  // whose media events never reach the document. The walk only starts videos
  // it has not seen; it never resets one.
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
  let lastPress = 0, applyTimer = 0, saveSeq = 0;
  // A new tag on every save: storage only reports keys that changed, so a
  // plain frame id would be missing from this frame's second save.
  const saveTag = () => `${FRAME_ID}:${++saveSeq}`;
  const inBurst = () => Date.now() - lastPress < BURST_MS;
  // from: the video whose own player set r (carry-over), which is already at it.
  function setGlobal(r, from) {
    globalRate = r;
    rateGen++;
    if (from) seen.set(from, { src: srcOf(from), gen: rateGen });
    clearTimeout(applyTimer);
    const first = !inBurst();
    lastPress = Date.now();
    const settle = () => {
      applyAll();
      if (!store) return;
      try { const p = store.set({ fgMediaRate: globalRate, fgMediaPrevRate: prevRate, fgMediaRateFrom: saveTag() }); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    };
    if (first) applyAll();                       // first press: at once
    applyTimer = setTimeout(() => { rateGen++; settle(); }, BURST_MS);   // and once more, and saved, when the presses stop
    return r;
  }
  function track(v) {
    if (tracked.has(v)) return;
    tracked.add(v);
    // Found late (inside a shadow root, by the sweep): the site may still be
    // settling its speed, so give it the same load window.
    if (!loads.has(v) && v.readyState > 0) loaded(v, false);
    v.addEventListener('emptied', () => loaded(v, true));    // a new source is on its way
    v.addEventListener('loadstart', () => { loaded(v, true); applyTo(v, 'start'); });
    v.addEventListener('loadedmetadata', () => { loaded(v, false); applyTo(v, 'start'); });
    v.addEventListener('play', () => loaded(v, false));   // a preloaded video being started (Shorts)
    v.addEventListener('playing', () => {
      const l = loads.get(v);
      if (l && !l.started) { l.started = true; l.at = Date.now(); }
      applyTo(v, 'start');
    });
    v.addEventListener('ratechange', () => onRate(v));
  }
  // Light-DOM videos are found here as soon as they load; track() takes over.
  for (const evt of ['loadstart', 'loadedmetadata', 'playing']) {
    document.addEventListener(evt, (e) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || tracked.has(v)) return;
      if (evt === 'loadstart') loaded(v, true); else loaded(v, false);
      applyTo(v, 'start');
    }, true);
  }
  const takeRate = (r) => {
    const next = (r == null || !Number(r)) ? null : clamp(Number(r));
    if (next === globalRate || (next != null && globalRate != null && same(next, globalRate))) return;
    globalRate = next;
    rateGen++;                                   // a new value from elsewhere: last change wins
    applyIfVisible();
  };
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
          try { store.set({ fgMediaRate: clamp(old), fgMediaRateFrom: saveTag() }); store.remove && store.remove('fgSpeed'); } catch { /* ignore */ }
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
      if (typeof from === 'string' && from.startsWith(`${FRAME_ID}:`)) return;   // our own save coming back
      if (ch.fgMediaPrevRate) prevRate = Number(ch.fgMediaPrevRate.newValue) ? clamp(Number(ch.fgMediaPrevRate.newValue)) : null;
      takeRate(ch.fgMediaRate.newValue);
    });
  }

  // The speed a key starts from: what this video plays at (a speed set in its
  // own player counts), or, mid-burst, the speed the presses so far reached.
  const baseRate = (v) => (inBurst() && globalRate != null) ? globalRate : (v.playbackRate || globalRate || 1);
  // Q: from any speed to 1x, remembering it; at 1x, back to the remembered one.
  function toggleNormal(v) {
    const cur = baseRate(v);
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

  // ---- the listener (Mac only) -------------------------------------------------
  if (!KEYS_ON) return;
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

    // The NSDR stays at 1x, and pressing a speed key there changes nothing.
    if (handsOff() && (action === 'reset' || action === 'slower' || action === 'faster')) { flash(v, '1×'); return; }
    switch (action) {
      case 'reset': flash(v, fmtRate(toggleNormal(v))); break;
      case 'slower': flash(v, fmtRate(setGlobal(step(baseRate(v) - STEP)))); break;
      case 'faster': flash(v, fmtRate(setGlobal(step(baseRate(v) + STEP)))); break;
      case 'back': seek(v, -SEEK); flash(v, `−${SEEK} s`); break;
      case 'forward': seek(v, SEEK); flash(v, `+${SEEK} s`); break;
      case 'fullscreen': toggleFullscreen(v); break;
    }
  }, true);
})();
