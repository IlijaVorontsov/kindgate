// Kindgate — Pause (friction, not walls)
//
// On sites you list, the page is covered by a short pause: a breathing prompt,
// "what are you feeling?", the replacement you pre-set for that feeling, and a
// "continue anyway" that unlocks after 10–20 s. Hard blocks get circumvented
// and invite all-or-nothing thinking; a delay breaks the automatic loop and
// lets the urge crest and fade.
//
// Goals are flexible (weekends only, not after midnight, not at work) or
// abstinence. Outside a goal the pause is full length; inside it, short.
//
// Language: no "relapse", no fear. Going ahead is "went ahead". A slip gets a
// compassionate review next time, not a reset-to-zero.
//
// Privacy: everything stays in the extension's on-device storage. The log
// holds a timestamp, the feeling, the outcome and whether it was within your
// goal — never a URL or hostname.

(() => {
  'use strict';
  if (window.top !== window) return;
  if (!/^https?:$/.test(location.protocol)) return;

  const HOST = location.hostname.toLowerCase().replace(/^www\./, '');
  const DEFAULT_SITES = [
    'porn', 'xxx', 'hentai', 'nsfw', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn', 'onlyfans',
    'chaturbate', 'brazzers', 'rule34', 'nhentai', 'fapello', 'stripchat', 'livejasmin', 'spankbang',
    'eporner', 'tnaflix', 'motherless', 'camsoda', 'bongacams', 'erome', 'pornhub',
  ];
  const TRIGGERS = [
    ['bored', 'Bored'], ['stressed', 'Stressed'], ['lonely', 'Lonely'],
    ['tired', 'Tired'], ['aroused', 'Actually aroused'], ['habit', 'Just habit'],
  ];
  const LABEL = Object.fromEntries(TRIGGERS);
  const MAX_LOG = 5000;
  // Sensible starting replacements — small, physical, doable in the next minute.
  const DEFAULT_ALTS = {
    bored: '10 push-ups, then pick one real task',
    stressed: 'Walk around the block \u2014 10 minutes',
    lonely: 'Message one person, right now',
    tired: 'Lie down: 20-minute NSDR, eyes closed',
    aroused: 'Cold water on your face, then a 10-minute walk',
    habit: 'Close the tab. Stand up. Drink water.',
  };

  // ---- storage ------------------------------------------------------------------
  const api = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
            : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  // Without extension storage everything stays in memory for this page only.
  // The old fallback wrote the pause log into the *visited site's* own
  // localStorage — the one place this log must never be readable from.
  const memory = new Map();
  async function load(keys) {
    // A failed read must not fall through to the empty in-memory map: the
    // caller would then run on the built-in defaults and ignore what the
    // user actually set (a switched-off night mode, the allow-list). Let it
    // throw so the page loads unguarded instead.
    if (api) return api.get(keys);
    const o = {}; for (const k of keys) if (memory.has(k)) o[k] = memory.get(k); return o;
  }
  async function save(obj) {
    if (api) { try { return await api.set(obj); } catch { /* fall through */ } }
    for (const k of Object.keys(obj)) memory.set(k, obj[k]);
  }

  // The wind-down link is typed by hand in the popup but ends up in
  // location.href, where a "javascript:" string would run as script in the page
  // rather than navigate. Only real navigations pass.
  const SAFE_SCHEMES = /^(?:https?|mailto|tel|shortcuts|music|spotify|podcasts?|overcast|pocketcasts|pktc):/i;
  function safeUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return 'https://' + s.replace(/^\/+/, '');
    return SAFE_SCHEMES.test(s) ? s : '';
  }

  // ---- matching ------------------------------------------------------------------
  // Entries with a dot are domains (exact or subdomain); without one, keywords
  // that must appear in the hostname.
  function matches(list) {
    const entries = (Array.isArray(list) && list.length ? list : DEFAULT_SITES)
      .map((s) => String(s).trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
    return entries.some((e) => e.includes('.') ? (HOST === e || HOST.endsWith('.' + e)) : HOST.includes(e));
  }

  // ---- goals --------------------------------------------------------------------------
  // Empty means "no rule"; only a real HH:MM becomes minutes.
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? (Number(m[1]) * 60 + Number(m[2])) : null;
  };
  // Returns { ok, why } — why names the first rule that says "not now".
  function goalCheck(goal, now = new Date()) {
    const g = Object.assign({ mode: 'reduce', weekendsOnly: false, notAfter: '', notBefore: '', notAtWork: false, workStart: '09:00', workEnd: '17:00' }, goal || {});
    if (g.mode === 'abstain') return { ok: false, why: 'your goal is to stop' };
    const day = now.getDay(), t = now.getHours() * 60 + now.getMinutes();
    if (g.weekendsOnly && day !== 0 && day !== 6) return { ok: false, why: 'weekends only' };
    const na = toMin(g.notAfter), nb = toMin(g.notBefore);
    if (na !== null && t >= na) return { ok: false, why: 'not after ' + g.notAfter };
    if (nb !== null && t < nb) return { ok: false, why: 'not before ' + g.notBefore };
    if (g.notAtWork && day >= 1 && day <= 5) {
      const ws = toMin(g.workStart), we = toMin(g.workEnd);
      if (ws !== null && we !== null && t >= ws && t < we) return { ok: false, why: 'not at work' };
    }
    return { ok: true, why: '' };
  }

  // ---- night window (same rule as checkin.js) --------------------------------------------
  const winMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h * 60 + (m || 0)) % 1440; };
  function isNightNow(windows) {
    const w = (windows && windows.night) || { on: true, start: '21:30', end: '06:00' };
    if (w.on === false) return false;
    const d = new Date(), t = d.getHours() * 60 + d.getMinutes(), a = winMin(w.start), b = winMin(w.end);
    return a <= b ? (t >= a && t < b) : (t >= a || t < b);
  }

  // ---- UI helpers ------------------------------------------------------------------
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // A tap, not a scroll: the touch must start and end on this node and move
  // less than 10px in between. Scrolling pages (the night page, the pause
  // screen) used to fire buttons a finger merely passed over.
  // `once` (the default) latches after the first tap, so a button that leaves
  // the page cannot fire twice. Controls meant to be tapped again — the feeling
  // chips, where changing your mind is the point — pass { once: false }.
  function onTap(node, fn, opts) {
    const once = !(opts && opts.once === false);
    let armed = false, moved = false, used = false, sx = 0, sy = 0;
    node.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0]; if (!t) return;
      armed = true; moved = false; sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    node.addEventListener('touchmove', (e) => {
      const t = e.touches && e.touches[0]; if (!t) return;
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
    }, { passive: true });
    node.addEventListener('touchcancel', () => { armed = false; moved = false; });
    const run = (e) => {
      if (used || node.disabled) return;
      if (e.type === 'touchend') {
        const ok = armed && !moved; armed = false;
        if (!ok) { moved = false; return; }
      } else if (moved) { moved = false; return; }     // a click synthesised after a drag
      if (once) used = true;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      fn();
    };
    node.addEventListener('touchend', run, { passive: false });
    node.addEventListener('click', run);
  }
  const hhmm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Hide the page immediately so nothing flashes before the pause is drawn.
  // At document_start <html> may not exist yet, so wait for it rather than
  // throwing (which would silently kill the whole script).
  const veil = document.createElement('style');
  veil.textContent = 'html.kg-pause-veil > body { visibility: hidden !important; }';
  let veiled = false, watchdog = null;
  function applyVeil() {
    const root = document.documentElement;
    if (!root) {
      new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); applyVeil(); } })
        .observe(document, { childList: true });
      return;
    }
    if (veiled) return;
    veiled = true;
    (document.head || root).appendChild(veil);
    root.classList.add('kg-pause-veil');
  }
  applyVeil();
  const unveil = () => {
    veiled = true;                                   // never veil after this
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    if (document.documentElement) document.documentElement.classList.remove('kg-pause-veil');
    veil.remove();
  };
  // Two ways the veil could strand a page invisible, both closed here. The
  // decision now starts at document_start rather than waiting for
  // DOMContentLoaded, which on a slow page meant seconds of blank screen on
  // every site, pause site or not; and this watchdog lifts the veil regardless
  // if storage never answers. A flash of the page is a far smaller failure
  // than a site that will not show itself.
  watchdog = setTimeout(unveil, 1500);

  function mount() {
    const root = el('div', 'kg-pause');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    const page = el('div', 'kg-pause-page');
    root.appendChild(page);
    document.documentElement.classList.add('kg-checkin-open');
    (document.body || document.documentElement).appendChild(root);
    // The overlay is opaque, so the page can be shown behind it now.
    unveil();
    const close = () => { root.remove(); document.documentElement.classList.remove('kg-checkin-open'); };
    return { root, page, close };
  }

  function breathing(page) {
    const wrap = el('div', 'kg-pause-breath');
    const ring = el('div', 'kg-pause-ring');
    const cue = el('div', 'kg-pause-cue');
    wrap.append(ring, cue);
    page.appendChild(wrap);
    // 4 s in, 6 s out, until the screen goes away.
    let inhale = true;
    const step = () => {
      if (!wrap.isConnected) return;
      ring.className = 'kg-pause-ring ' + (inhale ? 'kg-in' : 'kg-out');
      cue.textContent = inhale ? 'Breathe in' : 'Breathe out, slowly';
      setTimeout(step, inhale ? 4000 : 6000);
      inhale = !inhale;
    };
    step();
    return wrap;
  }

  function success(page, title, msg) {
    page.replaceChildren();
    const box = el('div', 'kg-pause-success');
    box.appendChild(el('div', 'kg-pause-check', '✓'));
    box.appendChild(el('h1', 'kg-pause-title', title));
    box.appendChild(el('p', 'kg-pause-sub', msg));
    page.appendChild(box);
  }


  // ---- "Talk it through with Claude" ------------------------------------------
  // claude.ai no longer accepts a prefilled prompt in the URL, so: compose,
  // copy, open, paste. The message names the moment, never the site.
  function claudePrompt(ctx) {
    const when = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bits = [`It's ${when}` + (ctx.window ? ` \u2014 ${ctx.window.toLowerCase()}` : '') + '.'];
    bits.push('I just reached for something I\u2019m trying to use less.');
    if (ctx.feeling) bits.push(`What I\u2019m feeling: ${ctx.feeling.toLowerCase()}.`);
    if (ctx.plan) bits.push(`The thing I planned to do instead: ${ctx.plan}.`);
    bits.push('Talk me through the next five minutes. Help me notice what I actually need right now and decide whether to do the plan. Be brief and warm, no lecture, one question at a time.');
    return bits.join(' ');
  }
  async function talkToClaude(ctx) {
    const text = claudePrompt(ctx);
    try { await navigator.clipboard.writeText(text); } catch { /* paste will just be manual */ }
    location.href = 'https://claude.ai/new';
  }
  function claudeButton(cls, ctx) {
    const b = el('button', cls, 'Talk it through with Claude');
    b.type = 'button';
    onTap(b, () => talkToClaude(ctx));
    return b;
  }

  // ---- NSDR ---------------------------------------------------------------------------
  // Huberman Lab's 20-minute Non-Sleep Deep Rest. It lives on YouTube, so a
  // short pass lets that one video through the check-in and the night page.
  const NSDR_URL = 'https://www.youtube.com/watch?v=hEypv90GzDE&autoplay=1';
  async function openNsdr(url) {
    await save({ fgNsdrPassUntil: Date.now() + 25 * 60 * 1000 });
    location.href = safeUrl(url) || NSDR_URL;
  }

  // ---- screens ------------------------------------------------------------------------
  async function logEvent(log, ev) {
    log.push(ev);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    await save({ fgPauseLog: log });
  }

  // Compassionate review of the last "went ahead" outside the goal, shown once.
  function renderReview(data, ev, next) {
    const { page, close } = mount();
    const log = data.fgPauseLog;
    page.appendChild(el('div', 'kg-pause-kicker', 'Last time'));
    page.appendChild(el('h1', 'kg-pause-title', 'One slip doesn’t undo progress.'));
    page.appendChild(el('p', 'kg-pause-sub', 'It was outside your goal (' + (ev.why || 'your rule') + '). What was going on?'));
    const grid = el('div', 'kg-pause-grid');
    for (const [k, label] of TRIGGERS) {
      const b = el('button', 'kg-pause-chip', label); b.type = 'button';
      onTap(b, async () => {
        ev.trigger = ev.trigger || k; ev.reviewed = true;
        await save({ fgPauseLog: log });
        page.replaceChildren();
        page.appendChild(el('div', 'kg-pause-kicker', 'Next time'));
        const alt = Object.assign({}, DEFAULT_ALTS, data.fgPauseAlts || {})[k];
        page.appendChild(el('h1', 'kg-pause-title', alt ? `When you’re ${label.toLowerCase()}: ${alt}.` : `When you’re ${label.toLowerCase()}, what would help?`));
        page.appendChild(el('p', 'kg-pause-sub', alt ? 'That’s the plan. Nothing else to do here.' : 'Set one in the popup under Pause → replacement actions. Even a small one.'));
        const go = el('button', 'kg-pause-btn kg-pause-primary', 'OK'); go.type = 'button';
        onTap(go, () => { close(); next(); });
        page.appendChild(go);
      });
      grid.appendChild(b);
    }
    page.appendChild(grid);
    const skip = el('button', 'kg-pause-link', 'Skip'); skip.type = 'button';
    onTap(skip, async () => { ev.reviewed = true; await save({ fgPauseLog: log }); close(); next(); });
    page.appendChild(skip);
  }

  function renderPause(data) {
    const log = data.fgPauseLog;
    const alts = Object.assign({}, DEFAULT_ALTS, data.fgPauseAlts || {});
    const goal = goalCheck(data.fgPauseGoal);
    const night = isNightNow(data.fgWindows);
    const seconds = goal.ok ? 5 : Math.min(20, Math.max(10, Number(data.fgPauseSeconds) || 15));
    const { page, close } = mount();
    let trigger = null;

    page.appendChild(el('div', 'kg-pause-kicker', (night ? 'Pause · Night · ' : 'Pause · ') + hhmm(new Date())));
    page.appendChild(el('h1', 'kg-pause-title', goal.ok ? 'Within your goal. Take a breath first.' : 'Outside your goal — ' + goal.why + '.'));
    page.appendChild(el('p', 'kg-pause-sub', night
      ? 'It’s late. Urges are louder at night and pass just as fast — this is the crest.'
      : 'Urges crest and fade within minutes. This is the crest.'));
    breathing(page);

    page.appendChild(el('p', 'kg-pause-q', 'What are you feeling right now?'));
    const grid = el('div', 'kg-pause-grid');
    const altBox = el('div', 'kg-pause-alt');
    for (const [k, label] of TRIGGERS) {
      const b = el('button', 'kg-pause-chip', label); b.type = 'button';
      onTap(b, () => {
        trigger = k;
        for (const c of grid.querySelectorAll('.kg-pause-chip')) c.classList.toggle('kg-on', c === b);
        altBox.replaceChildren();
        const alt = alts[k];
        if (alt) {
          altBox.appendChild(el('p', 'kg-pause-sub', `When you’re ${label.toLowerCase()}, you planned:`));
          const a = el('button', 'kg-pause-btn kg-pause-primary', alt); a.type = 'button';
          onTap(a, async () => {
            await logEvent(log, { t: Date.now(), trigger: k, outcome: 'alt', within: goal.ok, why: goal.why });
            success(page, 'Logged: ' + alt + '.', 'That’s the habit changing — the cue stays, the response moves. Off you go.');
          });
          altBox.appendChild(a);
        } else {
          altBox.appendChild(el('p', 'kg-pause-sub', `No replacement set for “${label.toLowerCase()}” yet — add one in the popup. Even something small helps.`));
        }
        if (k === 'tired') {
          // Tired is the one feeling with a specific, well-supported answer.
          const n = el('button', 'kg-pause-btn', '20-minute NSDR (Huberman) — lie down, eyes closed');
          n.type = 'button';
          onTap(n, async () => {
            await logEvent(log, { t: Date.now(), trigger: k, outcome: 'alt', within: goal.ok, why: goal.why });
            openNsdr();
          });
          altBox.appendChild(n);
        }
        if (data.fgClaudeOn) {
          altBox.appendChild(claudeButton('kg-pause-btn', { window: goal.ok ? '' : 'outside your goal', feeling: label, plan: alt || '' }));
        }
      }, { once: false });   // mis-tapped the wrong feeling? tap the right one
      grid.appendChild(b);
    }
    page.appendChild(grid);
    page.appendChild(altBox);

    const leave = el('button', 'kg-pause-btn', 'Leave'); leave.type = 'button';
    onTap(leave, async () => {
      await logEvent(log, { t: Date.now(), trigger, outcome: 'left', within: goal.ok, why: goal.why });
      success(page, 'Left.', 'Logged, nothing more. Close the tab when you’re ready.');
    });
    page.appendChild(leave);

    // At night, "continue" doesn't open the site: it hands over to the 10-minute
    // night timer (charger exit); only that timer's own continue lets you through.
    const contLabel = night ? 'Continue — 10 minutes first' : 'Continue anyway';
    const cont = el('button', 'kg-pause-link', `${contLabel} (${seconds})`); cont.type = 'button'; cont.disabled = true;
    let left = seconds;
    const tick = setInterval(() => {
      if (!cont.isConnected) { clearInterval(tick); return; }   // screen replaced under us
      left--;
      if (left <= 0) { clearInterval(tick); cont.disabled = false; cont.textContent = contLabel; }
      else cont.textContent = `${contLabel} (${left})`;
    }, 1000);
    onTap(cont, async () => {
      await logEvent(log, { t: Date.now(), trigger, outcome: 'continued', within: goal.ok, why: goal.why, reviewed: goal.ok });
      if (night) await save({ fgSnooze_night: Date.now() + 10 * 60 * 1000 });
      close();
      if (night) window.dispatchEvent(new CustomEvent('kg-pause-continued'));
    });
    page.appendChild(cont);

    page.appendChild(el('p', 'kg-pause-foot', 'Stays on this phone. Logged: the time, the feeling, what you chose. Never the site.'));
  }

  // The decision needs no DOM; only drawing does.
  const whenBody = (fn) => {
    if (document.body) { fn(); return; }
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  async function start() {
    const data = await load(['fgPauseOn', 'fgPauseSites', 'fgPauseSeconds', 'fgPauseGoal', 'fgPauseAlts', 'fgPauseLog', 'fgPauseLast', 'fgClaudeOn', 'fgWindows']);
    if (data.fgPauseOn === false || !matches(data.fgPauseSites)) { unveil(); return; }
    // A short grace after "continue anyway", so navigating within the site
    // doesn't re-pause every page.
    if (Date.now() - Number(data.fgPauseLast || 0) < 10 * 60 * 1000) { unveil(); return; }
    data.fgPauseLog = Array.isArray(data.fgPauseLog) ? data.fgPauseLog : [];
    const lastOut = [...data.fgPauseLog].reverse().find((e) => e.outcome === 'continued' && !e.within && !e.reviewed && Date.now() - e.t < 48 * 3600 * 1000);
    whenBody(() => {
      try {
        if (lastOut) renderReview(data, lastOut, () => renderPause(data));
        else renderPause(data);
        // Written only once the screen is actually up: a render that threw used
        // to spend the grace period anyway and leave the site unpaused for ten
        // minutes.
        save({ fgPauseLast: Date.now() });
      } catch { unveil(); }
    });
  }

  start().catch(unveil);
})();
