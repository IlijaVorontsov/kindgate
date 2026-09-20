// Kindgate — YouTube content script
// 1. Sends the home feed (/), Explore and Trending to /feed/subscriptions, so
//    YouTube opens on the accounts you follow and never shows recommendations.
// 2. Redirects any /shorts/<id> URL to the normal /watch?v=<id> player.
// 3. Blocks clicks/taps on any link that leads to Shorts, and turns Home links
//    (including the logo) into "go to Subscriptions" — all in the capture
//    phase, so YouTube's own SPA router never sees them.
// 4. Hides Shorts elements the CSS can't reach (text-matched shelves, etc.).
// 5. On watch pages: removes recommended videos, the comments section, and
//    turns autoplay off so one video never rolls into the next.
// 6. On /feed/ pages (Subscriptions): hides thumbnails and stops the inline
//    preview players, leaving a plain text list of what's new.

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

  const YT_CLASSES = { ytHome: 'kg-yt-home', ytShorts: 'kg-yt-shorts', ytRelated: 'kg-yt-related', ytComments: 'kg-yt-comments', ytAutoplay: 'kg-yt-autoplay', ytTabBar: 'kg-yt-tabbar' };
  function applyFeatureClasses() {
    const root = document.documentElement; if (!root) return;
    for (const k of Object.keys(YT_CLASSES)) root.classList.toggle(YT_CLASSES[k], !!F[k]);
  }
  applyFeatureClasses();

  const SUBS = '/feed/subscriptions';
  const SHORTS_RE = /^\/shorts\/([A-Za-z0-9_-]{6,})/;
  // Recommendation surfaces: anything here lands on Subscriptions instead.
  const FEED_PATHS = [/^\/$/, /^\/shorts\/?$/, /^\/feed\/explore\/?$/, /^\/feed\/trending\/?$/];

  // Guard against a redirect ping-pong (e.g. signed-out YouTube bouncing
  // /feed/subscriptions back to /). More than 3 hops in 10 s and we stand down.
  function loopGuardOk() {
    try {
      const now = Date.now();
      const hops = (JSON.parse(sessionStorage.getItem('kg-hops') || '[]')).filter((t) => now - t < 10000);
      hops.push(now);
      sessionStorage.setItem('kg-hops', JSON.stringify(hops));
      return hops.length <= 3;
    } catch { return true; }
  }

  function enforceUrl() {
    const p = location.pathname;
    const m = p.match(SHORTS_RE);
    if (m && F.ytShorts) {
      // Open the same video in the regular player — no swipe-feed, no autoplay chain.
      location.replace(`${location.origin}/watch?v=${m[1]}`);
      return true;
    }
    if (F.ytHome && FEED_PATHS.some((re) => re.test(p)) && loopGuardOk()) {
      location.replace(location.origin + SUBS);
      return true;
    }
    return false;
  }

  if (enforceUrl()) return;

  // --- Catch SPA navigations (YouTube uses pushState / popstate) ---------------
  const wrap = (fn) => function (...args) {
    const r = fn.apply(this, args);
    queueMicrotask(enforceUrl);
    return r;
  };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', enforceUrl, true);
  document.addEventListener('yt-navigate-start', enforceUrl, true);
  document.addEventListener('yt-navigate-finish', enforceUrl, true);

  // --- Intercept clicks before YouTube handles them ---------------------------
  function isShortsTarget(el) {
    const a = el.closest && el.closest('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/shorts') || /youtube\.com\/shorts/.test(href)) return true;
    }
    // Pivot bar / guide entries sometimes have no href on the element itself
    const labelled = el.closest && el.closest('[aria-label="Shorts"], [title="Shorts"], [tab-identifier="FEshorts"]');
    return !!labelled;
  }

  function isHomeTarget(el) {
    const a = el.closest && el.closest('a[href]');
    if (a) {
      const href = (a.getAttribute('href') || '').split(/[?#]/)[0];
      if (href === '/' || /^https?:\/\/(www\.|m\.)?youtube\.com\/?$/.test(href)) return true;
      if (href === '/feed/explore' || href === '/feed/trending') return true;
    }
    // The mobile logo is a <button aria-label="YouTube"> inside ytm-home-logo,
    // with class mobile-topbar-header-endpoint — no href at all.
    const labelled = el.closest && el.closest(
      '.pivot-bar-item-tab.w2w, #logo, ytd-topbar-logo-renderer, ytm-home-logo,' +
      '.mobile-topbar-header-endpoint, [aria-label="YouTube"], [aria-label="YouTube Startseite"]'
    );
    return !!labelled;
  }

  // Calling preventDefault() on touchstart stops WebKit ever producing the
  // click, so the jump to Subscriptions has to happen on the first event that
  // means "finger lifted".
  const RELEASE = new Set(['click', 'touchend', 'pointerup']);
  let lastHomeNav = 0;

  function interceptClick(e) {
    // Never interfere with Kindgate's own check-in card
    if (e.target.closest && e.target.closest('.kg-checkin, .kg-toast, .kg-pip, .kg-tabbar')) return;
    if (F.ytShorts && isShortsTarget(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (F.ytHome && isHomeTarget(e.target)) {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      if (RELEASE.has(e.type) && Date.now() - lastHomeNav > 800) {
        lastHomeNav = Date.now();
        location.assign(location.origin + SUBS);
      }
    }
  }
  for (const evt of ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'auxclick']) {
    window.addEventListener(evt, interceptClick, { capture: true, passive: false });
  }

  // --- Hide shelves that only reveal themselves through their title text ------
  const TITLE_SELECTORS = [
    'ytd-rich-shelf-renderer #title',
    'ytd-reel-shelf-renderer #title',
    'ytm-rich-shelf-renderer .rich-shelf-title',
    'ytd-shelf-renderer #title',
    'ytm-shelf-renderer .shelf-title',
    'grid-shelf-view-model h2',
    'yt-shelf-header-layout h2',
  ].join(',');

  // Bottom tab-bar entries to remove, by their visible label (English + German).
  // Backs up the class-based CSS rule in case YouTube renames the targetId.
  const HIDDEN_TABS = ['home', 'startseite', 'shorts', 'explore', 'entdecken'];

  function hide(el) { if (el && !el.hasAttribute('data-kindgate-hidden')) el.setAttribute('data-kindgate-hidden', ''); }

  // ---- Our own bottom bar on watch pages ------------------------------------
  // YouTube removes its tab bar from the DOM entirely while a video is open,
  // so there is nothing to un-hide — we supply the two entries worth keeping.
  const SVGNS = 'http://www.w3.org/2000/svg';
  function makeSvg(parts) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of parts) {
      const n = document.createElementNS(SVGNS, tag);
      for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
      s.appendChild(n);
    }
    return s;
  }
  const TAB_ICONS = {
    subs: () => makeSvg([
      ['path', { d: 'M5 7h14M7 4h10', 'stroke-linecap': 'round' }],
      ['rect', { x: '3', y: '10', width: '18', height: '10.5', rx: '2.4' }],
      ['path', { class: 'kg-tab-fill', d: 'M10.6 13.2v4.6l4-2.3z' }],
    ]),
    you: () => makeSvg([
      ['circle', { cx: '12', cy: '8.4', r: '3.6' }],
      ['path', { d: 'M4.8 20c0-3.6 3.2-5.6 7.2-5.6s7.2 2 7.2 5.6', 'stroke-linecap': 'round' }],
    ]),
  };

  let tabbar = null;
  function ensureTabBar() {
    const body = document.body;
    if (!onWatch() || !F.ytTabBar) { if (tabbar) { tabbar.remove(); tabbar = null; } return; }
    if (!body) return;
    if (tabbar && tabbar.isConnected && tabbar.parentElement === body) return;
    if (tabbar) tabbar.remove();
    tabbar = document.createElement('nav');
    tabbar.className = 'kg-tabbar';
    for (const [href, icon, label] of [
      ['/feed/subscriptions', TAB_ICONS.subs, 'Subscriptions'],
      ['/feed/you', TAB_ICONS.you, 'You'],
    ]) {
      const a = document.createElement('a');
      a.className = 'kg-tab';
      a.href = href;
      a.appendChild(icon());
      const span = document.createElement('span');
      span.textContent = label;
      a.appendChild(span);
      tabbar.appendChild(a);
    }
    body.appendChild(tabbar);
  }

  // ---- Watch page: recommendations, comments, autoplay ----------------------
  const onWatch = () => location.pathname === '/watch' || location.pathname.startsWith('/live/');
  const currentId = () => new URLSearchParams(location.search).get('v');
  // Section headings that introduce recommendations or comments (EN + DE).
  const RELATED_TEXT = ['up next', 'next video', 'related videos', 'more videos',
    'nächstes video', 'als nächstes', 'ähnliche videos', 'weitere videos'];
  const COMMENT_TEXT = ['comments', 'kommentare'];
  // Confirmed against the rendered m.youtube.com watch page: a recommendation
  // is <a class="media-item-thumbnail-container"> inside ytm-media-item inside
  // ytm-video-with-context-renderer.
  const TILES = 'ytm-video-with-context-renderer, ytm-media-item, ytm-compact-video-renderer,' +
    'ytm-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer,' +
    'ytd-rich-item-renderer, yt-lockup-view-model';

  // Walk up from a label to the smallest box that actually looks like a block.
  function climb(el, minHeight, stopAt) {
    let box = el;
    for (let i = 0; i < 7; i++) {
      const p = box.parentElement;
      if (!p || p === document.body || p === document.documentElement) break;
      if (stopAt && p.matches && p.matches(stopAt)) break;
      box = p;
      if (box.getBoundingClientRect().height > minHeight) break;
    }
    return box === el ? null : box;
  }

  let autoplayHandled = false;
  function disableAutoplay() {
    const t = document.querySelector(
      'player-autonav-toggle button, .ytwPlayerAutonavToggleHost button, .ytp-autonav-toggle-button'
    );
    if (!t || autoplayHandled) return;
    // Only touch it when we can read that it is currently ON, so we never
    // switch autoplay on by accident.
    const on = t.getAttribute('aria-pressed') === 'true' ||
               t.getAttribute('aria-checked') === 'true' ||
               t.classList.contains('ytp-autonav-toggle-button--checked');
    if (on) { autoplayHandled = true; t.click(); }
  }

  // ---- Subscriptions / feed pages: no thumbnails, no inline autoplay --------
  const isFeed = () => location.pathname.startsWith('/feed/');

  let hideThumbs = true;   // "Hide thumbnails in feeds" in the popup
  const fgStore = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
                : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local
                : null;
  if (fgStore) {
    try {
      const r = fgStore.get(['fgHideThumbs']);
      if (r && typeof r.then === 'function') r.then((d) => { hideThumbs = !(d && d.fgHideThumbs === false); schedule(); });
    } catch { /* ignore */ }
  }
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((ch) => {
      if (ch.fgHideThumbs) { hideThumbs = ch.fgHideThumbs.newValue !== false; schedule(); }
    });
  }

  const inPip = (v) => {
    try {
      return document.pictureInPictureElement === v || v.webkitPresentationMode === 'picture-in-picture';
    } catch { return false; }
  };

  const pausedOnce = new WeakSet();
  function stopFeedPlayback() {
    if (onWatch() || !F.ytAutoplay) return;
    for (const v of document.querySelectorAll('video')) {
      if (inPip(v) || pausedOnce.has(v)) continue;   // never fight, never touch PiP
      pausedOnce.add(v);
      try { v.autoplay = false; if (!v.paused) v.pause(); } catch { /* ignore */ }
    }
  }

  // Inline previews start themselves; catch them at the moment they begin.
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (!v || v.tagName !== 'VIDEO') return;
    if (onWatch() || inPip(v) || !F.ytAutoplay) return;
    try { v.pause(); } catch { /* ignore */ }
  }, true);

  function sweepFeed() {
    document.documentElement.classList.toggle('kg-nothumbs', isFeed() && hideThumbs);
    stopFeedPlayback();
  }

  function sweepWatch() {
    document.documentElement.classList.toggle('kg-watch', onWatch());
    if (!onWatch()) return;
    const id = currentId();

    // (a) Every link to a *different* video on this page is a recommendation.
    //     The CSS handles the known wrappers; this catches anything new.
    for (const a of F.ytRelated ? document.querySelectorAll('a[href*="/watch?v="]:not([data-kg-seen])') : []) {
      a.setAttribute('data-kg-seen', '');
      const m = (a.getAttribute('href') || '').match(/[?&]v=([A-Za-z0-9_-]{6,})/);
      if (!m || m[1] === id) continue;
      if (a.closest('[data-kindgate-hidden]')) continue;
      const tile = a.closest(TILES) || climb(a, 80);
      if (tile) hide(tile);
    }

    // (b) The comments teaser only — never the carousel around it, which also
    //     holds the description entry point, and never by climbing upwards,
    //     which used to take the channel row and action bar with it.
    // Verified: this carousel holds only the comments entry point (the
    //     description is reached from "more" in the metadata line), so the whole
    //     section goes — otherwise an empty grey box and its divider remain.
    for (const el of F.ytComments ? document.querySelectorAll(
      'yt-video-metadata-carousel-view-model, comments-entry-point-teaser-view-model, yt-comment-teaser-carousel-item-view-model'
    ) : []) {
      hide(el.closest('ytm-item-section-renderer') || el);
    }
    // ...and the "Comments" heading itself, without touching its siblings.
    for (const el of F.ytComments ? document.querySelectorAll('yt-carousel-title-view-model, .ytCarouselTitleViewModelTitle') : []) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (COMMENT_TEXT.includes(t)) hide(el.closest('yt-carousel-title-view-model') || el);
    }

    // (c) Headings left over from a recommendation shelf we removed.
    for (const el of F.ytRelated ? document.querySelectorAll('h2, h3') : []) {
      if (el.firstElementChild) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      if (t && t.length <= 30 && RELATED_TEXT.some((s) => t === s || t.startsWith(s))) hide(el);
    }

    if (F.ytAutoplay) disableAutoplay();
  }

  // Belt and braces: never let one video roll into the next.
  document.addEventListener('ended', (e) => {
    if (F.ytAutoplay && e.target && e.target.tagName === 'VIDEO') { try { e.target.pause(); } catch { /* ignore */ } }
  }, true);

  function sweep() {
    sweepFeed();
    sweepWatch();
    ensureTabBar();

    // Bottom tab bar (mobile web): Home / Shorts / Explore
    for (const tab of document.querySelectorAll('ytm-pivot-bar-item-renderer')) {
      if (tab.hasAttribute('data-kindgate-hidden')) continue;
      const title = tab.querySelector('.pivot-bar-item-title');
      const t = (title ? title.textContent : '').trim().toLowerCase();
      const isHome = ['home', 'startseite', 'explore', 'entdecken'].includes(t) || !!tab.querySelector('.pivot-bar-item-tab.w2w');
      const isShorts = t === 'shorts' || !!tab.querySelector('.pivot-bar-item-tab.shorts');
      if ((F.ytHome && isHome) || (F.ytShorts && isShorts)) tab.setAttribute('data-kindgate-hidden', '');
    }
    if (!F.ytShorts) return;
    // Shelves titled "Shorts"
    for (const t of document.querySelectorAll(TITLE_SELECTORS)) {
      if (/^\s*shorts\s*$/i.test(t.textContent || '')) {
        const shelf = t.closest(
          'ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytm-rich-section-renderer, ytd-shelf-renderer, ytm-shelf-renderer, grid-shelf-view-model, ytd-item-section-renderer'
        );
        if (shelf) shelf.setAttribute('data-kindgate-hidden', '');
      }
    }
    // Any remaining tile whose link goes to Shorts (covers new/unknown wrappers)
    for (const a of document.querySelectorAll('a[href^="/shorts/"]:not([data-kg-seen])')) {
      a.setAttribute('data-kg-seen', '');
      const tile = a.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-rich-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, yt-lockup-view-model'
      );
      if (tile) tile.setAttribute('data-kindgate-hidden', '');
    }
  }

  // Scrolling an infinite feed fires mutations continuously. Running a sweep
  // per animation frame meant several whole-document queries per frame, which
  // is what made long lists stall; 300 ms between sweeps is plenty.
  let scheduled = false, lastSweep = 0;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const wait = Math.max(0, 300 - (Date.now() - lastSweep));
    setTimeout(() => { scheduled = false; lastSweep = Date.now(); sweep(); }, wait);
  };

  const start = () => {
    loadFeatures(() => { applyFeatureClasses(); schedule(); });
    sweep();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
