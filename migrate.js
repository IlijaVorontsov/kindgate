// Kindgate — the one-time settings step for the two-level layout
//
// Until this release the six parts of the second layer were on after install:
// the check-in card, the morning, after-work and night windows, the warm
// screen and the pause. Now they are off until switched on. An install that
// already ran Kindgate keeps exactly what it had: before the new defaults
// apply, every one of the six that was never touched is written into storage
// as on. A switch the user turned off stays off.
//
// An earlier install is recognised by what it left in storage. A fresh one has
// nothing, or only keys that this version may write before the step runs
// (listed in NOT_EVIDENCE), so it is never mistaken for an old one. An old
// install that never stored anything at all (never opened the popup, never
// saw a card) is treated as new, which matches what it ever experienced.
//
// The step runs wherever a default is read: the background script at start,
// the popup before it draws, and the scripts that act on the six parts before
// they decide. All of them share one promise per page, the step itself is
// idempotent, and fgDefaults marks it done so it never runs twice.
//
// Loaded by background.js (manifest "background"), popup.html and, in the
// manifest, ahead of checkin.js, pause.js and warm.js. Defines one global,
// kgMigrate(storageArea) -> Promise.

(() => {
  'use strict';
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  if (typeof root.kgMigrate === 'function') return;   // listed in several manifest entries

  const VERSION = 2;   // fgDefaults: 2 = second layer off by default
  // The windows' times as they were before this release, for an install
  // whose stored window has no times of its own.
  const OLD_WINDOWS = {
    morning: { start: '06:00', end: '08:30', name: 'Morning window' },
    work: { start: '17:30', end: '20:00', name: 'After-work window' },
    night: { start: '21:30', end: '06:00', name: 'Night window' },
  };
  // Written by this version before the step can have run, or by the step
  // itself: none of them says that Kindgate was installed earlier.
  const NOT_EVIDENCE = new Set([
    'fgDefaults', 'fgLegacyInstall', 'fgLayoutNote', 'fgFirstNote',
    'fgMediaRate', 'fgMediaPrevRate', 'fgMediaRateFrom',
  ]);

  // Pure: what to write, given everything in storage. Exposed for tests.
  function plan(all) {
    all = all || {};
    if (Number(all.fgDefaults) >= VERSION) return null;
    const existing = Object.keys(all).some((k) => !NOT_EVIDENCE.has(k));
    const out = { fgDefaults: VERSION };
    if (!existing) return out;

    if (all.fgCheckinOn === undefined) out.fgCheckinOn = true;
    if (all.fgPauseOn === undefined) out.fgPauseOn = true;

    const stored = (all.fgWindows && typeof all.fgWindows === 'object') ? all.fgWindows : {};
    const windows = Object.assign({}, stored);
    let changed = false;
    for (const k of Object.keys(OLD_WINDOWS)) {
      const w = (stored[k] && typeof stored[k] === 'object') ? stored[k] : {};
      if (w.on === undefined) { windows[k] = Object.assign({}, OLD_WINDOWS[k], w, { on: true }); changed = true; }
    }
    if (changed) out.fgWindows = windows;

    const warm = (all.fgWarm && typeof all.fgWarm === 'object') ? all.fgWarm : {};
    if (warm.on === undefined) out.fgWarm = Object.assign({}, warm, { on: true });

    out.fgLegacyInstall = Date.now();   // had the second layer before it became opt-in
    out.fgLayoutNote = 'pending';       // the popup says once that nothing was switched off
    out.fgFirstNote = Date.now();       // no "Kindgate is on" note for someone who knows
    return out;
  }

  let running = null;
  function kgMigrate(api) {
    if (!api) return Promise.resolve(null);
    if (running) return running;
    running = (async () => {
      const mark = await api.get(['fgDefaults']);
      if (mark && Number(mark.fgDefaults) >= VERSION) return null;
      const out = plan(await api.get(null));
      if (out) await api.set(out);
      return out;
    })();
    // A failed step is tried again by the next caller rather than remembered.
    running.catch(() => { running = null; });
    return running;
  }
  kgMigrate.plan = plan;
  kgMigrate.VERSION = VERSION;
  root.kgMigrate = kgMigrate;
})();
