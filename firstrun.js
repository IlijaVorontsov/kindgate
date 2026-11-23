// Kindgate — one quiet note on the first cleaned feed page, once
//
// The first time a cleaned feed opens (YouTube's Subscriptions, Instagram's
// home feed), a small note says that Kindgate is on, what is gone, what still
// works and where the settings are. It fades by itself after a few seconds,
// or on a tap, and never comes back: fgFirstNote records that it was shown.
// No card, no question, nothing to decide.
//
// An install from before this release never sees it: migrate.js sets
// fgFirstNote for it, and runs before this decides.
//
// The note holds nothing personal, but it is still drawn in a closed shadow
// root like Kindgate's other screens, so the page's own styles cannot reach
// it. Its few styles are written here rather than in a CSS file of its own: a
// file would have to be web-accessible to be read into the shadow root, which
// would give pages one more way to tell that Kindgate is installed. They use
// only the brand tokens from brand.css, which the site entries load into the
// page.

(() => {
  'use strict';
  if (window.top !== window) return;
  if (!/^https?:$/.test(location.protocol)) return;

  const HOST = location.hostname.replace(/^(www|m)\./, '');
  const SITE = /(^|\.)youtube\.com$/.test(HOST) ? 'youtube' : /(^|\.)instagram\.com$/.test(HOST) ? 'instagram' : '';
  if (!SITE) return;

  const api = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
            : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  if (!api) return;

  const MAC = /^Mac/.test(navigator.platform) && !navigator.maxTouchPoints;
  const WHERE = MAC ? 'Settings are under Kindgate in the toolbar.' : 'Settings are under Kindgate in the page menu.';
  const TEXT = {
    youtube: 'The Home feed and Shorts are gone here. Search, channels and your subscriptions work as before. ' + WHERE,
    instagram: 'Reels, Explore and suggested posts are gone here. The people you follow, search and messages work as before. ' + WHERE,
  };
  const SHOW_MS = 7000;

  // The cleaned feed itself: where the user lands, with the cleaning on.
  const onFeed = (f) => SITE === 'youtube'
    ? /^\/feed\/subscriptions\/?$/.test(location.pathname) && (f.ytHome !== false || f.ytShorts !== false)
    : location.pathname === '/' && (f.igFollowing !== false || f.igReels !== false);

  const CSS = `
    :host { all: initial; }
    .note {
      position: fixed; z-index: 2147483646; box-sizing: border-box;
      left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); transform: translate(-50%, 8px);
      width: min(360px, calc(100vw - 28px)); padding: 14px 16px;
      border-radius: var(--kg-radius-card, 16px); background: var(--kg-ink); color: var(--kg-cream);
      font: 14px/1.4 var(--kg-font-body, -apple-system, sans-serif); text-align: left;
      box-shadow: 0 6px 24px rgba(0, 0, 0, .28); opacity: 0;
      transition: opacity .35s ease, transform .35s ease; cursor: pointer;
    }
    .note.mac { left: auto; right: 18px; bottom: 18px; transform: translate(0, 8px); }
    .note.in { opacity: 1; transform: translate(-50%, 0); }
    .note.mac.in { transform: translate(0, 0); }
    .title { display: block; margin: 0 0 4px; font: 600 16px/1.25 var(--kg-font-display, Georgia, serif); color: var(--kg-honey-soft); }
    .body { margin: 0; color: var(--kg-line); }
    @media (prefers-reduced-motion: reduce) { .note { transition: opacity .2s linear; } }
  `;

  function show() {
    const host = document.createElement('div');
    host.setAttribute('data-kg', 'toast');
    let root = host;
    try { root = host.attachShadow({ mode: 'closed' }); } catch { /* draw in the page */ }
    const style = document.createElement('style');
    style.textContent = CSS;
    const note = document.createElement('div');
    note.className = 'note' + (MAC ? ' mac' : '');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    const title = document.createElement('strong');
    title.className = 'title';
    title.textContent = 'Kindgate is on.';
    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = TEXT[SITE];
    note.append(title, body);
    root.append(style, note);
    document.documentElement.appendChild(host);
    requestAnimationFrame(() => requestAnimationFrame(() => note.classList.add('in')));
    let gone = false;
    const hide = () => {
      if (gone) return;
      gone = true;
      note.classList.remove('in');
      setTimeout(() => host.remove(), 450);
    };
    note.addEventListener('click', hide);
    setTimeout(hide, SHOW_MS);
  }

  // A Kindgate screen (check-in, morning, pause) is up: the note can wait for
  // the next feed page rather than stack on top of it.
  const covered = () => !!document.querySelector('[data-kg="screen"], .kg-checkin, .kg-sleep, .kg-timer, .kg-morning, .kg-pause');

  let tried = false;
  async function maybe() {
    if (tried) return;
    try {
      if (typeof kgMigrate === 'function') { try { await kgMigrate(api); } catch { /* decide on what is stored */ } }
      const d = await api.get(['fgFirstNote', 'fgFeatures']);
      if (d && d.fgFirstNote) { tried = true; return; }
      if (!onFeed((d && d.fgFeatures) || {}) || covered()) return;   // not yet: try on the next page
      tried = true;
      await api.set({ fgFirstNote: Date.now() });
      show();
    } catch { /* a missed note is nothing */ }
  }

  // Both sites change pages without loading a new document; watch the path.
  let lastPath = location.pathname;
  const check = () => { if (location.pathname !== lastPath) { lastPath = location.pathname; maybe(); } };
  setTimeout(maybe, 1200);   // after the redirects and the first paint
  const timer = setInterval(() => { if (tried) clearInterval(timer); else check(); }, 1000);
})();
