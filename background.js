// Kindgate — status heartbeat for the container app
//
// iOS gives an app no way to ask whether its Safari extension is enabled or
// which sites the user allowed. So the extension tells it: this background
// script sends a native message when it starts (proof the extension is on)
// and whenever a content script reports that it ran on a site (proof that
// site is allowed). The native handler writes timestamps into the App Group,
// and the app's setup checklist reads them. Nothing else is sent: a host name
// reduced to youtube.com / instagram.com / other, and whether the page was
// opened from the Home Screen.

(() => {
  'use strict';
  const rt = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime
           : (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;
  const perms = (typeof browser !== 'undefined' && browser.permissions) ? browser.permissions : null;
  if (!rt) return;

  const THROTTLE_MS = 60000;
  const lastSent = new Map();   // key -> time of last native message

  const bucket = (hostname) => {
    const h = String(hostname || '').toLowerCase().replace(/^(www|m)\./, '');
    if (h === 'youtube.com' || h.endsWith('.youtube.com')) return 'youtube.com';
    if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'instagram.com';
    return 'other';
  };

  const send = (payload) => {
    try {
      const p = rt.sendNativeMessage('application.id', payload);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* no native host (e.g. desktop browser) */ }
  };

  const alive = async () => {
    let origins = [];
    try { if (perms && perms.getAll) origins = (await perms.getAll()).origins || []; } catch (e) {}
    send({ type: 'alive', at: Date.now(), origins });
  };

  rt.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'seen') return;
    const host = bucket(msg.host);
    const standalone = msg.standalone === true;
    const key = host + (standalone ? ':home' : '');
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < THROTTLE_MS) return;
    lastSent.set(key, now);
    send({ type: 'seen', host, standalone, at: now });
  });

  alive();
})();
