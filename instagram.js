// Kindgate — Instagram content script
// 1. Forces the home feed into Instagram's own "Following" view
//    (instagram.com/?variant=following), which only shows accounts you follow.
// 2. Sends /reels/ and /explore/ back to the home feed.
// 3. Hides "Suggested for you" posts, suggested-account carousels and the
//    "Suggested posts" block that appears after "You're all caught up" —
//    in case Instagram drops you back into the algorithmic feed.
// 4. Hides ads: any post, story-tray item or carousel carrying a "Sponsored"
//    label in its header.

(() => {
  'use strict';

  // ---- feature toggles (set in the popup) -------------------------------------
  // Read synchronously from a localStorage mirror so document_start decisions
  // (redirects) are right from the second visit on; storage refreshes it.
  const FEATURE_DEFAULTS = {
    ytHome: true, ytShorts: true, ytRelated: true, ytComments: true, ytAutoplay: true,
    ytTabBar: true, ytPip: true, ytRotate: true,
    igFollowing: true, igReels: true, igSuggested: true, igAds: true,
    igCheckpoint: true, igCheckpointEvery: 15,
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

  function applyFeatureClasses() { const r = document.documentElement; if (r) r.classList.toggle('kg-ig-reels', !!F.igReels); }
  applyFeatureClasses();

  const BLOCKED_PATHS = [/^\/reels\/?/, /^\/reel\/?$/, /^\/explore\/?/];
  const HOME_FOLLOWING = '/?variant=following';

  // Text markers Instagram uses for algorithmic content (English + German UI)
  const SUGGESTED_TEXT = [
    'suggested for you', 'suggested posts', 'suggested reels', 'suggested threads',
    'because you follow', 'recommended for you', 'reels for you',
    'vorschläge für dich', 'vorgeschlagene beiträge', 'vorgeschlagene reels',
    'weil du folgst', 'empfohlen für dich',
  ];
  const CAUGHT_UP_TEXT = ['all caught up', 'alles gesehen', 'du bist auf dem neuesten stand'];

  // Instagram's ad label. Matched as a whole label, not as a substring, so a
  // caption that merely mentions the word does not take the post with it.
  const SPONSORED_TEXT = ['sponsored', 'gesponsert'];
  // Creator posts carrying a brand disclosure. These come from accounts you
  // chose to follow, so they are left alone by default — add them to
  // SPONSORED_TEXT if you want them gone too.
  // const PARTNERSHIP_TEXT = ['paid partnership', 'bezahlte partnerschaft'];

  // Guard against a redirect ping-pong: if Instagram bounces ?variant=following
  // straight back to a bare "/" — signed out, or a UI change that drops the
  // parameter — this would otherwise reload the page forever. More than 3 hops
  // in 10 s and we stand down and leave the feed alone.
  function loopGuardOk() {
    try {
      const now = Date.now();
      const hops = (JSON.parse(sessionStorage.getItem('kg-ig-hops') || '[]')).filter((t) => now - t < 10000);
      hops.push(now);
      sessionStorage.setItem('kg-ig-hops', JSON.stringify(hops));
      return hops.length <= 3;
    } catch { return true; }
  }

  function enforceUrl() {
    const p = location.pathname;
    if (F.igReels && BLOCKED_PATHS.some((re) => re.test(p))) {
      if (!loopGuardOk()) return false;
      location.replace(location.origin + HOME_FOLLOWING);
      return true;
    }
    if (F.igFollowing && p === '/' && new URLSearchParams(location.search).get('variant') !== 'following') {
      if (!loopGuardOk()) return false;
      location.replace(location.origin + HOME_FOLLOWING);
      return true;
    }
    return false;
  }

  if (enforceUrl()) return;

  // SPA navigation hooks
  const wrap = (fn) => function (...args) {
    const r = fn.apply(this, args);
    queueMicrotask(enforceUrl);
    return r;
  };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', enforceUrl, true);

  // Block taps on Reels / Explore before Instagram's router sees them
  function isBlockedLink(el) {
    const a = el.closest && el.closest('a[href], [role="link"][href]');
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    return BLOCKED_PATHS.some((re) => re.test(href));
  }
  for (const evt of ['click', 'pointerdown', 'touchstart', 'mousedown']) {
    window.addEventListener(evt, (e) => {
      // Never interfere with Kindgate's own check-in card
      if (e.target.closest && e.target.closest('.kg-checkin, .kg-toast')) return;
      if (F.igReels && isBlockedLink(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, { capture: true, passive: false });
  }

  // ---- DOM sweep -------------------------------------------------------------
  const lower = (s) => (s || '').toLowerCase();
  const hasText = (el, list) => {
    const t = lower(el.textContent);
    return list.some((s) => t.includes(s));
  };

  function hide(el) { if (el) el.setAttribute('data-kindgate-hidden', ''); }

  // A container is too big to hide if it holds more than one post.
  const holdsManyPosts = (el) => el.querySelectorAll('article').length > 1;

  // Hide the post/tray item that owns a "Sponsored" label.
  function hideAd(label, main) {
    const article = label.closest('article');
    if (article) { hide(article); return; }

    const item = label.closest('li');
    if (item && item !== main && !holdsManyPosts(item)) { hide(item); return; }

    let box = label;
    for (let i = 0; i < 8; i++) {
      const parent = box.parentElement;
      if (!parent || parent === main || parent === document.body || holdsManyPosts(parent)) break;
      box = parent;
      if (box.getBoundingClientRect().height > 120) break;
    }
    if (box !== label) hide(box);
  }

  function sweepAds(main) {
    // A long feed holds thousands of leaves, and this ran on every mutation and
    // every 2 s. Each leaf is now read once; new posts arrive as new nodes, so
    // nothing is missed and a sweep no longer walks the whole scrollback.
    for (const el of main.querySelectorAll('span:not([data-kg-ad]), div[dir="auto"]:not([data-kg-ad]), a:not([data-kg-ad]), h2:not([data-kg-ad])')) {
      if (el.firstElementChild) { el.setAttribute('data-kg-ad', ''); continue; }   // leaf text nodes only
      const t = lower(el.textContent).replace(/[\s·•|,-]+$/, '').trim();
      if (!t) continue;                                   // still empty; look again when it fills in
      el.setAttribute('data-kg-ad', '');
      if (t.length > 24) continue;
      if (!SPONSORED_TEXT.includes(t)) continue;
      if (el.closest('[data-kindgate-hidden]')) continue;
      hideAd(el, main);
    }
  }

  // ---- doom-scroll checkpoint ---------------------------------------------------
  // A card in the feed, shaped like a post, every N posts. Not a block and not a
  // scolding: a number and a question, so the scrolling stops being automatic.
  const SESSION_KEY = 'fg:igStart';
  const sessionStart = () => {
    try {
      let t = Number(sessionStorage.getItem(SESSION_KEY) || 0);
      if (!t) { t = Date.now(); sessionStorage.setItem(SESSION_KEY, String(t)); }
      return t;
    } catch { return Date.now(); }
  };
  const shown = new Set();

  function cardTap(node, fn) {
    let armed = false, moved = false, sx = 0, sy = 0;
    node.addEventListener('touchstart', (e) => { const t = e.touches && e.touches[0]; if (!t) return; armed = true; moved = false; sx = t.clientX; sy = t.clientY; }, { passive: true });
    node.addEventListener('touchmove', (e) => { const t = e.touches && e.touches[0]; if (!t) return; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true; }, { passive: true });
    const run = (e) => {
      if (e.type === 'touchend') { const ok = armed && !moved; armed = false; if (!ok) { moved = false; return; } }
      else if (moved) { moved = false; return; }
      if (e.cancelable) e.preventDefault();
      e.stopPropagation(); fn();
    };
    node.addEventListener('touchend', run, { passive: false });
    node.addEventListener('click', run);
  }

  function makeCheckpoint(count) {
    const mins = Math.max(1, Math.round((Date.now() - sessionStart()) / 60000));
    const card = document.createElement('div');
    card.className = 'kg-ig-card';
    card.setAttribute('data-kindgate-card', '');
    const kicker = document.createElement('div');
    kicker.className = 'kg-ig-kicker';
    kicker.textContent = `${count} posts \u00B7 ${mins} min`;
    const title = document.createElement('div');
    title.className = 'kg-ig-title';
    title.textContent = 'Still what you came for?';
    const sub = document.createElement('div');
    sub.className = 'kg-ig-sub';
    sub.textContent = 'No judgement either way \u2014 just checking the scrolling is still a choice.';
    const row = document.createElement('div');
    row.className = 'kg-ig-row';
    const stay = document.createElement('button');
    stay.type = 'button'; stay.className = 'kg-ig-btn'; stay.textContent = 'Keep going';
    cardTap(stay, () => card.remove());
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'kg-ig-btn kg-ig-btn-primary'; go.textContent = 'That\u2019s enough';
    cardTap(go, () => { try { window.close(); } catch { /* ignore */ } location.replace('about:blank'); });
    row.append(stay, go);
    card.append(kicker, title, sub, row);
    return card;
  }

  // The Following feed holds recent posts from people you follow and then ends;
  // below "You're all caught up" Instagram shows suggestions, which we hide. So
  // the feed genuinely stops there — say so, rather than letting it look broken.
  let endCardDone = false;
  function endOfFeed(main) {
    if (endCardDone || F.igSuggested === false) return;
    let marker = null;
    for (const el of main.querySelectorAll('span, h2, h3, div[dir="auto"]')) {
      if (el.children.length > 2) continue;
      const t = lower(el.textContent).trim();
      if (t.length <= 60 && CAUGHT_UP_TEXT.some((c) => t.includes(c))) { marker = el; break; }
    }
    if (!marker) return;
    let box = marker;
    for (let i = 0; i < 6; i++) {
      const p = box.parentElement;
      if (!p || p === main || p === document.body || holdsManyPosts(p)) break;
      box = p;
      if (box.getBoundingClientRect().height > 60) break;
    }
    if (!box.parentElement) return;
    endCardDone = true;

    const card = document.createElement('div');
    card.className = 'kg-ig-card kg-ig-end';
    card.setAttribute('data-kindgate-card', '');
    const kicker = document.createElement('div');
    kicker.className = 'kg-ig-kicker';
    kicker.textContent = 'End of the feed';
    const title = document.createElement('div');
    title.className = 'kg-ig-title';
    title.textContent = 'You\u2019re up to date.';
    const sub = document.createElement('div');
    sub.className = 'kg-ig-sub';
    sub.textContent = 'That\u2019s everyone you follow. Everything below this point is Instagram\u2019s suggestions, not your people \u2014 so it\u2019s hidden. There is nothing more to scroll.';
    const row = document.createElement('div');
    row.className = 'kg-ig-row';
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'kg-ig-btn kg-ig-btn-primary'; go.textContent = 'Done for now';
    cardTap(go, () => { try { window.close(); } catch { /* ignore */ } location.replace('about:blank'); });
    row.appendChild(go);
    card.append(kicker, title, sub, row);
    box.parentElement.insertBefore(card, box.nextSibling);
  }

  function checkpoints(main) {
    if (F.igCheckpoint === false) return;
    const every = Math.max(3, Number(F.igCheckpointEvery) || 15);
    const posts = [...main.querySelectorAll('article')].filter((a) => !a.hasAttribute('data-kindgate-hidden'));
    for (let i = every - 1; i < posts.length; i += every) {
      const milestone = i + 1;
      if (shown.has(milestone)) continue;
      const post = posts[i];
      if (!post.parentElement) continue;
      shown.add(milestone);
      post.parentElement.insertBefore(makeCheckpoint(milestone), post);
    }
  }

  // Last line of defence: never leave a hidden element that contains the feed.
  function unhideOverreach() {
    for (const el of document.querySelectorAll('[data-kindgate-hidden]')) {
      if (el.querySelectorAll('article').length > 1) el.removeAttribute('data-kindgate-hidden');
    }
  }

  function sweep() {
    const main = document.querySelector('main') || document.body;
    if (!main) return;

    if (F.igAds) sweepAds(main);
    checkpoints(main);
    endOfFeed(main);
    unhideOverreach();
    if (!F.igSuggested) return;

    // (a) Posts whose header says "Suggested for you"
    for (const article of main.querySelectorAll('article')) {
      if (article.hasAttribute('data-kindgate-hidden')) continue;
      const header = article.querySelector('header') || article;
      if (hasText(header, SUGGESTED_TEXT)) hide(article);
    }

    // (b) Short headings / labels that introduce suggestion blocks (account
    //     carousels, "Suggested posts" divider). Hide the nearest sizeable box.
    const candidates = main.querySelectorAll('span, h2, h3, h4, div[dir="auto"]');
    for (const el of candidates) {
      if (el.children.length > 2) continue;              // only leaf-ish text nodes
      const t = lower(el.textContent).trim();
      if (t.length > 40) continue;
      if (SUGGESTED_TEXT.some((s) => t === s || t.startsWith(s))) {
        // Walk up to the block this label introduces — but never past something
        // holding more than one post. Without that guard this could hide a
        // wrapper containing the whole rest of the feed, and the sentinel that
        // loads older posts with it, which stopped the feed dead.
        let box = el;
        for (let i = 0; i < 8; i++) {
          const parent = box.parentElement;
          if (!parent || parent === main || parent === document.body || holdsManyPosts(parent)) break;
          box = parent;
          if (box.tagName === 'ARTICLE') break;
          if (box.getBoundingClientRect().height > 120) break;
        }
        if (box !== el && box !== main && !holdsManyPosts(box)) hide(box);
      }
      // (c) "You're all caught up" used to hide every following sibling. On the
      //     Following feed that is wrong twice over: the older posts you scroll
      //     back to live below it, and so does the sentinel that loads the next
      //     page — hiding it stopped the feed dead a few weeks back. Suggested
      //     content is caught by its own markers in (a) and (b) instead.
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; sweep(); }, 150);
  };

  const start = () => {
    loadFeatures(() => { applyFeatureClasses(); schedule(); });
    sweep();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(sweep, 2000); // belt-and-braces for lazy-loaded feed chunks
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
