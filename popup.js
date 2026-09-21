// Kindgate — popup: the cue log, summarised
(() => {
  'use strict';
  const LABEL = {
    bored: 'Bored', tired: 'Tired', avoiding: 'Avoiding something', transition: 'Between tasks',
    lonely: 'Lonely', stressed: 'Stressed', habit: 'Just habit', purpose: 'Came for something specific',
  };
  const SITE = { youtube: 'YouTube', instagram: 'Instagram' };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const api = (typeof browser !== 'undefined' ? browser : chrome).storage.local;
  const $ = (id) => document.getElementById(id);

  function bars(container, counts, labelOf) {
    container.replaceChildren();
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 1;
    for (const [k, n] of entries) {
      const row = document.createElement('div'); row.className = 'bar';
      const label = document.createElement('span'); label.textContent = labelOf(k);
      const track = document.createElement('div'); track.className = 'track';
      const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = (100 * n / max) + '%';
      track.appendChild(fill);
      const num = document.createElement('span'); num.className = 'n'; num.textContent = String(n);
      row.append(label, track, num);
      container.appendChild(row);
    }
  }

  function render(all) {
    const since = Date.now() - WEEK_MS;
    const week = all.filter((e) => e.t >= since);
    $('total').textContent = String(week.length);
    $('empty').hidden = all.length > 0;

    const byCue = {}, bySite = {}, byDay = {}, byHour = new Array(24).fill(0);
    for (const e of week) {
      byCue[e.cue] = (byCue[e.cue] || 0) + 1;
      bySite[e.site] = (bySite[e.site] || 0) + 1;
      const d = new Date(e.t);
      byDay[d.getDay()] = (byDay[d.getDay()] || 0) + 1;
      byHour[d.getHours()]++;
    }
    bars($('byCue'), byCue, (k) => LABEL[k] || k);
    bars($('bySite'), bySite, (k) => SITE[k] || k);
    bars($('byDay'), byDay, (k) => DAYS[k]);

    const hours = $('byHour'); hours.replaceChildren();
    const maxH = Math.max(1, ...byHour);
    for (const n of byHour) {
      const b = document.createElement('div');
      b.style.height = (100 * n / maxH) + '%';
      b.title = String(n);
      hours.appendChild(b);
    }

    const recent = $('recent'); recent.replaceChildren();
    for (const e of all.slice(-10).reverse()) {
      const li = document.createElement('li');
      const a = document.createElement('span'); a.textContent = `${LABEL[e.cue] || e.cue} · ${SITE[e.site] || e.site}`;
      const b = document.createElement('span'); b.className = 'muted';
      b.textContent = new Date(e.t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      li.append(a, b);
      recent.appendChild(li);
    }
  }

  async function refresh() {
    const data = await api.get(['fgCues']);
    render(Array.isArray(data.fgCues) ? data.fgCues : []);
  }

  $('clear').addEventListener('click', async () => {
    if (!confirm('Delete the whole cue log?')) return;
    await api.remove(['fgCues']);
    refresh();
  });
  $('copy').addEventListener('click', async () => {
    const data = await api.get(['fgCues']);
    const text = JSON.stringify(data.fgCues || [], null, 2);
    try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied'; }
    catch { prompt('Copy this:', text); }
  });

  // Links typed here are handed to location.href later — by the check-in card
  // inside a page, and by the buttons below inside this popup, which is the
  // extension's own origin with its storage in reach. A "javascript:" or
  // "data:" string in either place runs as script rather than navigating, so
  // nothing is stored or opened unless it is a navigation we recognise.
  const SAFE_SCHEMES = /^(?:https?|mailto|tel|shortcuts|music|spotify|podcasts?|overcast|pocketcasts|pktc):/i;
  function safeUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return 'https://' + s.replace(/^\/+/, '');   // "example.com"
    return SAFE_SCHEMES.test(s) ? s : '';
  }
  // Marks a field whose contents were dropped, so a rejected link isn't silent.
  function markUrlField(input, ok) {
    input.style.borderColor = ok ? '' : '#c0392b';
    input.title = ok ? '' : 'Only web and app links can be opened — this one was not saved.';
  }
  function readUrlField(input) {
    const raw = input.value.trim();
    const url = safeUrl(raw);
    markUrlField(input, !raw || !!url);
    return url;
  }

  // Playback preferences
  const unmute = $('unmute'), speed = $('speed'), quality = $('quality');
  api.get(['fgUnmute', 'fgSpeed', 'fgQuality']).then((d) => {
    unmute.checked = !!(d && d.fgUnmute);
    speed.value = String((d && d.fgSpeed) || 1);
    quality.value = (d && d.fgQuality) || 'auto';
  });
  unmute.addEventListener('change', () => api.set({ fgUnmute: unmute.checked }));

  const blockupsell = $('blockupsell');
  api.get(['fgBlockUpsell']).then((d) => { blockupsell.checked = !(d && d.fgBlockUpsell === false); });
  blockupsell.addEventListener('change', () => api.set({ fgBlockUpsell: blockupsell.checked }));

  const hidethumbs = $('hidethumbs');
  api.get(['fgHideThumbs']).then((d) => { hidethumbs.checked = !(d && d.fgHideThumbs === false); });
  hidethumbs.addEventListener('change', () => api.set({ fgHideThumbs: hidethumbs.checked }));
  speed.addEventListener('change', () => api.set({ fgSpeed: Number(speed.value) }));
  quality.addEventListener('change', () => api.set({ fgQuality: quality.value }));

  // Evening plan: windows, plans, wins
  const DEF_WIN = { work: { on: true, start: '17:30', end: '20:00' }, night: { on: true, start: '21:30', end: '06:00' } };
  const DEF_PLANS = [{ label: '20-minute walk', url: '' }, { label: 'Cook something', url: '' }, { label: 'Read', url: '' }];
  const wEls = { workOn: $('workOn'), workStart: $('workStart'), workEnd: $('workEnd'),
                 nightOn: $('nightOn'), nightStart: $('nightStart'), nightEnd: $('nightEnd') };
  const pEls = [0, 1, 2].map((i) => ({ label: $('plan' + i), url: $('url' + i) }));

  function saveWindows() {
    // Merge, so saving here never drops the morning window.
    api.get(['fgWindows']).then((d) => {
      const w = Object.assign({}, (d && d.fgWindows) || {});
      w.work = { on: wEls.workOn.checked, start: wEls.workStart.value || '17:30', end: wEls.workEnd.value || '20:00', name: 'After-work window' };
      w.night = { on: wEls.nightOn.checked, start: wEls.nightStart.value || '21:30', end: wEls.nightEnd.value || '06:00', name: 'Night window' };
      api.set({ fgWindows: w });
    });
  }
  function savePlans() {
    api.set({ fgPlans: pEls.map((p) => ({ label: p.label.value.trim(), url: readUrlField(p.url) })).filter((p) => p.label) });
  }
  api.get(['fgWindows', 'fgPlans', 'fgWins']).then((d) => {
    const w = Object.assign({}, DEF_WIN, d && d.fgWindows || {});
    wEls.workOn.checked = w.work.on !== false;  wEls.workStart.value = w.work.start;  wEls.workEnd.value = w.work.end;
    wEls.nightOn.checked = w.night.on !== false; wEls.nightStart.value = w.night.start; wEls.nightEnd.value = w.night.end;
    const plans = (d && Array.isArray(d.fgPlans) && d.fgPlans.length) ? d.fgPlans : DEF_PLANS;
    pEls.forEach((p, i) => { p.label.value = (plans[i] && plans[i].label) || ''; p.url.value = (plans[i] && plans[i].url) || ''; });
    const wins = (d && Array.isArray(d.fgWins)) ? d.fgWins : [];
    const since = Date.now() - WEEK_MS;
    $('wins').textContent = String(wins.filter((x) => x.t >= since).length);
    const days = new Set(wins.map((x) => new Date(x.t).toDateString()));
    let streak = 0; const dd = new Date();
    if (!days.has(dd.toDateString())) dd.setDate(dd.getDate() - 1);
    while (days.has(dd.toDateString())) { streak++; dd.setDate(dd.getDate() - 1); }
    $('streak').textContent = streak >= 2 ? `${streak}-day streak` : (wins.length ? 'Last win: ' + new Date(wins[wins.length - 1].t).toLocaleDateString() : '');
  });
  const nightAllow = $('nightAllow');
  api.get(['fgNightAllow']).then((d) => { nightAllow.value = ((d && d.fgNightAllow) || []).join('\n'); });
  nightAllow.addEventListener('change', () => api.set({ fgNightAllow: nightAllow.value.split(/\n+/).map((s) => s.trim()).filter(Boolean) }));

  // ---- warm screen at night ----------------------------------------------------
  const DEF_WARM = { on: true, start: '21:00', end: '07:00', warmth: 70, dim: 20, ramp: 60, skip: [] };
  const warmEls = { on: $('warmOn'), start: $('warmStart'), end: $('warmEnd'), warmth: $('warmth'), dim: $('warmDim'), ramp: $('warmRamp'), skip: $('warmSkip') };
  // A stored strength may sit between the options offered; show the nearest one
  // rather than silently falling back to the first.
  function nearestOption(sel, value) {
    const opts = Array.from(sel.options).map((o) => Number(o.value));
    const v = Number(value);
    sel.value = String(opts.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), opts[0]));
  }
  api.get(['fgWarm']).then((d) => {
    const w = Object.assign({}, DEF_WARM, (d && d.fgWarm) || {});
    warmEls.on.checked = w.on !== false;
    warmEls.start.value = w.start; warmEls.end.value = w.end;
    nearestOption(warmEls.warmth, w.warmth);
    nearestOption(warmEls.dim, w.dim);
    nearestOption(warmEls.ramp, w.ramp);
    warmEls.skip.value = (w.skip || []).join('\n');
  });
  function saveWarm() {
    api.set({ fgWarm: {
      on: warmEls.on.checked,
      start: warmEls.start.value || DEF_WARM.start,
      end: warmEls.end.value || DEF_WARM.end,
      warmth: Number(warmEls.warmth.value),
      dim: Number(warmEls.dim.value),
      ramp: Number(warmEls.ramp.value),
      skip: warmEls.skip.value.split(/\n+/).map((x) => x.trim()).filter(Boolean),
    } });
  }
  for (const k of Object.keys(warmEls)) warmEls[k].addEventListener('change', saveWarm);

  const nsdr = $('nsdr');
  api.get(['fgNsdrUrl']).then((d) => { nsdr.value = (d && d.fgNsdrUrl) || ''; });
  nsdr.addEventListener('change', () => api.set({ fgNsdrUrl: readUrlField(nsdr) }));
  // Status: is a window active right now, and when did the page last fire?
  function windowStatus() {
    api.get(['fgWindows', 'fgWindowShownAt', 'fgWindowShownKey']).then((d) => {
      const w = Object.assign({}, DEF_WIN, d && d.fgWindows || {});
      const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h * 60 + (m || 0)) % 1440; };
      const now = new Date(), t = now.getHours() * 60 + now.getMinutes();
      const inW = (x) => { if (!x || x.on === false) return false; const a = toMin(x.start), b = toMin(x.end); return a <= b ? (t >= a && t < b) : (t >= a || t < b); };
      const active = inW(w.night) ? 'Night window is active now' : inW(w.work) ? 'After-work window is active now' : 'No window active right now';
      const last = d && d.fgWindowShownAt ? `Last shown: ${new Date(d.fgWindowShownAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} (${d.fgWindowShownKey === 'night' ? 'night' : 'after work'})` : 'Not shown yet on this phone';
      $('winStatus').textContent = `${active}. ${last}. If a window is active but pages aren\u2019t appearing, check Settings \u2192 Apps \u2192 Safari \u2192 Extensions \u2192 Kindgate: on, and Other Websites \u2192 Allow.`;
      api.get(['fgNsdrDiag']).then((x) => {
        const g = x && x.fgNsdrDiag; if (!g) return;
        const when = new Date(g.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        const why = !g.passUntil ? 'no pass had been saved' : (g.passUntil < g.t ? `the pass had expired ${Math.round((g.t - g.passUntil) / 60000)} min earlier` : 'unexpected');
        $('winStatus').textContent += ` NSDR diagnostic: at ${when} the night page fired on the NSDR video (${g.url}) because ${why}.`;
      });
    });
  }
  windowStatus();
  for (const k of Object.keys(wEls)) wEls[k].addEventListener('change', () => { saveWindows(); setTimeout(windowStatus, 50); });
  for (const p of pEls) { p.label.addEventListener('change', savePlans); p.url.addEventListener('change', savePlans); }

  // ---- Pause -----------------------------------------------------------------
  const TRIG = { bored: 'bored', stressed: 'stressed', lonely: 'lonely', tired: 'tired', aroused: 'aroused', habit: 'just habit' };
  const gm = (id) => $(id);

  // The PIN keeps the Pause section out of casual view on a shared phone. It is
  // not encryption: the log underneath is ordinary extension storage, and
  // anyone holding the unlocked phone with a debugger attached can read it. What
  // it can do is make guessing the PIN itself slow. A bare SHA-256 of four
  // digits falls in microseconds — all ten thousand of them — so this is PBKDF2
  // with a random salt per install and enough rounds to cost a phone about a
  // tenth of a second per guess.
  const PIN_ROUNDS = 210000;
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  // How PINs were stored before v6.4; still accepted, and upgraded on first use.
  const legacyHash = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fg:' + s)));
  async function pinHash(pin, saltB64, rounds) {
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
  }
  async function makePin(pin) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    return { v: 2, salt, rounds: PIN_ROUNDS, hash: await pinHash(pin, salt, PIN_ROUNDS) };
  }
  async function pinMatches(pin, stored) {
    if (!stored || !pin) return false;
    if (typeof stored === 'string') return (await legacyHash(pin)) === stored;
    if (!stored.salt || !stored.hash) return false;
    return (await pinHash(pin, stored.salt, Number(stored.rounds) || PIN_ROUNDS)) === stored.hash;
  }

  function insights(log) {
    const box = $('pauseInsights'); box.replaceChildren();
    const now = Date.now(), d30 = 30 * 24 * 3600 * 1000;
    const cur = log.filter((e) => now - e.t < d30), prev = log.filter((e) => now - e.t >= d30 && now - e.t < 2 * d30);
    if (!cur.length && !prev.length) { box.appendChild(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No pauses logged yet.' })); return; }
    const line = (t, cls) => { const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = t; box.appendChild(p); };
    const went = (a) => a.filter((e) => e.outcome === 'continued').length;
    const c = went(cur), pv = went(prev);
    if (prev.length) {
      const pct = pv ? Math.round(100 * (c - pv) / pv) : (c ? 100 : 0);
      line(pct < 0 ? `Down ${-pct}% this month` : pct > 0 ? `Up ${pct}% this month` : 'About the same as last month', 'big');
      line(`${c} times went ahead in the last 30 days, ${pv} the 30 before. One month is a trend; one day isn't.`, 'muted');
    } else {
      line(`${cur.length} pauses in the last 30 days`, 'big');
    }
    const alts = cur.filter((e) => e.outcome === 'alt').length;
    if (cur.length) line(`Chose something else ${alts} of ${cur.length} times.`);
    const tally = (arr, f) => { const m = {}; for (const e of arr) { const k = f(e); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1])[0]; };
    const bucket = (e) => { const h = new Date(e.t).getHours(); return h >= 23 || h < 5 ? 'late at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening'; };
    const tb = tally(cur, bucket), tt = tally(cur, (e) => e.trigger);
    if (tb && tt) line(`Most urges: ${tb[0]}, when ${TRIG[tt[0]] || tt[0]}.`);
    else if (tb) line(`Most urges: ${tb[0]}.`);
    const out = cur.filter((e) => !e.within).length;
    if (cur.length) line(`${out} of ${cur.length} were outside your goal.`, 'muted');
  }

  const ASSESS = [
    'I\u2019ve found it hard to control or cut back, even when I\u2019ve tried.',
    'It takes up more of my attention than I\u2019d like \u2014 crowding out other interests or responsibilities.',
    'I\u2019ve kept going even when it caused problems (relationships, work, sleep, money).',
    'I\u2019ve kept going even when I got little or no enjoyment from it.',
    'It causes me real distress, or gets in the way of daily life.',
    'This has been the case for six months or more.',
  ];
  function buildAssess() {
    const box = $('assess'); box.replaceChildren();
    ASSESS.forEach((q, i) => {
      const d = document.createElement('div'); d.className = 'q'; d.textContent = q;
      const s = document.createElement('select'); s.id = 'as' + i;
      const opts = i === 5 ? [['0', 'No'], ['4', 'Yes']] : [['0', 'Never'], ['1', 'Rarely'], ['2', 'Sometimes'], ['3', 'Often'], ['4', 'Almost always']];
      for (const [v, l] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = l; s.appendChild(o); }
      d.appendChild(s); box.appendChild(d);
    });
  }
  buildAssess();
  $('assessScore').addEventListener('click', () => {
    let score = 0; for (let i = 0; i < ASSESS.length; i++) score += Number($('as' + i).value);
    const r = $('assessResult'); r.hidden = false;
    r.textContent = score <= 7
      ? `Score ${score} of 24. Nothing here suggests more than a habit you\u2019d like to change \u2014 and wanting to change it is enough reason to.`
      : score <= 14
      ? `Score ${score} of 24. Some signs of strain. The tools here are a reasonable place to start. If it hasn\u2019t shifted in a couple of months, talking to someone is worth it \u2014 not because something is wrong with you, but because it\u2019s quicker with help.`
      : `Score ${score} of 24. This pattern of answers is the kind clinicians take seriously. Please consider talking to a GP or a therapist \u2014 CBT- and ACT-based approaches help with exactly this. This isn\u2019t a diagnosis and it isn\u2019t a verdict on you. How much you judge yourself for it predicts suffering better than how often it happens.`;
    api.set({ fgPauseAssess: { t: Date.now(), score } });
  });

  const altIds = ['bored', 'stressed', 'lonely', 'tired', 'aroused', 'habit'];
  const DEFAULT_ALTS = {
    bored: '10 push-ups, then pick one real task', stressed: 'Walk around the block \u2014 10 minutes',
    lonely: 'Message one person, right now', tired: 'Lie down without the phone, 15 minutes',
    aroused: 'Cold water on your face, then a 10-minute walk', habit: 'Close the tab. Stand up. Drink water.',
  };
  function saveGoal() {
    api.set({ fgPauseGoal: {
      mode: gm('goalMode').value, weekendsOnly: gm('goalWeekends').checked, notAtWork: gm('goalWork').checked,
      workStart: gm('goalWorkStart').value || '09:00', workEnd: gm('goalWorkEnd').value || '17:00',
      notAfter: gm('goalNotAfter').value || '', notBefore: gm('goalNotBefore').value || '',
    } });
    gm('goalRules').style.opacity = gm('goalMode').value === 'abstain' ? '0.4' : '1';
  }
  function saveAlts() { const o = {}; for (const k of altIds) { const v = gm('alt_' + k).value.trim(); if (v) o[k] = v; } api.set({ fgPauseAlts: o }); }

  const listIds = { adult: 'listAdult', social: 'listSocial', gambling: 'listGambling' };
  function saveLists() { const o = {}; for (const k in listIds) o[k] = gm(listIds[k]).checked; api.set({ fgPauseLists: o }); }
  api.get(['fgPauseOn', 'fgPauseSites', 'fgPauseLists', 'fgPauseSeconds', 'fgPauseGoal', 'fgPauseAlts', 'fgPauseLog', 'fgPausePin']).then(async (d) => {
    gm('pauseOn').checked = !(d && d.fgPauseOn === false);
    gm('pauseSites').value = ((d && d.fgPauseSites) || []).join('\n');
    const lists = (d && d.fgPauseLists) || {}; for (const k in listIds) gm(listIds[k]).checked = lists[k] === true;
    gm('pauseSeconds').value = String((d && d.fgPauseSeconds) || 15);
    const g = Object.assign({ mode: 'reduce', weekendsOnly: false, notAtWork: false, workStart: '09:00', workEnd: '17:00', notAfter: '', notBefore: '' }, (d && d.fgPauseGoal) || {});
    gm('goalMode').value = g.mode; gm('goalWeekends').checked = !!g.weekendsOnly; gm('goalWork').checked = !!g.notAtWork;
    gm('goalWorkStart').value = g.workStart; gm('goalWorkEnd').value = g.workEnd; gm('goalNotAfter').value = g.notAfter; gm('goalNotBefore').value = g.notBefore;
    gm('goalRules').style.opacity = g.mode === 'abstain' ? '0.4' : '1';
    const a = Object.assign({}, DEFAULT_ALTS, (d && d.fgPauseAlts) || {}); for (const k of altIds) gm('alt_' + k).value = a[k] || '';
    insights(Array.isArray(d && d.fgPauseLog) ? d.fgPauseLog : []);
    const pin = (d && d.fgPausePin) || '';
    gm('pinClear').hidden = !pin;
    if (pin) { gm('pinGate').hidden = false; gm('pauseBody').hidden = true; }
  });
  gm('pauseOn').addEventListener('change', () => api.set({ fgPauseOn: gm('pauseOn').checked }));
  gm('pauseSites').addEventListener('change', () => api.set({ fgPauseSites: gm('pauseSites').value.split(/\n+/).map((s) => s.trim()).filter(Boolean) }));
  gm('pauseSeconds').addEventListener('change', () => api.set({ fgPauseSeconds: Number(gm('pauseSeconds').value) }));
  for (const k in listIds) gm(listIds[k]).addEventListener('change', saveLists);
  for (const id of ['goalMode', 'goalWeekends', 'goalWork', 'goalWorkStart', 'goalWorkEnd', 'goalNotAfter', 'goalNotBefore']) gm(id).addEventListener('change', saveGoal);
  for (const k of altIds) gm('alt_' + k).addEventListener('change', saveAlts);
  gm('pinSet').addEventListener('click', async () => {
    const v = gm('pinNew').value.trim();
    if (!v) return;
    gm('pinSet').disabled = true;
    try { await api.set({ fgPausePin: await makePin(v) }); }
    finally { gm('pinSet').disabled = false; }
    gm('pinNew').value = ''; gm('pinClear').hidden = false;
  });
  gm('pinClear').addEventListener('click', async () => { await api.remove(['fgPausePin']); gm('pinClear').hidden = true; });
  // A wrong PIN costs a little more each time. Nothing can stop someone reading
  // the storage directly, but it does stop idle thumb-through guessing.
  let wrongTries = 0;
  gm('pinUnlock').addEventListener('click', async () => {
    const btn = gm('pinUnlock');
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const d = await api.get(['fgPausePin']);
      const entered = gm('pinEntry').value.trim();
      if (await pinMatches(entered, d.fgPausePin)) {
        wrongTries = 0;
        gm('pinEntry').value = '';
        gm('pinWrong').hidden = true;
        gm('pinGate').hidden = true; gm('pauseBody').hidden = false;
        // Set under the old scheme: re-store it salted now that we have the PIN.
        if (typeof d.fgPausePin === 'string') await api.set({ fgPausePin: await makePin(entered) });
        return;
      }
      gm('pinWrong').hidden = false;
      wrongTries++;
    } finally {
      const wait = Math.min(5000, 250 * wrongTries * wrongTries);
      if (wait) setTimeout(() => { btn.disabled = false; }, wait); else btn.disabled = false;
    }
  });

  // ---- "Talk it through with Claude" (opt-in)
  const claudeOn = $('claudeOn');
  api.get(['fgClaudeOn']).then((d) => { claudeOn.checked = !!(d && d.fgClaudeOn); });
  claudeOn.addEventListener('change', () => api.set({ fgClaudeOn: claudeOn.checked }));

  // ---- Remember which sections are open (popup-local, per device)
  for (const dt of document.querySelectorAll('details[id]')) {
    try { const v = localStorage.getItem('kg-open:' + dt.id); if (v !== null) dt.open = v === '1'; } catch { /* ignore */ }
    dt.addEventListener('toggle', () => { try { localStorage.setItem('kg-open:' + dt.id, dt.open ? '1' : '0'); } catch { /* ignore */ } });
  }

  // ---- Morning: window, steps, set-up checklist
  const DEFAULT_MSTEPS = [
    { label: 'Step out of bed', url: '' },
    { label: 'Sunlight \u2014 outside, 5\u201310 min', url: '' },
    { label: 'Glass of water', url: '' },
    { label: 'Make the bed', url: '' },
  ];
  const mEls = { on: $('morningOn'), start: $('morningStart'), end: $('morningEnd') };
  const msEls = [0, 1, 2, 3].map((i) => ({ label: $('mstep' + i), url: $('murl' + i) }));
  const setupEls = [...document.querySelectorAll('input[data-setup]')];
  const coffeeDelay = $('coffeeDelay');
  api.get(['fgCoffeeDelay']).then((d) => { coffeeDelay.value = String((d && d.fgCoffeeDelay) || 90); });
  coffeeDelay.addEventListener('change', () => api.set({ fgCoffeeDelay: Number(coffeeDelay.value) }));
  const shortcutName = $('shortcutName');
  api.get(['fgShortcutName']).then((d) => { shortcutName.value = (d && d.fgShortcutName) || ''; });
  shortcutName.addEventListener('change', () => api.set({ fgShortcutName: shortcutName.value.trim() }));

  const RECIPE = 'Coffee reminder shortcut\n'
    + 'Kindgate sends: minutes to wait (e.g. 90) as Shortcut Input.\n'
    + '\n'
    + 'The common error -- "couldn\'t convert from Text to Date" -- means\n'
    + 'Shortcut Input was dropped straight into the At Time field. It is text.\n'
    + 'That field needs a date, so make one first:\n'
    + '\n'
    + '  1. Adjust Date: add [Shortcut Input] Minutes to [Current Date]\n'
    + '       -> this outputs "Adjusted Date"\n'
    + '  2. Add New Reminder: title Coffee, your list, Alert -> At Time\n'
    + '       -> put [Adjusted Date] in the time field (NOT Shortcut Input)\n'
    + '  3. Remove Shortcut Input from the title unless you want "90" in it.\n'
    + '\n'
    + 'Simplest alternative, one action, no dates at all:\n'
    + '  Start Timer for [Shortcut Input] minutes\n'
    + '\n'
    + 'Then put the exact shortcut name into Kindgate -> Morning -> Coffee timer.';
  const copy = async (text, btn, label) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch { prompt('Copy this:', text); }
    setTimeout(() => { btn.textContent = label; }, 1600);
  };
  $('scCreate').addEventListener('click', () => { location.href = 'shortcuts://create-shortcut'; });
  $('scRecipe').addEventListener('click', (e) => copy(RECIPE, e.target, 'Copy the steps'));
  $('scTest').addEventListener('click', () => {
    const n = shortcutName.value.trim();
    if (!n) { shortcutName.focus(); return; }
    location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(n) + '&input=text&text=1';
  });

  // Shortcut-link builder
  const scbName = $('scbName'), scbInput = $('scbInput'), scbOut = $('scbOut');
  const buildLink = () => {
    const n = scbName.value.trim();
    if (!n) { scbOut.value = ''; return ''; }
    let u = 'shortcuts://run-shortcut?name=' + encodeURIComponent(n);
    const i = scbInput.value.trim();
    if (i) u += '&input=text&text=' + encodeURIComponent(i);
    scbOut.value = u;
    return u;
  };
  scbName.addEventListener('input', buildLink);
  scbInput.addEventListener('input', buildLink);
  $('scbCopy').addEventListener('click', (e) => { const u = buildLink(); if (u) copy(u, e.target, 'Copy link'); });
  $('scbOpen').addEventListener('click', () => { const u = buildLink(); if (u) location.href = u; });

  const scInstall = $('scInstall');
  api.get(['fgShortcutInstall']).then((d) => { scInstall.value = (d && d.fgShortcutInstall) || ''; });
  const safeInstallUrl = (raw) => {
    const s = String(raw || '').trim();
    return /^(?:https|shortcuts):/i.test(s) ? s : '';   // iCloud share links, or shortcuts://
  };
  scInstall.addEventListener('change', () => {
    const u = safeInstallUrl(scInstall.value);
    markUrlField(scInstall, !scInstall.value.trim() || !!u);
    api.set({ fgShortcutInstall: u });
  });
  $('scInstallOpen').addEventListener('click', (e) => {
    const u = safeInstallUrl(scInstall.value);
    if (!u) { markUrlField(scInstall, false); e.target.textContent = 'Not a link I can open'; setTimeout(() => { e.target.textContent = 'Open install link'; }, 1800); return; }
    location.href = u;
  });

  function saveMorningWindow() {
    api.get(['fgWindows']).then((d) => {
      const w = Object.assign({}, d && d.fgWindows || {});
      w.morning = { on: mEls.on.checked, start: mEls.start.value || '06:00', end: mEls.end.value || '08:30', name: 'Morning window' };
      api.set({ fgWindows: w });
      setTimeout(morningStatus, 50);
    });
  }
  function saveMorningSteps() {
    api.set({ fgMorningSteps: msEls.map((p) => ({ label: p.label.value.trim(), url: readUrlField(p.url) })).filter((p) => p.label) });
  }
  function morningStatus() {
    api.get(['fgWindows', 'fgWins']).then((d) => {
      const w = Object.assign({ on: true, start: '06:00', end: '08:30' }, (d && d.fgWindows && d.fgWindows.morning) || {});
      const wins = (d && Array.isArray(d.fgWins)) ? d.fgWins : [];
      const since = Date.now() - WEEK_MS;
      const kept = new Set(wins.filter((x) => x.t >= since && x.window === 'morning').map((x) => new Date(x.t).toDateString())).size;
      $('morningStatus').textContent = w.on === false
        ? 'Morning window is off.'
        : `Morning window ${w.start}\u2013${w.end}. ` + (kept ? `Kept ${kept} of the last 7 mornings.` : 'Nothing logged yet \u2014 no streak to break.');
    });
  }
  api.get(['fgWindows', 'fgMorningSteps', 'fgMorningSetup']).then((d) => {
    const w = Object.assign({ on: true, start: '06:00', end: '08:30' }, (d && d.fgWindows && d.fgWindows.morning) || {});
    mEls.on.checked = w.on !== false; mEls.start.value = w.start; mEls.end.value = w.end;
    const st = (d && Array.isArray(d.fgMorningSteps) && d.fgMorningSteps.length) ? d.fgMorningSteps : DEFAULT_MSTEPS;
    msEls.forEach((p, i) => { p.label.value = (st[i] && st[i].label) || ''; p.url.value = (st[i] && st[i].url) || ''; });
    const setup = (d && d.fgMorningSetup) || {};
    for (const b of setupEls) b.checked = !!setup[b.dataset.setup];
    morningStatus();
  });
  for (const k of Object.keys(mEls)) mEls[k].addEventListener('change', saveMorningWindow);
  for (const p of msEls) { p.label.addEventListener('change', saveMorningSteps); p.url.addEventListener('change', saveMorningSteps); }
  for (const b of setupEls) b.addEventListener('change', () => {
    const o = {}; for (const x of setupEls) o[x.dataset.setup] = x.checked;
    api.set({ fgMorningSetup: o });
  });

  // ---- Feature toggles (YouTube + Instagram)
  const igEvery = $('igEvery');
  api.get(['fgFeatures']).then((d) => { igEvery.value = String(((d && d.fgFeatures) || {}).igCheckpointEvery || 15); });
  igEvery.addEventListener('change', () => {
    api.get(['fgFeatures']).then((d) => {
      const f = Object.assign({}, (d && d.fgFeatures) || {});
      f.igCheckpointEvery = Number(igEvery.value);
      api.set({ fgFeatures: f });
    });
  });

  const FEATURE_DEFAULTS = { ytHome: true, ytShorts: true, ytRelated: true, ytComments: true, ytAutoplay: true, ytTabBar: true, ytPip: true, ytRotate: true, igFollowing: true, igReels: true, igSuggested: true, igAds: true, igCheckpoint: true };
  const featureBoxes = [...document.querySelectorAll('input[data-feature]')];
  api.get(['fgFeatures']).then((d) => {
    const f = Object.assign({}, FEATURE_DEFAULTS, (d && d.fgFeatures) || {});
    for (const b of featureBoxes) b.checked = f[b.dataset.feature] !== false;
  });
  for (const b of featureBoxes) b.addEventListener('change', () => {
    api.get(['fgFeatures']).then((d) => {
      const f = Object.assign({}, (d && d.fgFeatures) || {});
      for (const x of featureBoxes) f[x.dataset.feature] = x.checked;
      f.igCheckpointEvery = Number(igEvery.value) || 15;   // not a checkbox; don't drop it
      api.set({ fgFeatures: f });
    });
  });

  refresh();
})();
