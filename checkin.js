// Kindgate — check-in (runs on both Instagram and YouTube)
//
// Two modes, chosen by the time of day:
//
//  * Outside your windows: "what were you feeling ten seconds ago?" — one tap
//    to log the cue, then a toast with the week's pattern. Noticing, no verdict.
//
//  * Inside a window (after work, night): the decision was made earlier, so the
//    card doesn't ask you to decide — it shows the plans you set, one tap each
//    (implementation intentions), offers a 10-minute delay instead of a flat
//    "no" (cravings decay), rewards the choice immediately with a win count and
//    streak, and puts a short countdown on "continue anyway" so the impulsive
//    path is slightly slower than the planned one.

(() => {
  'use strict';

  const HOST = location.hostname.replace(/^www\./, '');
  // Only the two sites this extension is about are named in the log. Everything
  // else is "other": at night the card appears on any site, and writing the
  // hostname into fgWins would quietly turn the win log into a browsing history
  // — which the popup can then copy to the clipboard.
  const SITE = /(^|\.)youtube\.com$/.test(HOST) ? 'youtube' : /(^|\.)instagram\.com$/.test(HOST) ? 'instagram' : 'other';
  const CORE = SITE === 'youtube' || SITE === 'instagram';   // daytime check-in only here
  const COOLDOWN_MS = 20 * 60 * 1000;
  const SNOOZE_MS = 10 * 60 * 1000;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const TOAST_MS = 6000;
  const CONTINUE_DELAY_S = 10;
  const MAX_ENTRIES = 3000;

  const CUES = [
    ['bored', 'Bored'], ['tired', 'Tired'], ['avoiding', 'Avoiding something'], ['transition', 'Between tasks'],
    ['lonely', 'Lonely'], ['stressed', 'Stressed'], ['habit', 'Just habit'], ['purpose', 'Came for something specific'],
  ];
  const LABEL = Object.fromEntries(CUES);

  const DEFAULT_WINDOWS = {
    morning: { on: true, start: '06:00', end: '08:30', name: 'Morning window' },
    work:    { on: true, start: '17:30', end: '20:00', name: 'After-work window' },
    night:   { on: true, start: '21:30', end: '06:00', name: 'Night window' },
  };
  const DEFAULT_MORNING_STEPS = [
    { label: 'Step out of bed', url: '' },
    { label: 'Sunlight \u2014 outside, 5\u201310 min', url: '' },
    { label: 'Glass of water', url: '' },
    { label: 'Make the bed', url: '' },
  ];
  const INERTIA_MS = 30 * 60 * 1000;   // the window the countdown shows
  const DEFAULT_PLANS = [
    { label: '20-minute walk', url: '' },
    { label: 'Cook something', url: '' },
    { label: 'Read', url: '' },
  ];

  // ---- storage ----------------------------------------------------------------
  const api = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser.storage.local
            : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local
            : null;
  // Without extension storage everything stays in memory for this page only.
  // The old fallback wrote the cue and win logs into the *visited site's* own
  // localStorage, where that site could read them straight back out.
  const memory = new Map();
  async function load(keys) {
    // A failed read must not fall through to the empty in-memory map: the
    // caller would then run on the built-in defaults and ignore what the
    // user actually set (a switched-off night mode, the allow-list). Let it
    // throw so the page loads unguarded instead.
    if (api) return api.get(keys);
    const out = {};
    for (const k of keys) if (memory.has(k)) out[k] = memory.get(k);
    return out;
  }
  async function save(obj) {
    if (api) { try { return await api.set(obj); } catch { /* fall through */ } }
    for (const k of Object.keys(obj)) memory.set(k, obj[k]);
  }

  // A plan's "instead" link and the wind-down link are typed by hand in the
  // popup, but they end up in location.href, where a "javascript:" string would
  // run as script in the page rather than navigate. Only real navigations pass.
  const SAFE_SCHEMES = /^(?:https?|mailto|tel|shortcuts|music|spotify|podcasts?|overcast|pocketcasts|pktc):/i;
  function safeUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return 'https://' + s.replace(/^\/+/, '');   // "example.com"
    return SAFE_SCHEMES.test(s) ? s : '';
  }

  // ---- time windows -----------------------------------------------------------
  // Strict, so a corrupt stored time cannot turn into NaN and silently switch a
  // window off with no way to tell why.
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? '' : hhmm).trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return (h > 23 || min > 59) ? null : h * 60 + min;
  };
  function inWindow(w, key, now = new Date()) {
    if (!w || !w.on) return false;
    const t = now.getHours() * 60 + now.getMinutes();
    const def = DEFAULT_WINDOWS[key] || {};
    const a = toMin(w.start) ?? toMin(def.start), b = toMin(w.end) ?? toMin(def.end);
    if (a === null || b === null) return false;
    return a <= b ? (t >= a && t < b) : (t >= a || t < b);   // b < a wraps past midnight
  }
  function activeWindow(windows) {
    const w = Object.assign({}, DEFAULT_WINDOWS, windows || {});
    for (const k of ['night', 'morning', 'work']) if (inWindow(w[k], k)) return Object.assign({ key: k }, w[k]);   // night wins, then morning
    return null;
  }

  // ---- stats ------------------------------------------------------------------
  function summarise(entries) {
    const since = Date.now() - WEEK_MS;
    const week = entries.filter((e) => e.t >= since);
    const counts = {};
    for (const e of week) counts[e.cue] = (counts[e.cue] || 0) + 1;
    return { total: week.length, top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3) };
  }
  function winStats(wins) {
    const since = Date.now() - WEEK_MS;
    const week = wins.filter((w) => w.t >= since).length;
    // Streak: consecutive calendar days (ending today or yesterday) with a win.
    const days = new Set(wins.map((w) => new Date(w.t).toDateString()));
    let streak = 0;
    const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    return { week, streak };
  }

  // ---- UI helpers -------------------------------------------------------------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  // A tap, not a scroll: the touch must start and end on this node and move
  // less than 10px in between. Scrolling pages (the night page, the pause
  // screen) used to fire buttons a finger merely passed over.
  // `once` (the default) latches after the first tap, so a button that leaves
  // the page cannot fire twice. Controls that are meant to be tapped again —
  // a checklist item, a chip you can change your mind about — pass
  // { once: false }; without it the second tap was silently dropped.
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
  function leave(url) {
    const to = safeUrl(url);
    if (to) { location.href = to; return; }
    try { window.close(); } catch { /* ignore */ }
    location.replace('about:blank');
  }
  function showToast(text, extra) {
    const toast = el('div', 'kg-toast');
    toast.appendChild(el('span', 'kg-toast-text', text));
    if (extra) {
      const x = el('button', 'kg-toast-btn kg-toast-extra', extra.label);
      x.type = 'button';
      onTap(x, extra.fn);
      toast.appendChild(x);
    }
    const out = el('button', 'kg-toast-btn', 'Leave instead');
    out.type = 'button';
    onTap(out, () => leave());
    toast.appendChild(out);
    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('kg-toast-in'));
    setTimeout(() => { toast.classList.remove('kg-toast-in'); setTimeout(() => toast.remove(), 400); }, TOAST_MS);
  }
  const hhmm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---- Safari toolbar tint ----------------------------------------------------
  // Safari on iOS colours its address bar and toolbar from the page's
  // <meta name="theme-color">. Kindgate pages are fixed overlays, so the host
  // site's tint (white on YouTube) would otherwise sit under a black night
  // page. Safari honours the first matching theme-color meta, so ours goes to
  // the front of <head> while a page is up and comes out again on close.
  let themeMeta = null;
  function themeColor(color) {
    if (!color) { if (themeMeta) themeMeta.remove(); themeMeta = null; return; }
    if (!themeMeta) { themeMeta = document.createElement('meta'); themeMeta.name = 'theme-color'; }
    themeMeta.content = color;
    const head = document.head || document.documentElement;
    if (head && head.firstChild !== themeMeta) head.insertBefore(themeMeta, head.firstChild);
  }
  // A brand token from brand.css, so the tint always matches the page.
  const brand = (name, fallback) =>
    (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;

  // ---- quotes for the timer page ------------------------------------------------
  // Only quotes with a solid attribution; the internet's favourites are often
  // misattributed, and a wrong name on a wall is a small daily untruth.
  const QUOTES = [
    ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
    ['How we spend our days is, of course, how we spend our lives.', 'Annie Dillard'],
    ['You do not rise to the level of your goals. You fall to the level of your systems.', 'James Clear'],
    ['Nothing is so exhausting as indecision, and nothing is so futile.', 'Bertrand Russell'],
    ['Almost everything will work again if you unplug it for a few minutes, including you.', 'Anne Lamott'],
    ['Attention is the beginning of devotion.', 'Mary Oliver'],
    ['Tell me, what is it you plan to do with your one wild and precious life?', 'Mary Oliver'],
    ['Be regular and orderly in your life, so that you may be violent and original in your work.', 'Gustave Flaubert'],
    ['What you do every day matters more than what you do once in a while.', 'Gretchen Rubin'],
    ['A year from now you may wish you had started today.', 'Karen Lamb'],
    ['Either you run the day or the day runs you.', 'Jim Rohn'],
    ['Do the hard jobs first. The easy jobs will take care of themselves.', 'Dale Carnegie'],
    ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant, on Aristotle'],
    ['The present moment is the only time over which we have dominion.', 'Thích Nhất Hạnh'],
    ['Rest is not idleness.', 'John Lubbock'],
    ['You\u2019ll never change your life until you change something you do daily.', 'John C. Maxwell'],
    ['The best time to plant a tree was twenty years ago. The second best time is now.', 'Proverb'],
    ['No man ever steps in the same river twice.', 'Heraclitus'],
  ];
  const pickQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];

  const pad2 = (n) => String(n).padStart(2, '0');

  // Full-screen timer. Runs off an absolute end time, so it stays right after
  // you switch apps and come back.
  function renderTimer(data, win, until) {
    const wins = Array.isArray(data.fgWins) ? data.fgWins : [];
    const plans = win.key === 'morning'
      ? ((Array.isArray(data.fgMorningSteps) && data.fgMorningSteps.length ? data.fgMorningSteps : DEFAULT_MORNING_STEPS)
          .filter((p) => p && p.label && p.label.trim()))
      : win.key === 'night'
      ? [{ label: 'Phone on the charger \u2014 goodnight', url: '', win: 'Charger in another room' }]
      : (Array.isArray(data.fgPlans) && data.fgPlans.length ? data.fgPlans : DEFAULT_PLANS)
          .filter((p) => p && p.label && p.label.trim());

    // Quiet anything playing underneath.
    for (const v of document.querySelectorAll('video')) { try { v.pause(); } catch { /* ignore */ } }

    const root = el('div', 'kg-timer' + (win.key === 'night' ? ' kg-timer-night' : ''));
    themeColor(win.key === 'night' ? '#000' : brand('--kg-ink-deep', '#151310'));
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.documentElement.classList.add('kg-checkin-open');
    (document.body || document.documentElement).appendChild(root);
    let tick = null;
    const close = () => { clearInterval(tick); themeColor(null); root.remove(); document.documentElement.classList.remove('kg-checkin-open'); };

    root.appendChild(el('div', 'kg-timer-kicker', win.name));
    const clock = el('div', 'kg-timer-clock', '10:00');
    root.appendChild(clock);
    const line = el('p', 'kg-timer-line', 'Most urges are gone before this reaches zero.');
    root.appendChild(line);

    const [q, who] = pickQuote();
    const quote = el('blockquote', 'kg-timer-quote');
    quote.appendChild(el('p', null, '\u201C' + q + '\u201D'));
    quote.appendChild(el('cite', null, '\u2014 ' + who));
    root.appendChild(quote);

    const grid = el('div', 'kg-grid kg-grid-plans kg-timer-plans');
    for (const p of plans) {
      const b = el('button', 'kg-chip kg-chip-plan', p.label.trim());
      b.type = 'button';
      onTap(b, async () => {
        if (win.key === 'night') {
          // Stay on the dark page and show the win; no blank page at night.
          clearInterval(tick);
          const s = await logWin(wins, (p.win || p.label).trim(), win.key);
          renderSuccess(root, s, 'Goodnight. Lights low, phone face down \u2014 you\u2019re done here.');
          return;
        }
        close();
        const s = await logWin(wins, (p.win || p.label).trim(), win.key);
        showToast(`Win ${s.week} this week.` + (s.streak >= 2 ? ` ${s.streak}-day streak.` : '') + ' Off you go.');
        setTimeout(() => leave(p.url && p.url.trim()), 900);
      });
      grid.appendChild(b);
    }
    root.appendChild(grid);

    if (data.fgClaudeOn && win.key !== 'night') {
      root.appendChild(claudeButton('kg-chip kg-chip-plan kg-timer-claude', { window: win.name, plan: plans.map((p) => p.label.trim()).join(' / ') }));
    }

    const cont = el('button', 'kg-link kg-timer-continue', `Continue anyway (${CONTINUE_DELAY_S})`);
    cont.type = 'button';
    cont.disabled = true;
    let unlock = CONTINUE_DELAY_S;
    onTap(cont, async () => { close(); if (win.key === 'night') grantTabPass(); await save({ [LAST]: Date.now(), [SNOOZE]: 0 }); });
    root.appendChild(cont);

    let done = false;
    tick = setInterval(() => {
      if (!root.isConnected) { clearInterval(tick); return; }
      const left = Math.max(0, until - Date.now());
      const s = Math.ceil(left / 1000);
      clock.textContent = pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
      if (unlock > 0) { unlock--; cont.textContent = unlock > 0 ? `Continue anyway (${unlock})` : 'Continue anyway'; if (unlock === 0) cont.disabled = false; }
      if (left === 0 && !done) {
        done = true;
        root.classList.add('kg-timer-done');
        line.textContent = 'Ten minutes are up. Still want it, or was that the urge talking?';
        cont.textContent = 'Continue';
        cont.disabled = false;
      }
    }, 1000);
    // Paint the first second immediately.
    const s0 = Math.ceil(Math.max(0, until - Date.now()) / 1000);
    clock.textContent = pad2(Math.floor(s0 / 60)) + ':' + pad2(s0 % 60);
  }

  // ---- "Can't sleep?" -------------------------------------------------------------
  // CBT-I stimulus control (get out of bed, no clock-watching, fixed wake time)
  // plus the two tools Huberman recommends for the 3am wake-up: keep light very
  // low, and the physiological sigh (Balban et al. 2023). Drawn in dim amber on
  // black on purpose — the screen itself should not be a light source.
  const SLEEP_STEPS = [
    ['Get out of bed', 'Awake 20 minutes? Get up, sit somewhere dim. Back to bed only when sleepy.'],
    ['Keep the light low', 'No overhead lights. Screen as dim as it goes.'],
    ['Slow the body down', 'Two breaths in through the nose, one long one out through the mouth.'],
    ['Don\u2019t check the time', 'Phone face down. Counting lost hours keeps you awake.'],
    ['Same wake time tomorrow', 'Whatever tonight does, get up at the usual time.'],
  ];

  async function logWin(wins, label, windowKey) {
    wins.push({ t: Date.now(), site: SITE, plan: label, window: windowKey });
    if (wins.length > MAX_ENTRIES) wins.splice(0, wins.length - MAX_ENTRIES);
    await save({ fgWins: wins, [LAST]: Date.now(), [SNOOZE]: 0 });
    return winStats(wins);
  }

  // Replaces a dark page's contents with a "win logged" state. Nothing to tap:
  // the next move is locking the phone, and a blank page is not a reward.
  function renderSuccess(host, stats, msg) {
    host.replaceChildren();
    const box = el('div', 'kg-success');
    box.appendChild(el('div', 'kg-success-check', '\u2713'));
    box.appendChild(el('div', 'kg-success-kicker', 'Win logged'));
    box.appendChild(el('h1', 'kg-success-title', `Win ${stats.week} this week` + (stats.streak >= 2 ? ` \u00B7 ${stats.streak}-day streak` : '')));
    box.appendChild(el('p', 'kg-success-msg', msg));
    host.appendChild(box);
  }

  function renderSleep(data, win) {
    const wins = Array.isArray(data.fgWins) ? data.fgWins : [];
    const nsdr = (data.fgNsdrUrl || '').trim();
    for (const v of document.querySelectorAll('video')) { try { v.pause(); } catch { /* ignore */ } }

    const root = el('div', 'kg-sleep');
    themeColor('#000');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.documentElement.classList.add('kg-checkin-open');
    (document.body || document.documentElement).appendChild(root);
    let breathTimer = null;
    const close = () => { if (breathTimer) clearTimeout(breathTimer); themeColor(null); root.remove(); document.documentElement.classList.remove('kg-checkin-open'); };

    // Audio opens another app, so it navigates; everything else stays here.
    const winAndStay = async (label, msg) => {
      if (breathTimer) clearTimeout(breathTimer);
      const s = await logWin(wins, label);
      renderSuccess(page, s, msg);
    };

    const page = el('div', 'kg-sleep-page');
    root.appendChild(page);
    page.appendChild(el('div', 'kg-sleep-kicker', `${win.name} \u00B7 ${hhmm(new Date())}`));
    page.appendChild(el('h1', 'kg-sleep-title', 'It\u2019s late. The urge is loud, but it passes in minutes.'));
    page.appendChild(el('p', 'kg-sleep-sub', 'Here\u2019s what actually helps:'));

    const ol = el('ol', 'kg-sleep-steps');
    for (const [h, body] of SLEEP_STEPS) {
      const li = el('li');
      li.appendChild(el('strong', null, h));
      li.appendChild(el('p', null, body));
      ol.appendChild(li);
    }
    page.appendChild(ol);

    // Breathing guide: physiological sigh, 8 cycles (~2 min).
    const guide = el('div', 'kg-breath');
    const ring = el('div', 'kg-breath-ring');
    const cue = el('div', 'kg-breath-cue', 'Physiological sigh \u00B7 8 rounds');
    const count = el('div', 'kg-breath-count', '');
    guide.append(ring, cue, count);
    page.appendChild(guide);

    const startBtn = el('button', 'kg-sleep-btn kg-sleep-primary', 'Start the breathing guide');
    startBtn.type = 'button';
    page.appendChild(startBtn);

    const PHASES = [
      ['Breathe in through your nose', 'in', 2600],
      ['\u2026and a little more in', 'in2', 1400],
      ['Long, slow breath out through your mouth', 'out', 6000],
    ];
    function runBreathing() {
      startBtn.remove();
      let round = 0, phase = 0;
      const step = () => {
        if (phase === 0) { round++; if (round > 8) { finish(); return; } count.textContent = `Round ${round} of 8`; }
        const [text, cls, ms] = PHASES[phase];
        cue.textContent = text;
        ring.className = 'kg-breath-ring kg-breath-' + cls;
        phase = (phase + 1) % PHASES.length;
        breathTimer = setTimeout(step, ms);
      };
      const finish = () => {
        ring.className = 'kg-breath-ring';
        winAndStay('Breathing guide', 'Eight rounds done. Lights low, phone face down, back to bed when you feel sleepy.');
      };
      step();
    }
    onTap(startBtn, runBreathing);

    {
      const a = el('button', 'kg-sleep-btn', nsdr ? 'Play your wind-down audio' : '20-minute NSDR (Huberman)');
      a.type = 'button';
      onTap(a, async () => { close(); await logWin(wins, 'Wind-down audio'); openNsdr(nsdr); });
      page.appendChild(a);
    }

    const done = el('button', 'kg-sleep-btn', 'Phone on the charger \u2014 goodnight');
    done.type = 'button';
    onTap(done, () => winAndStay('Charger in another room', 'Goodnight. Lights low, phone face down \u2014 you\u2019re done here.'));
    page.appendChild(done);

    // Bottom: the 10-minute delay, then the slow "continue".
    const ten = el('button', 'kg-sleep-btn kg-sleep-ten', 'Give it 10 minutes');
    ten.type = 'button';
    onTap(ten, async () => {
      close();
      const until = Date.now() + SNOOZE_MS;
      await save({ [SNOOZE]: until });
      renderTimer(data, win, until);
    });
    page.appendChild(ten);

    const cont = continueLink(page, async () => { close(); grantTabPass(); await save({ [LAST]: Date.now(), [SNOOZE]: 0 }); });
    cont.classList.add('kg-sleep-link');

    page.appendChild(el('p', 'kg-sleep-note',
      'Three or more nights a week for months? That\u2019s insomnia \u2014 CBT-I with a clinician works; an app doesn\u2019t.'));
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

  // ---- morning ------------------------------------------------------------------
  // Sleep inertia: for roughly 15-30 minutes after waking the anterior cortical
  // regions are still coming back up (Balkin et al. 2002), so executive control
  // is at its weakest and behaviour runs on whatever is cued by the context
  // (Neal, Wood & Drolet 2013). The page therefore asks nothing and decides
  // nothing - it just shows the sequence that was chosen the night before.
  function morningsKept(wins) {
    const since = Date.now() - WEEK_MS;
    return new Set(wins.filter((w) => w.t >= since && w.window === 'morning')
      .map((w) => new Date(w.t).toDateString())).size;
  }

  const today = () => new Date().toDateString();
  const DEFAULT_COFFEE_MIN = 90;   // caffeine blocks adenosine rather than clearing it

  // "Up" is when you ticked the first step, else when the page first appeared.
  const wokeAt = (p) => (p && p.day === today()) ? (p.wokeAt || p.started || 0) : 0;
  const coffeeAt = (data) => {
    const w = wokeAt(data.fgMorningProgress);
    return w ? w + (Number(data.fgCoffeeDelay) || DEFAULT_COFFEE_MIN) * 60000 : 0;
  };

  function coffeeToast(mins) {
    const toast = el('div', 'kg-toast kg-toast-coffee');
    toast.appendChild(el('span', 'kg-toast-text',
      `\u2615 Coffee\u2019s fine now \u2014 it\u2019s been ${mins} minutes since you got up.`));
    const ok = el('button', 'kg-toast-btn', 'Got it');
    ok.type = 'button';
    onTap(ok, async () => { await save({ fgCoffeeAck: today() }); toast.remove(); });
    toast.appendChild(ok);
    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('kg-toast-in'));
  }

  async function maybeCoffeeAlert(data) {
    if (document.querySelector('.kg-checkin, .kg-sleep, .kg-timer, .kg-morning, .kg-pause, .kg-toast')) return;
    const at = coffeeAt(data);
    if (!at || Date.now() < at) return;
    if (data.fgCoffeeAck === today()) return;
    if (Date.now() - at > 6 * 3600 * 1000) return;     // stale; don't nag all evening
    coffeeToast(Number(data.fgCoffeeDelay) || DEFAULT_COFFEE_MIN);
  }
  function morningProgress(data) {
    const p = data.fgMorningProgress;
    return (p && p.day === today()) ? p : { day: today(), done: [], started: 0, complete: false };
  }

  function renderMorning(data, win) {
    const wins = Array.isArray(data.fgWins) ? data.fgWins : [];
    const steps = (Array.isArray(data.fgMorningSteps) && data.fgMorningSteps.length ? data.fgMorningSteps : DEFAULT_MORNING_STEPS)
      .filter((p) => p && p.label && p.label.trim()).map((p) => p.label.trim());
    const prog = morningProgress(data);
    if (!prog.started) prog.started = Date.now();          // the countdown starts the first time you see this
    const coffeeMin = Number(data.fgCoffeeDelay) || DEFAULT_COFFEE_MIN;
    const done = new Set(prog.done || []);
    for (const v of document.querySelectorAll('video')) { try { v.pause(); } catch { /* ignore */ } }

    const root = el('div', 'kg-morning');
    themeColor('#241b14');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.documentElement.classList.add('kg-checkin-open');
    (document.body || document.documentElement).appendChild(root);
    const page = el('div', 'kg-morning-page');
    root.appendChild(page);
    let tick = null;
    const close = () => { if (tick) clearInterval(tick); themeColor(null); root.remove(); document.documentElement.classList.remove('kg-checkin-open'); };
    const persist = () => save({ fgMorningProgress: { day: today(), done: [...done], started: prog.started, wokeAt: prog.wokeAt || 0, complete: done.size >= steps.length } });

    page.appendChild(el('div', 'kg-morning-kicker', `${win.name} \u00B7 ${hhmm(new Date())}`));
    page.appendChild(el('h1', 'kg-morning-title', 'Your head is still coming online.'));

    const clock = el('div', 'kg-morning-clock', '');
    page.appendChild(clock);
    const note = el('p', 'kg-morning-sub',
      'For the first 15\u201330 minutes after waking, the parts of your brain that weigh things up are still returning to full blood flow. Don\u2019t decide anything yet \u2014 just run the list.');
    page.appendChild(note);

    // Created here so paint() can reference them; appended below the list.
    const coffee = el('div', 'kg-coffee');
    const coffeeLine = el('div', 'kg-coffee-line', '');
    coffee.append(coffeeLine, el('div', 'kg-coffee-why',
      'Caffeine blocks adenosine rather than clearing it, so an early coffee masks a process that is still finishing. Waiting lets the cortisol rise do it first.'));

    const paintCoffee = () => {
      const from = prog.wokeAt || prog.started;
      const at = from + coffeeMin * 60000;
      const left = at - Date.now();
      const t = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (left <= 0) { coffee.classList.add('kg-coffee-ready'); coffeeLine.textContent = '\u2615 Coffee\u2019s fine now.'; }
      else {
        const total = Math.floor(left / 1000);
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
        const togo = h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`;
        coffeeLine.textContent = `\u2615 Coffee at ${t} \u2014 ${togo} to go`;
      }
    };

    const paint = () => {
      if (!root.isConnected) { if (tick) clearInterval(tick); return; }
      paintCoffee();
      const left = Math.max(0, prog.started + INERTIA_MS - Date.now());
      const sec = Math.ceil(left / 1000);
      clock.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      if (left === 0) {
        clock.classList.add('kg-morning-clock-done');
        note.textContent = 'You should be up to speed now. Finish the list and the day is yours.';
      }
    };
    paint();
    tick = setInterval(paint, 1000);

    const finish = async () => {
      if (tick) clearInterval(tick);
      await persist();
      const stats = await logWin(wins, 'Morning routine', 'morning');
      renderSuccess(page, stats, 'Whole list done. That\u2019s the morning started \u2014 you won\u2019t see this again today.');
    };

    const list = el('ol', 'kg-check');
    steps.forEach((label, i) => {
      const li = el('li', 'kg-check-item' + (done.has(label) ? ' kg-check-done' : ''));
      const box = el('span', 'kg-check-box', done.has(label) ? '\u2713' : String(i + 1));
      const txt = el('span', 'kg-check-label', label);
      li.append(box, txt);
      li.setAttribute('role', 'button');
      onTap(li, async () => {
        if (done.has(label)) { done.delete(label); li.classList.remove('kg-check-done'); box.textContent = String(i + 1); }
        else {
          done.add(label); li.classList.add('kg-check-done'); box.textContent = '\u2713';
          if (i === 0 && !prog.wokeAt) { prog.wokeAt = Date.now(); }   // first step = you're up
        }
        if (done.size >= steps.length) { await finish(); return; }
        persist();
      }, { once: false });   // ticking is a toggle: it has to take a second tap
      list.appendChild(li);
    });
    page.appendChild(list);

    page.appendChild(coffee);   // live countdown, under the list

    // One tap into Shortcuts, with the minutes as input. Shortcuts is the only
    // app here with a documented URL scheme — Clock and Reminders have none.
    const shortcut = (data.fgShortcutName || '').trim();
    if (shortcut) {
      const sc = el('button', 'kg-morning-btn kg-morning-shortcut', `Start a ${coffeeMin}-minute timer`);
      sc.type = 'button';
      // Always the minutes as plain text. The shortcut owns the rest (timer
      // or reminder, and any date maths), so there is only one thing to build.
      const payload = () => String(coffeeMin);
      onTap(sc, () => {
        // x-callback-url: if Shortcuts can't find the name, it sends us back
        // here with a marker instead of failing silently in another app.
        const back = location.origin + location.pathname + location.search;
        const url = 'shortcuts://x-callback-url/run-shortcut?name=' + encodeURIComponent(shortcut) +
                    '&input=text&text=' + encodeURIComponent(payload()) +
                    '&x-error=' + encodeURIComponent(back + '#kg-sc-error');
        if (!prog.wokeAt) { prog.wokeAt = Date.now(); persist(); }
        location.href = url;
      }, { once: false });   // Shortcuts may bounce straight back; allow a retry
      page.appendChild(sc);
      page.appendChild(el('p', 'kg-morning-hint',
        `Runs \u201C${shortcut}\u201D with \u201C${payload()}\u201D as its input. Nothing happening? The name has to match exactly.`));
    }

    const ten = el('button', 'kg-morning-btn', 'Give it 10 minutes');
    ten.type = 'button';
    onTap(ten, async () => {
      close();
      const until = Date.now() + SNOOZE_MS;
      await save({ [SNOOZE]: until });
      renderTimer(data, win, until);
    });
    page.appendChild(ten);

    continueLink(page, async () => { close(); await persist(); await save({ [LAST]: Date.now() }); })
      .classList.add('kg-morning-link');

    const kept = morningsKept(wins);
    page.appendChild(el('p', 'kg-morning-foot', kept
      ? `Kept ${kept} of the last 7 mornings.`
      : 'No streaks here. One morning at a time.'));
  }

  // ---- card -------------------------------------------------------------------
  function mount() {
    const root = el('div', 'kg-checkin');
    themeColor(brand('--kg-ink', '#1F1D1A'));
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    const card = el('div', 'kg-card');
    root.appendChild(card);
    document.documentElement.classList.add('kg-checkin-open');
    (document.body || document.documentElement).appendChild(root);
    const close = () => { themeColor(null); root.remove(); document.documentElement.classList.remove('kg-checkin-open'); };
    return { card, close };
  }

  // "Continue anyway" that only becomes tappable after a short countdown.
  function continueLink(card, onContinue) {
    const link = el('button', 'kg-link', `Continue anyway (${CONTINUE_DELAY_S})`);
    link.type = 'button';
    link.disabled = true;
    let left = CONTINUE_DELAY_S;
    const tick = setInterval(() => {
      if (!link.isConnected) { clearInterval(tick); return; }   // card closed under us
      left--;
      if (left <= 0) { clearInterval(tick); link.disabled = false; link.textContent = 'Continue anyway'; }
      else link.textContent = `Continue anyway (${left})`;
    }, 1000);
    onTap(link, onContinue);
    card.appendChild(link);
    return link;
  }

  // Mode A — the feeling check-in (outside windows)
  function renderCue(data) {
    const entries = Array.isArray(data.fgCues) ? data.fgCues : [];
    const { card, close } = mount();
    card.appendChild(el('div', 'kg-kicker', 'Quick check-in'));
    card.appendChild(el('h1', 'kg-title', 'What were you feeling 10 seconds ago?'));
    card.appendChild(el('p', 'kg-sub', 'No right answer. Just notice.'));
    const grid = el('div', 'kg-grid');
    for (const [key, label] of CUES) {
      const b = el('button', 'kg-chip', label);
      b.type = 'button';
      onTap(b, async () => {
        close();
        entries.push({ t: Date.now(), site: SITE, cue: key });
        if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
        await save({ fgCues: entries, [LAST]: Date.now() });
        const s = summarise(entries);
        showToast(s.total <= 1 ? `${LABEL[key]}. First one logged.`
          : `${LABEL[key]}. This week: ` + s.top.map(([k, n]) => `${LABEL[k]} ×${n}`).join(', '),
          key === 'tired' ? { label: '20-min NSDR', fn: () => openNsdr() } : null);
      });
      grid.appendChild(b);
    }
    card.appendChild(grid);
    const skip = el('button', 'kg-link', 'Skip');
    skip.type = 'button';
    onTap(skip, async () => { close(); await save({ [LAST]: Date.now() }); });
    card.appendChild(skip);
  }

  // Mode B — the window card (after work / night)
  function renderWindow(data, win) {
    const wins = Array.isArray(data.fgWins) ? data.fgWins : [];
    const plans = (Array.isArray(data.fgPlans) && data.fgPlans.length ? data.fgPlans : DEFAULT_PLANS)
      .filter((p) => p && p.label && p.label.trim());
    const snoozeUntil = Number(data[SNOOZE] || 0);
    const snoozed = snoozeUntil > Date.now();
    const st = winStats(wins);
    const { card, close } = mount();

    card.appendChild(el('div', 'kg-kicker', `${win.name} · ${hhmm(new Date())}`));

    // Logs the choice as a win and gets you off the site.
    const winAndLeave = async (label, url) => {
      close();
      wins.push({ t: Date.now(), site: SITE, plan: label });
      if (wins.length > MAX_ENTRIES) wins.splice(0, wins.length - MAX_ENTRIES);
      await save({ fgWins: wins, [LAST]: Date.now(), [SNOOZE]: 0 });
      const s = winStats(wins);
      showToast(`Win ${s.week} this week.` + (s.streak >= 2 ? ` ${s.streak}-day streak.` : '') + (url ? '' : ' Goodnight.'));
      setTimeout(() => leave(url), 900);
    };

    if (snoozed) {
      const left = Math.max(1, Math.ceil((snoozeUntil - Date.now()) / 60000));
      card.appendChild(el('h1', 'kg-title', `You asked for 10 minutes — ${left} left.`));
      card.appendChild(el('p', 'kg-sub', 'Most urges are gone by then. Your plan is still here.'));
    } else {
      card.appendChild(el('h1', 'kg-title', 'You decided this earlier.'));
      card.appendChild(el('p', 'kg-sub', 'Pick the thing you planned — that’s the whole job right now.'));
    }

    const grid = el('div', 'kg-grid kg-grid-plans');
    for (const p of plans) {
      const b = el('button', 'kg-chip kg-chip-plan', p.label.trim());
      b.type = 'button';
      onTap(b, () => winAndLeave(p.label.trim(), p.url && p.url.trim()));
      grid.appendChild(b);
    }
    card.appendChild(grid);

    if (data.fgClaudeOn) {
      card.appendChild(claudeButton('kg-btn kg-btn-claude', { window: win.name, plan: plans.map((p) => p.label.trim()).join(' / ') }));
    }

    if (!snoozed) {
      const wait = el('button', 'kg-btn', 'Give it 10 minutes');
      wait.type = 'button';
      onTap(wait, async () => {
        close();
        const until = Date.now() + SNOOZE_MS;
        await save({ [SNOOZE]: until });
        renderTimer(data, win, until);
      });
      card.appendChild(wait);
    }

    continueLink(card, async () => { close(); await save({ [LAST]: Date.now() }); });

    const stats = st.week || st.streak
      ? `Wins this week: ${st.week}` + (st.streak >= 2 ? ` · ${st.streak}-day streak` : '')
      : 'First win of the week is one tap away.';
    card.appendChild(el('p', 'kg-stats', stats));
  }

  let LAST = 'fgLast_' + SITE, SNOOZE = 'fgSnooze_' + SITE;

  // At night, "continue anyway" clears only the tab it was tapped in:
  // sessionStorage is per tab, so every new tab lands on the night page again.
  const TAB_PASS = 'fg:nightPass';
  const hasTabPass = () => { try { return sessionStorage.getItem(TAB_PASS) === '1'; } catch { return false; } };
  const grantTabPass = () => { try { sessionStorage.setItem(TAB_PASS, '1'); } catch { /* ignore */ } };

  const allowedAtNight = (list) => (Array.isArray(list) ? list : [])
    .map((d) => String(d).trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
    .some((d) => HOST === d || HOST.endsWith('.' + d));

  // start() is also re-entered from pause.js's hand-over event. Without a guard
  // the two runs overlap on the first `await` and mount two cards on top of
  // each other, and the second one's "continue" is then unreachable.
  let starting = false;
  const OVERLAYS = '.kg-checkin, .kg-sleep, .kg-timer, .kg-morning, .kg-pause';

  async function start() {
    if (starting) return;
    if (window.top !== window) return;
    if (document.querySelector(OVERLAYS)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    starting = true;
    try { await run(); } finally { starting = false; }
  }

  async function run() {
    const pre = await load(['fgWindows', 'fgNightAllow', 'fgNsdrPassUntil', 'fgMorningProgress', 'fgCoffeeAck', 'fgCoffeeDelay']);
    maybeCoffeeAlert(pre).catch(() => { /* a missed coffee toast is not worth stopping the check-in */ });
    // YouTube serves this recording at /live/<id> on mobile, not /watch?v=<id>,
    // so match the id anywhere in the URL.
    if (SITE === 'youtube' && location.href.includes('hEypv90GzDE')) {
      if (Number(pre.fgNsdrPassUntil || 0) > Date.now()) return;
      // Diagnostic: the NSDR opened without a live pass. The popup shows this.
      save({ fgNsdrDiag: { t: Date.now(), passUntil: Number(pre.fgNsdrPassUntil || 0), url: location.pathname } });
    }
    const win = activeWindow(pre.fgWindows);
    const night = !!win && win.key === 'night';
    // Other websites only take part in night mode.
    if (!CORE && !night) return;
    if (night && allowedAtNight(pre.fgNightAllow)) return;
    // One snooze and one "continued" grace for the whole of Safari at night.
    if (night) { LAST = 'fgLast_night'; SNOOZE = 'fgSnooze_night'; }
    const data = await load(['fgCues', 'fgWins', 'fgPlans', 'fgMorningSteps', 'fgMorningProgress', 'fgCoffeeDelay', 'fgShortcutName', 'fgNsdrUrl', 'fgClaudeOn', LAST, SNOOZE]);
    data.fgWindows = pre.fgWindows;
    const snoozed = Number(data[SNOOZE] || 0) > Date.now();
    // In a window the card shows on every open (a snoozed return included);
    // outside one the normal 20-minute cooldown applies.
    if (!win && Date.now() - Number(data[LAST] || 0) < COOLDOWN_MS) return;
    if (night && !snoozed && hasTabPass()) return;                                   // this tab was continued
    if (!night && win && !snoozed && Date.now() - Number(data[LAST] || 0) < 60 * 1000) return; // just continued
    if (win) save({ fgWindowShownAt: Date.now(), fgWindowShownKey: win.key });   // popup status line
    if (win && snoozed) renderTimer(data, win, Number(data[SNOOZE]));
    else if (win && win.key === 'night') renderSleep(data, win);
    else if (win && win.key === 'morning') {
      // The checklist runs once per morning: finished today means finished.
      const p = data.fgMorningProgress;
      if (p && p.day === new Date().toDateString() && p.complete) return;
      renderMorning(data, win);
    }
    else if (win) renderWindow(data, win);
    else renderCue(data);
  }

  const go = () => { start().catch(() => { /* never leave a half-drawn card behind */ }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
  // pause.js hands a night-time "continue" over to us: it has set a 10-minute
  // snooze, so start() lands on the timer.
  window.addEventListener('kg-pause-continued', go);
})();
