// checkin.js — cue check-in, window cards and the night screen
// (README "Cue check-in", "Evening plan", "Night").
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const YT = 'https://www.youtube.com/watch?v=abc';
// Monday 2026-09-21. Windows by default: 06:00–08:30, 17:30–20:00, 21:30–06:00.
const DAY = '2026-09-21 14:00';
const EVENING = '2026-09-21 18:30';
const NIGHT = '2026-09-21 23:00';

async function open(opts) {
  const page = load('checkin.js', opts);
  await page.flush();
  return page;
}

describe('check-in: where and when it appears', () => {
  test('daytime on YouTube: the cue card', async () => {
    const page = await open({ url: YT, now: DAY });
    assert.ok(page.$('.kg-checkin'));
    assert.equal(page.text('.kg-kicker'), 'Quick check-in');
    assert.equal(page.$('.kg-checkin').getAttribute('role'), 'dialog');
    assert.ok(page.document.documentElement.classList.contains('kg-checkin-open'));
  });

  test('daytime on any other site: nothing', async () => {
    const page = await open({ url: 'https://example.com/', now: DAY });
    assert.equal(page.$('.kg-checkin, .kg-sleep, .kg-timer, .kg-morning'), null);
  });

  test('a 20-minute cooldown after the last check-in on that site', async () => {
    const t = new Date('2026-09-21T14:00:00').getTime();
    const cooled = await open({ url: YT, now: DAY, storage: { fgLast_youtube: t - 19 * 60_000 } });
    assert.equal(cooled.$('.kg-checkin'), null, 'within 20 minutes');
    const due = await open({ url: YT, now: DAY, storage: { fgLast_youtube: t - 21 * 60_000 } });
    assert.ok(due.$('.kg-checkin'), 'after 20 minutes');
    const ig = await open({ url: 'https://www.instagram.com/', now: DAY, storage: { fgLast_youtube: t } });
    assert.ok(ig.$('.kg-checkin'), 'the cooldown is per site');
  });

  test('after-work window on YouTube: the plans card with a slow "continue"', async () => {
    const page = await open({ url: YT, now: EVENING });
    assert.match(page.text('.kg-kicker'), /^After-work window/);
    const cont = page.$$('button.kg-link').find((b) => /Continue anyway/.test(b.textContent));
    assert.ok(cont, 'continue link present');
    assert.equal(cont.disabled, true);
    assert.equal(cont.textContent, 'Continue anyway (10)');
    page.clock.advance(9_000);
    assert.equal(cont.disabled, true);
    page.clock.advance(1_000);
    assert.equal(cont.disabled, false);
    assert.equal(cont.textContent, 'Continue anyway');
    assert.equal(page.storage.data.fgWindowShownKey, 'work', 'the popup status line is fed');
  });

  test('night: the sleep screen on every site, with the toolbar tinted', async () => {
    const page = await open({ url: 'https://example.com/', now: NIGHT });
    assert.ok(page.$('.kg-sleep'));
    const meta = page.$('meta[name="theme-color"]');
    assert.ok(meta, 'theme-color meta added');
    assert.equal(page.document.head.firstChild, meta, 'and it comes first so Safari honours it');
  });

  test('night: sites on the allow-list are let through, subdomains included', async () => {
    const page = await open({ url: 'https://docs.example.com/', now: NIGHT, storage: { fgNightAllow: ['Example.com'] } });
    assert.equal(page.$('.kg-sleep'), null);
    const other = await open({ url: 'https://example.org/', now: NIGHT, storage: { fgNightAllow: ['example.com'] } });
    assert.ok(other.$('.kg-sleep'));
  });

  test('night: a tab that was continued stays open, a new tab does not', async () => {
    const passed = await open({ url: YT, now: NIGHT, sessionStorage: { 'fg:nightPass': '1' } });
    assert.equal(passed.$('.kg-sleep'), null);
    const fresh = await open({ url: YT, now: NIGHT });
    assert.ok(fresh.$('.kg-sleep'));
  });

  test('night: a switched-off night window means no night screen', async () => {
    const page = await open({ url: YT, now: NIGHT, storage: { fgWindows: { night: { on: false } } } });
    assert.equal(page.$('.kg-sleep'), null);
    assert.ok(page.$('.kg-checkin'), 'falls back to the daytime check-in');
  });

  test('night: a snoozed return shows the timer, not the sleep screen', async () => {
    const page = await open({ url: YT, now: NIGHT, storage: { fgSnooze_night: new Date('2026-09-21T23:05:00').getTime() } });
    assert.ok(page.$('.kg-timer'));
    assert.equal(page.$('.kg-sleep'), null);
  });

  test('never mounts twice: a second start while one card is up is ignored', async () => {
    const page = await open({ url: YT, now: DAY });
    page.window.dispatchEvent(new page.window.Event('kg-pause-continued'));
    await page.flush();
    assert.equal(page.$$('.kg-checkin').length, 1);
  });

  test('fails open: unreadable storage shows nothing rather than a card with default settings', async () => {
    const page = load('checkin.js', { url: 'https://example.com/', now: NIGHT, storageFail: true });
    await page.flush();
    assert.equal(page.$('.kg-sleep, .kg-checkin'), null);
  });
});

