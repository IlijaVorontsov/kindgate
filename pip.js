// Kindgate — Picture in Picture button + rotate-to-fullscreen (YouTube)
//
// PiP is manual: tap the button. iOS only grants Picture in Picture from a
// real user gesture, so a button is the one thing that reliably works.
// Mobile YouTube marks its <video> with `disablepictureinpicture` to block PiP
// entirely, so that attribute is stripped (and kept stripped).
//
// Rotating to landscape asks the video to go fullscreen. Rotation is not a
// user gesture, so WebKit may refuse; when it does, a single tap prompt
// appears, and that tap is a gesture.

(() => {
  'use strict';

  // ---- feature toggles (set in the popup) -------------------------------------
  // Read synchronously from a localStorage mirror so document_start decisions
  // (redirects) are right from the second visit on; storage refreshes it.
  const FEATURE_DEFAULTS = {
    ytHome: true, ytShorts: true, ytRelated: true, ytComments: true, ytAutoplay: true,
    ytTabBar: true, ytPip: true, ytRotate: true,
    igFollowing: true, igReels: true, igSuggested: true, igAds: true,
  };
  let F = (() => { try { return Object.assign({}, FEATURE_DEFAULTS, JSON.parse(localStorage.getItem('fg:features') || '{}')); } catch { return Object.assign({}, FEATURE_DEFAULTS); } })();
  const fgStoreF = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
                 : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  function loadFeatures(onChange) {
    const apply = (d) => {
      F = Object.assign({}, FEATURE_DEFAULTS, (d && d.fgFeatures) || {});
      try { localStorage.setItem('fg:features', JSON.stringify(F)); } catch { /* ignore */ }
      if (onChange) onChange();
    };
    if (fgStoreF) { try { const r = fgStoreF.get(['fgFeatures']); if (r && typeof r.then === 'function') r.then(apply); } catch { /* ignore */ } }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((ch) => { if (ch.fgFeatures) apply({ fgFeatures: ch.fgFeatures.newValue }); });
    }
  }

  const isWatch = () => location.pathname === '/watch' || location.pathname.startsWith('/live/');
  let btn = null;
  let prompt = null;

  function unblock(v) {
    if (!v) return;
    if (v.hasAttribute('disablepictureinpicture')) v.removeAttribute('disablepictureinpicture');
    try { v.disablePictureInPicture = false; } catch { /* read-only on some builds */ }
    try { v.setAttribute('autopictureinpicture', ''); } catch { /* ignore */ }
    try { v.autoPictureInPicture = true; } catch { /* ignore */ }
  }

  const inPip = (v) => {
    try {
      return document.pictureInPictureElement === v || v.webkitPresentationMode === 'picture-in-picture';
    } catch { return false; }
  };

  function video() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a >= area) { area = a; best = v; }
    }
    return best;
  }

  function supported(v) {
    if (!v) return false;
    if (typeof v.webkitSetPresentationMode === 'function') {
      return !v.webkitSupportsPresentationMode || v.webkitSupportsPresentationMode('picture-in-picture');
    }
    return typeof v.requestPictureInPicture === 'function';
  }

  function flash(msg) {
    const n = document.createElement('div');
    n.className = 'kg-pip-note';
    n.textContent = msg;
    (document.body || document.documentElement).appendChild(n);
    setTimeout(() => n.remove(), 2600);
  }

  // Accept whichever tap event iOS delivers first, without breaking the gesture.
  function onTap(node, fn) {
    let armed = false, moved = false, busy = false, sx = 0, sy = 0;
    node.addEventListener('touchstart', (e) => { const t = e.touches && e.touches[0]; if (!t) return; armed = true; moved = false; sx = t.clientX; sy = t.clientY; }, { passive: true });
    node.addEventListener('touchmove', (e) => { const t = e.touches && e.touches[0]; if (!t) return; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true; }, { passive: true });
    node.addEventListener('touchcancel', () => { armed = false; moved = false; });
    const run = (e) => {
      if (e.type === 'touchend') { const ok = armed && !moved; armed = false; if (!ok) { moved = false; return; } }
      else if (moved) { moved = false; return; }
      if (busy) return;
      busy = true;
      setTimeout(() => { busy = false; }, 400);
      e.stopPropagation();
      fn();
    };
    node.addEventListener('touchend', run, { passive: true });
    node.addEventListener('click', run);
  }

  // A paused or not-yet-started video is started first: PiP and fullscreen on a
  // still frame are useless. Inside a tap this is always allowed; from a
  // rotation iOS may refuse a never-started video, which the prompt then covers.
  function startIfPaused(v) {
    if (!v || !v.paused) return;
    try { const pr = v.play(); if (pr && typeof pr.catch === 'function') pr.catch(() => {}); } catch { /* ignore */ }
  }

  // ---- Picture in Picture ---------------------------------------------------
  function togglePip() {
    const v = video();
    if (!v) { flash('No video found'); return; }
    unblock(v);
    if (!inPip(v)) startIfPaused(v);
    try {
      if (typeof v.webkitSetPresentationMode === 'function') {
        // WebKit can go fullscreen -> picture-in-picture directly, but only if
        // we ask for the mode rather than toggling from a stale reading.
        const mode = v.webkitPresentationMode;
        if (mode === 'picture-in-picture') { v.webkitSetPresentationMode('inline'); return; }
        if (mode === 'fullscreen' && typeof v.webkitExitFullscreen === 'function') {
          // Leaving fullscreen first makes the transition reliable; both calls
          // stay inside this one user gesture.
          try { v.webkitExitFullscreen(); } catch { /* ignore */ }
        }
        v.webkitSetPresentationMode('picture-in-picture');
        return;
      }
      if (document.pictureInPictureElement) { document.exitPictureInPicture(); return; }
      if (typeof v.requestPictureInPicture === 'function') { v.requestPictureInPicture(); return; }
      if (typeof v.webkitEnterFullscreen === 'function') { v.webkitEnterFullscreen(); return; }
      flash('Picture in Picture unavailable');
    } catch (err) {
      flash('Refused: ' + (err && err.name ? err.name : 'unknown'));
    }
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function pipIcon() {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of [
      ['rect', { x: '2.6', y: '4.4', width: '18.8', height: '15.2', rx: '2.6' }],
      ['rect', { class: 'kg-pip-inner', x: '12', y: '11.4', width: '8.2', height: '6.8', rx: '1.5' }],
    ]) {
      const n = document.createElementNS(SVGNS, tag);
      for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
      s.appendChild(n);
    }
    return s;
  }

  function ensureButton() {
    const v = video();
    // webkitSupportsPresentationMode() reports false while YouTube's
    // `disablepictureinpicture` attribute is set, so unblock first.
    unblock(v);
    const want = F.ytPip && isWatch() && !!v && supported(v);
    if (!want) { if (btn) { btn.remove(); btn = null; } return; }

    // Always a direct child of <body>: parking it next to the player meant it
    // vanished whenever YouTube rebuilt that subtree or our own rules hid it.
    const body = document.body || document.documentElement;
    if (btn && btn.isConnected && btn.parentElement === body) return;
    if (btn) btn.remove();

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kg-pip';
    btn.setAttribute('aria-label', 'Picture in Picture');
    btn.appendChild(pipIcon());
    const label = document.createElement('span');
    label.className = 'kg-pip-label';
    label.textContent = 'Picture in Picture';
    btn.appendChild(label);
    onTap(btn, togglePip);
    body.appendChild(btn);
  }

  // ---- Rotate to fullscreen -------------------------------------------------
  const isLandscape = () => {
    try { return window.matchMedia('(orientation: landscape)').matches; }
    catch { return window.innerWidth > window.innerHeight; }
  };

  const isFullscreen = (v) => {
    try { return !!(v.webkitDisplayingFullscreen || document.fullscreenElement); } catch { return false; }
  };

  function enterFullscreen(v) {
    try {
      if (typeof v.webkitEnterFullscreen === 'function') { v.webkitEnterFullscreen(); return true; }
      if (typeof v.requestFullscreen === 'function') { v.requestFullscreen(); return true; }
    } catch { /* refused without a gesture */ }
    return false;
  }

  function clearPrompt() {
    if (prompt) { prompt.remove(); prompt = null; }
  }

  function showFullscreenPrompt(v) {
    if (prompt) return;
    prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.className = 'kg-fs-prompt';
    prompt.textContent = v.paused ? 'Tap to play fullscreen' : 'Tap for fullscreen';
    onTap(prompt, () => { startIfPaused(v); enterFullscreen(v); clearPrompt(); });
    (document.body || document.documentElement).appendChild(prompt);
    setTimeout(clearPrompt, 6000);
  }

  function onRotate() {
    if (!isWatch() || !F.ytRotate) { clearPrompt(); return; }
    const v = video();
    if (!v) return;

    if (isLandscape()) {
      if (isFullscreen(v) || inPip(v)) return;
      startIfPaused(v);
      enterFullscreen(v);
      // Rotation is not a user gesture, so WebKit may have refused either call.
      setTimeout(() => {
        if (isLandscape() && !inPip(v) && (!isFullscreen(v) || v.paused)) showFullscreenPrompt(v);
      }, 700);
    } else {
      clearPrompt();
      try {
        if (v.webkitDisplayingFullscreen && typeof v.webkitExitFullscreen === 'function') v.webkitExitFullscreen();
      } catch { /* ignore */ }
    }
  }

  window.addEventListener('orientationchange', () => setTimeout(onRotate, 250));
  try {
    window.matchMedia('(orientation: landscape)').addEventListener('change', () => setTimeout(onRotate, 250));
  } catch { /* older WebKit */ }

  // ---- lifecycle ------------------------------------------------------------
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; ensureButton(); }, 300);
  };

  // YouTube tears the player down around fullscreen transitions, so rebuild
  // the button (and re-strip the PiP block) whenever the mode changes.
  function watchModeChanges() {
    const v = video();
    if (!v || v.dataset.fgPipHooked) return;
    v.dataset.fgPipHooked = '1';
    for (const evt of ['webkitbeginfullscreen', 'webkitendfullscreen', 'webkitpresentationmodechanged']) {
      v.addEventListener(evt, () => { unblock(v); setTimeout(ensureButton, 300); });
    }
  }

  const start = () => {
    loadFeatures(() => ensureButton());
    ensureButton();
    watchModeChanges();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disablepictureinpicture'] });
    for (const evt of ['yt-navigate-finish', 'popstate']) window.addEventListener(evt, schedule, true);
    setInterval(() => { ensureButton(); watchModeChanges(); }, 2000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
