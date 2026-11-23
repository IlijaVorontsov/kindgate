// Kindgate — tells YouTube's own player the speed Kindgate set (page world)
//
// media-keys.js writes video.playbackRate, which plays the video at the new
// speed but leaves YouTube's player unaware: its speed menu keeps showing the
// old value and it hands that old value to the next video. The player's own
// setPlaybackRate lives in the page's JavaScript world, which a content
// script cannot see, so this file is registered with "world": "MAIN"
// (Safari 18 and later; it is injected by Safari itself, so YouTube's content
// security policy and Trusted Types do not apply to it, and it creates no
// script element and no HTML).
//
// The bridge is one DOM event: media-keys.js dispatches "kg-yt-rate" on the
// <video> after it has set (or seen you set) its speed. Elements are shared
// between the two worlds, so this listener reads the speed from the element
// itself; nothing else crosses over. The page could send the same event, but
// all it would get is a call it can already make itself.
//
// YouTube's speeds run from 0.25 to 2 (in fixed steps in its menu, any value
// in between under "Custom"). A speed outside that range is never sent to the
// player, which would clamp it: the video keeps Kindgate's speed and the menu
// keeps the last value it knew. If the player rounds a speed inside the range,
// the video is set straight back to Kindgate's speed, so only the menu shows
// the rounded value.

(() => {
  'use strict';
  if (window.__kgYtRate) return;
  window.__kgYtRate = true;
  const same = (a, b) => Math.abs(a - b) < 0.005;
  document.addEventListener('kg-yt-rate', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    const p = (v.closest && v.closest('.html5-video-player')) || document.getElementById('movie_player');
    if (!p || typeof p.setPlaybackRate !== 'function') return;
    const r = v.playbackRate;
    if (!r) return;
    try {
      if (typeof p.getPlaybackRate === 'function' && same(Number(p.getPlaybackRate()), r)) return;
      const list = typeof p.getAvailablePlaybackRates === 'function' ? p.getAvailablePlaybackRates() : null;
      const min = list && list.length ? Math.min(...list) : 0.25;
      const max = list && list.length ? Math.max(...list) : 2;
      if (r < min - 0.005 || r > max + 0.005) return;
      p.setPlaybackRate(r);
    } catch { /* the player's API changed: the video still plays at r */ }
    if (!same(v.playbackRate, r)) { try { v.playbackRate = r; } catch { /* ignore */ } }
  }, true);
})();
