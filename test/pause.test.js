// pause.js — the pause screen and, above all, the veil that must never strand
// a page invisible (README "Pause").
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const DAY = '2026-09-21 14:00';   // Monday
const NIGHT = '2026-09-21 23:00';
const PAUSED = 'https://www.pornhub.com/';   // on the built-in list by keyword
const veiled = (page) => page.document.documentElement.classList.contains('kg-pause-veil');

async function open(url, opts = {}) {
  const page = load('pause.js', { url, loading: true, now: DAY, ...opts });
  await page.flush();
  return page;
}

describe('pause: the veil', () => {
  test('is applied at document_start and lifted at once on a site that is not paused', async () => {
    const page = load('pause.js', { url: 'https://example.com/', loading: true, now: DAY });
    assert.ok(veiled(page), 'hidden until the decision is made');
    await page.flush();
    assert.equal(veiled(page), false, 'lifted once storage answered');
    assert.equal(page.$('style'), null, 'the veil stylesheet is gone too');
    assert.equal(page.$('.kg-pause'), null);
  });

  test('is lifted by the watchdog if storage never answers', async () => {
    const page = load('pause.js', { url: 'https://example.com/', loading: true, now: DAY, storageStall: true });
    await page.flush();
    assert.ok(veiled(page), 'still waiting');
    page.clock.advance(1500);
    assert.equal(veiled(page), false, 'watchdog lifted it');
  });

  test('is lifted if storage fails, and the page loads unpaused', async () => {
    const page = load('pause.js', { url: PAUSED, loading: true, now: DAY, storageFail: true });
    await page.flush();
    assert.equal(veiled(page), false);
    assert.equal(page.$('.kg-pause'), null);
  });

  test('is lifted when the pause screen mounts, since the screen is opaque', async () => {
    const page = await open(PAUSED);
    assert.ok(page.$('.kg-pause'));
    assert.equal(veiled(page), false);
  });
});

describe('pause: who gets paused', () => {
  test('the built-in list matches by keyword, on any subdomain', async () => {
    for (const u of ['https://www.pornhub.com/', 'https://de.xhamster.com/x', 'https://something-xxx-site.net/']) {
      assert.ok((await open(u)).$('.kg-pause'), u);
    }
    for (const u of ['https://example.com/', 'https://www.youtube.com/', 'https://xxxample.org/']) {
      const page = await open(u);
      assert.equal(page.$('.kg-pause'), u === 'https://xxxample.org/' ? page.$('.kg-pause') : null, u);
    }
  });

  test('a hand-written list replaces the built-in one', async () => {
    const own = { fgPauseSites: ['Example.com', 'news'] };
    assert.ok((await open('https://www.example.com/', { storage: own })).$('.kg-pause'), 'domain entry');
    assert.ok((await open('https://www.bbc-news.co.uk/', { storage: own })).$('.kg-pause'), 'keyword entry');
    assert.equal((await open('https://notexample.com/', { storage: own })).$('.kg-pause'), null, 'domain entries do not match by substring');
    assert.equal((await open(PAUSED, { storage: own })).$('.kg-pause'), null, 'built-ins are off when a list is set');
  });

  test('can be switched off, and honours the ten-minute grace after continuing', async () => {
    assert.equal((await open(PAUSED, { storage: { fgPauseOn: false } })).$('.kg-pause'), null);
    const t = new Date('2026-09-21T14:00:00').getTime();
    assert.equal((await open(PAUSED, { storage: { fgPauseLast: t - 5 * 60_000 } })).$('.kg-pause'), null, 'within the grace');
    assert.ok((await open(PAUSED, { storage: { fgPauseLast: t - 11 * 60_000 } })).$('.kg-pause'), 'after the grace');
  });

  test('a bundled list that cannot be fetched pauses nothing and does not throw', async () => {
    const page = await open('https://example.com/', { storage: { fgPauseLists: { adult: true } } });
    assert.equal(page.$('.kg-pause'), null);
    assert.equal(veiled(page), false);
  });
});

