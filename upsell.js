// Kindgate — block "open in app" prompts (YouTube + Instagram)
//
// Two kinds of nag:
//  1. Safari's native Smart App Banner, triggered by <meta name="apple-itunes-app">.
//     It is drawn by Safari, not the page, so the only handle is to remove that
//     meta tag before Safari acts on it. This script runs at document_start and
//     watches <head> so the tag goes the moment it appears.
//  2. The sites' own banners/sheets ("Open in the YouTube app", "Use the app").
//     YouTube renders its one as an anonymous <div> at the top of <body>, and
//     Instagram's class names are obfuscated, so these are found by the label on
//     their button or by a link into the App Store, and the small box around
//     that is hidden. Only clickable elements are matched, and only containers
//     under 240px tall, so page content is never caught.

(() => {
  'use strict';

  let enabled = true;
  const store = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
              : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local
              : null;

  // Every English alternative must name the app: without that, "open" and
  // "open in" were optional-only and matched plain YouTube controls labelled
  // "Open", hiding the small box around a button that had nothing to do with
  // any upsell. The German side is matched as whole phrases for the same reason.
  const LABEL_RE = /^(?:(?:open|use|get|download|install|continue in|switch to)(?: in)?(?: the)?(?: youtube| instagram)? app|(?:in der )?app öffnen|youtube öffnen|instagram öffnen|zur app|app installieren|app laden|hol dir die app|app holen)$/i;
  const STORE_LINK = 'a[href*="apps.apple.com"], a[href^="itms-apps:"], a[href^="itms:"], a[href^="youtube://"], a[href^="vnd.youtube:"], a[href^="instagram://"]';
  const MAX_BANNER_PX = 240;

  // ---- 1. Smart App Banner -------------------------------------------------------
  function stripSmartBanner() {
    for (const m of document.querySelectorAll('meta[name="apple-itunes-app"], meta[name="smartbanner:enabled-platforms"]')) m.remove();
  }

  // ---- 2. In-page banners ---------------------------------------------------------
  function hide(el) { if (el && !el.hasAttribute('data-kindgate-hidden')) el.setAttribute('data-kindgate-hidden', ''); }

  function bannerAround(el) {
    // Climb to the widest box that is still banner-sized; stop before main/body.
    let box = el, best = null;
    for (let i = 0; i < 8; i++) {
      const p = box.parentElement;
      if (!p || p === document.body || p === document.documentElement || p.tagName === 'MAIN') break;
      const h = p.getBoundingClientRect().height;
      if (h > MAX_BANNER_PX) break;
      box = p; best = p;
    }
    return best || el;
  }

  // Each control is examined once. This used to re-read the label of every link
  // on the page every 2.5 s and climb the tree measuring boxes for each hit —
  // on a long YouTube feed that is thousands of forced layouts a minute. Banners
  // arrive as new nodes, so nothing is missed.
  const SCANNED = 'data-kg-upsell';
  function sweep() {
    if (!enabled) return;
    stripSmartBanner();
    const seen = new Set();
    for (const el of document.querySelectorAll(
      `a:not([${SCANNED}]), button:not([${SCANNED}]), [role="button"]:not([${SCANNED}]), [role="link"]:not([${SCANNED}])`
    )) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t && !el.matches(STORE_LINK)) continue;   // unlabelled for now; look again when it fills in
      el.setAttribute(SCANNED, '');
      if (el.closest('[data-kindgate-hidden], .kg-checkin, .kg-timer, .kg-morning, .kg-sleep, .kg-toast, .kg-pip, .kg-tabbar')) continue;
      const byLabel = t.length <= 32 && LABEL_RE.test(t);
      const byLink = el.matches(STORE_LINK);
      if (!byLabel && !byLink) continue;
      const box = bannerAround(el);
      if (!seen.has(box)) { seen.add(box); hide(box); }
    }
  }

  let scheduled = false, last = 0;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; last = Date.now(); sweep(); }, Math.max(0, 300 - (Date.now() - last)));
  };

  // Strip the meta as early as possible, then keep watching for late inserts.
  // At document_start <html> may not exist yet, so observe the Document node
  // itself — it always does, and subtree covers everything parsed after.
  stripSmartBanner();
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && (n.tagName === 'META' || n.tagName === 'HEAD')) { stripSmartBanner(); break; }
    }
    schedule();
  }).observe(document, { childList: true, subtree: true });

  const start = () => { sweep(); setInterval(sweep, 2500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  if (store) {
    try {
      const r = store.get(['fgBlockUpsell']);
      if (r && typeof r.then === 'function') r.then((d) => { enabled = !(d && d.fgBlockUpsell === false); if (enabled) schedule(); });
    } catch { /* ignore */ }
  }
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((ch) => {
      if (ch.fgBlockUpsell) { enabled = ch.fgBlockUpsell.newValue !== false; if (enabled) schedule(); }
    });
  }
})();