describe('check-in: logging a cue', () => {
  test('one tap logs the cue with the site and closes the card; a toast follows', async () => {
    const page = await open({ url: YT, now: DAY });
    const chip = page.$$('button.kg-chip').find((b) => b.textContent === 'Bored');
    await page.tap(chip);
    assert.equal(page.$('.kg-checkin'), null, 'card closed');
    assert.equal(page.document.documentElement.classList.contains('kg-checkin-open'), false);
    assert.equal(page.$('meta[name="theme-color"]'), null, 'toolbar tint removed');
    const cues = page.storage.data.fgCues;
    assert.equal(cues.length, 1);
    assert.deepEqual(cues[0], { t: page.clock.now(), site: 'youtube', cue: 'bored' });
    assert.equal(page.storage.data.fgLast_youtube, page.clock.now());
    assert.match(page.text('.kg-toast'), /Bored\. First one logged\./);
  });

  test('the site column is a fixed enum, never a hostname', async () => {
    const page = await open({ url: 'https://www.instagram.com/someone/', now: DAY });
    await page.tap(page.$$('button.kg-chip').find((b) => b.textContent === 'Tired'));
    assert.equal(page.storage.data.fgCues[0].site, 'instagram');
    assert.doesNotMatch(JSON.stringify(page.storage.data), /instagram\.com|someone/);
  });

  test('other sites only take part at night', async () => {
    const page = await open({ url: 'https://example.com/', now: EVENING });
    assert.equal(page.$('.kg-checkin, .kg-sleep, .kg-timer'), null, 'no after-work card on a random site');
  });

  test('the log is capped so storage cannot grow without bound', async () => {
    const t = new Date('2026-09-21T14:00:00').getTime();
    const many = Array.from({ length: 3000 }, (_, i) => ({ t: t - i, site: 'youtube', cue: 'habit' }));
    const page = await open({ url: YT, now: DAY, storage: { fgCues: many } });
    await page.tap(page.$$('button.kg-chip')[0]);
    assert.equal(page.storage.data.fgCues.length, 3000);
    assert.equal(page.storage.data.fgCues.at(-1).cue, 'bored', 'newest kept, oldest dropped');
  });

  test('skip just resets the cooldown', async () => {
    const page = await open({ url: YT, now: DAY });
    await page.tap(page.$$('button.kg-link').find((b) => b.textContent === 'Skip'));
    assert.equal(page.$('.kg-checkin'), null);
    assert.equal(page.storage.data.fgCues, undefined);
    assert.equal(page.storage.data.fgLast_youtube, page.clock.now());
  });
});