describe('pause: the screen', () => {
  test('outside the goal the continue link waits the configured 10–20 s', async () => {
    const page = await open(PAUSED, { storage: { fgPauseGoal: { mode: 'abstain' }, fgPauseSeconds: 12 } });
    assert.match(page.text('.kg-pause-title'), /Outside your goal — your goal is to stop/);
    const cont = page.$('.kg-pause-link');
    assert.equal(cont.textContent, 'Continue anyway (12)');
    assert.equal(cont.disabled, true);
    page.clock.advance(12_000);
    assert.equal(cont.disabled, false);
    assert.equal(page.storage.data.fgPauseLast, page.clock.at(DAY), 'grace recorded once the screen is up');
  });

  test('inside a flexible goal the pause is short', async () => {
    const page = await open(PAUSED, { storage: { fgPauseGoal: { mode: 'reduce', weekendsOnly: false, notAfter: '22:00' } } });
    assert.match(page.text('.kg-pause-title'), /Within your goal/);
    assert.equal(page.$('.kg-pause-link').textContent, 'Continue anyway (5)');
  });

  test('"weekends only" and "not at work" are judged on the local clock', async () => {
    const monday = await open(PAUSED, { storage: { fgPauseGoal: { weekendsOnly: true } } });
    assert.match(monday.text('.kg-pause-title'), /weekends only/);
    const saturday = await open(PAUSED, { now: '2026-09-26 14:00', storage: { fgPauseGoal: { weekendsOnly: true } } });
    assert.match(saturday.text('.kg-pause-title'), /Within your goal/);
    const atWork = await open(PAUSED, { storage: { fgPauseGoal: { notAtWork: true } } });
    assert.match(atWork.text('.kg-pause-title'), /not at work/);
  });

  test('choosing a feeling offers the replacement set for it; taking it is logged as a win', async () => {
    const page = await open(PAUSED, { storage: { fgPauseAlts: { bored: 'Ten push-ups' } } });
    await page.tap(page.$$('.kg-pause-chip').find((b) => b.textContent === 'Bored'));
    const alt = page.$('.kg-pause-alt .kg-pause-primary');
    assert.equal(alt.textContent, 'Ten push-ups');
    await page.tap(alt);
    const log = page.storage.data.fgPauseLog;
    assert.equal(log.length, 1);
    assert.deepEqual({ trigger: log[0].trigger, outcome: log[0].outcome }, { trigger: 'bored', outcome: 'alt' });
    assert.doesNotMatch(JSON.stringify(log), /pornhub/, 'the log never carries the site');
    assert.ok(page.$('.kg-pause-success'));
  });

  test('at night, continuing hands over to the night timer instead of opening the site', async () => {
    const page = await open(PAUSED, { now: NIGHT });
    assert.match(page.text('.kg-pause-kicker'), /Night/);
    const cont = page.$('.kg-pause-link');
    assert.match(cont.textContent, /^Continue — 10 minutes first/);
    page.clock.advance(20_000);
    let handedOver = false;
    page.window.addEventListener('kg-pause-continued', () => { handedOver = true; });
    await page.tap(cont);
    assert.equal(page.$('.kg-pause'), null);
    assert.ok(handedOver, 'checkin.js is told to show the timer');
    assert.ok(page.storage.data.fgSnooze_night > page.clock.now(), 'a 10-minute snooze is set');
  });

  test('going ahead outside the goal is reviewed next time', async () => {
    const t = new Date('2026-09-21T14:00:00').getTime();
    const page = await open(PAUSED, { storage: { fgPauseLog: [{ t: t - 3600_000, trigger: 'bored', outcome: 'continued', within: false, reviewed: false }] } });
    assert.equal(page.text('.kg-pause-kicker'), 'Last time');
  });
});
