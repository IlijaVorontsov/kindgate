// Kindgate — playback preferences for YouTube
// Auto-unmute, a default playback speed, and a best-effort default quality.
// Set them in the extension popup.

(() => {
  'use strict';

  const store = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
              : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local
              : null;

  let cfg = { unmute: false, speed: 1, quality: 'auto' };
  let qualityWritten = null;

  // ---- The NSDR recording: always 1x, and start it without being asked. ----
  // iOS only allows sound to start after a tap in this page, so if play() is
  // refused a single big "Tap to start" button takes over.
  const NSDR_ID = 'hEypv90GzDE';
  const isNsdr = () => location.href.includes(NSDR_ID);   // /watch?v=<id> or /live/<id>
  let nsdrTries = 0, nsdrPrompt = null, nsdrStarted = false;

  function nsdrStyle() {
    if (document.getElementById('kg-nsdr-style')) return;
    const s = document.createElement('style');
    s.id = 'kg-nsdr-style';
    s.textContent = '.kg-nsdr-start{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483600;' +
      'appearance:none;-webkit-appearance:none;border:0;cursor:pointer;padding:0 22px;height:52px;border-radius:26px;' +
      'font:600 16px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,Arial,sans-serif;color:#06211f;background:#5ec8be;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.4);touch-action:manipulation;-webkit-tap-highlight-color:transparent;white-space:nowrap}' +
      '.kg-nsdr-start:active{transform:translateX(-50%) scale(.96)}';
    (document.head || document.documentElement).appendChild(s);
  }
  function showNsdrPrompt(v) {
    if (nsdrPrompt && nsdrPrompt.isConnected) return;
    nsdrStyle();
    nsdrPrompt = document.createElement('button');
    nsdrPrompt.type = 'button';
    nsdrPrompt.className = 'kg-nsdr-start';
    nsdrPrompt.textContent = 'Tap to start the NSDR';
    const go = () => {
      try { v.muted = false; v.playbackRate = 1; const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch { /* ignore */ }
      if (nsdrPrompt) { nsdrPrompt.remove(); nsdrPrompt = null; }
    };
    nsdrPrompt.addEventListener('touchend', go, { passive: true });
    nsdrPrompt.addEventListener('click', go);
    (document.body || document.documentElement).appendChild(nsdrPrompt);
  }
  function nsdrAutoplay(v) {
    if (nsdrStarted) return;
    if (!v.paused) { nsdrStarted = true; if (nsdrPrompt) { nsdrPrompt.remove(); nsdrPrompt = null; } return; }
    if (nsdrTries >= 12) return;
    nsdrTries++;
    try {
      const pr = v.play();
      if (pr && pr.catch) pr.catch(() => showNsdrPrompt(v));
    } catch { showNsdrPrompt(v); }
  }

  function largestVideo() {
    let best = null, area = -1;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area) { area = a; best = v; }
    }
    return best;
  }

  function apply() {
    const v = largestVideo();
    if (!v) return;

    if (cfg.unmute && v.muted) {
      // Only meaningful once playback has been started by a tap; before that
      // WebKit may refuse to play unmuted at all.
      try { v.muted = false; if (v.volume === 0) v.volume = 1; } catch { /* ignore */ }
    }

    const nsdr = isNsdr();
    const want = nsdr ? 1 : (Number(cfg.speed) || 1);          // the NSDR is always 1x
    if (v.playbackRate !== want) {
      try { v.playbackRate = want; } catch { /* ignore */ }
    }
    if (nsdr) nsdrAutoplay(v);
  }

  // Quality: the player's own API lives in the page's JavaScript world, which a
  // content script cannot reach, and YouTube's CSP blocks injecting a script to
  // get there. The one lever left is the preference YouTube itself persists,
  // so this nudges the default rather than forcing it — hence "best effort".
  function applyQuality() {
    if (!cfg.quality || cfg.quality === 'auto') return;
    const n = parseInt(cfg.quality, 10);
    if (!n || qualityWritten === cfg.quality) return;
    try {
      const now = Date.now();
      localStorage.setItem('yt-player-quality', JSON.stringify({
        data: JSON.stringify({ quality: n, previousQuality: n }),
        expiration: now + 30 * 24 * 60 * 60 * 1000,
        creation: now,
      }));
      qualityWritten = cfg.quality;
    } catch { /* storage blocked */ }
  }

  function load() {
    if (!store) return;
    try {
      const r = store.get(['fgUnmute', 'fgSpeed', 'fgQuality']);
      if (r && typeof r.then === 'function') {
        r.then((d) => {
          cfg = {
            unmute: !!(d && d.fgUnmute),
            speed: (d && Number(d.fgSpeed)) || 1,
            quality: (d && d.fgQuality) || 'auto',
          };
          qualityWritten = null;
          applyQuality();
          apply();
        });
      }
    } catch { /* ignore */ }
  }

  load();
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((ch) => {
      if (ch.fgUnmute || ch.fgSpeed || ch.fgQuality) load();
    });
  }

  for (const evt of ['loadedmetadata', 'play', 'playing', 'canplay']) {
    document.addEventListener(evt, apply, true);
  }
  setInterval(apply, 1500);
})();
