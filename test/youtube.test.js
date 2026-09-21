// youtube.js — redirects and tap interception (README "YouTube").
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const YT = 'https://www.youtube.com';
const at = (path, opts) => load('youtube.js', { url: YT + path, loading: true, ...opts });

describe('youtube: URL enforcement at document_start', () => {
  test('a Shorts URL opens in the normal player', () => {
    const page = at('/shorts/dQw4w9WgXcQ?feature=share');
    assert.deepEqual(page.nav, [{ how: 'replace', url: `${YT}/watch?v=dQw4w9WgXcQ` }]);
  });

  test('Home, Explore, Trending and the bare Shorts feed land on Subscriptions', () => {
    for (const p of ['/', '/shorts', '/shorts/', '/feed/explore', '/feed/trending/']) {
      const page = at(p);
      assert.deepEqual(page.nav, [{ how: 'replace', url: `${YT}/feed/subscriptions` }], `path ${p}`);
    }
  });

  test('watch pages, search, channels and Subscriptions itself are left alone', () => {
    for (const p of ['/watch?v=abc', '/results?search_query=x', '/@somechannel', '/feed/subscriptions', '/playlist?list=PL1', '/feed/history']) {
      assert.deepEqual(at(p).nav, [], `path ${p}`);
    }
  });

  test('also works on the mobile host', () => {
    const page = load('youtube.js', { url: 'https://m.youtube.com/', loading: true });
    assert.deepEqual(page.nav, [{ how: 'replace', url: 'https://m.youtube.com/feed/subscriptions' }]);
  });

  test('switched-off features do not redirect (read from the synchronous mirror)', () => {
    assert.deepEqual(at('/', { localStorage: { 'fg:features': { ytHome: false } } }).nav, []);
    assert.deepEqual(at('/shorts/dQw4w9WgXcQ', { localStorage: { 'fg:features': { ytShorts: false } } }).nav, []);
    // A garbage mirror falls back to the defaults, not to "everything off".
    assert.equal(at('/', { localStorage: { 'fg:features': '{not json' } }).nav.length, 1);
  });

  test('stands down after three redirects in ten seconds instead of looping', () => {
    const now = new Date('2026-09-21T12:00:00').getTime();
    const hops = [now - 3000, now - 2000, now - 1000];
    const page = at('/', { now, sessionStorage: { 'kg-hops': hops } });
    assert.deepEqual(page.nav, [], 'fourth hop within 10 s is not taken');
    const stale = at('/', { now, sessionStorage: { 'kg-hops': hops.map((t) => t - 20_000) } });
    assert.equal(stale.nav.length, 1, 'old hops are forgotten');
  });

  test('the storage copy refreshes the mirror and the feature classes', async () => {
    const page = at('/watch?v=abc', { storage: { fgFeatures: { ytComments: false } } });
    await page.domReady();
    assert.equal(JSON.parse(page.window.localStorage.getItem('fg:features')).ytComments, false);
    assert.equal(page.document.documentElement.classList.contains('kg-yt-comments'), false);
    assert.ok(page.document.documentElement.classList.contains('kg-yt-shorts'));
    await page.storage.set({ fgFeatures: { ytComments: true } });
    assert.ok(page.document.documentElement.classList.contains('kg-yt-comments'), 'popup change applied live');
  });
});

describe('youtube: in-page navigation', () => {
  test('a SPA route into Shorts is redirected too', async () => {
    const page = at('/watch?v=abc');
    await page.domReady();
    await page.spa('/shorts/zzzzzzzzzzz');
    assert.deepEqual(page.nav, [{ how: 'replace', url: `${YT}/watch?v=zzzzzzzzzzz` }]);
  });

  test('a tap on a Shorts link is swallowed before YouTube sees it', async () => {
    const page = at('/watch?v=abc', { html: '<!doctype html><body><a id="s" href="/shorts/abcdefg">Shorts</a><a id="ok" href="/watch?v=x">Video</a></body>' });
    await page.domReady();
    const yt = [];
    page.window.addEventListener('click', () => yt.push('yt saw it'));   // YouTube's own bubbling handler
    assert.equal(page.click('#s').defaultPrevented, true);
    assert.equal(page.click('#ok').defaultPrevented, false);
    assert.deepEqual(yt, ['yt saw it'], 'the ordinary link still reaches the site');
  });

  test('a tap on the logo or Home goes to Subscriptions once, not once per event', async () => {
    const page = at('/watch?v=abc', { html: '<!doctype html><body><a id="home" href="/">Home</a></body>' });
    await page.domReady();
    await page.tap('#home');   // touchstart, touchend and click
    assert.deepEqual(page.nav, [{ how: 'assign', url: `${YT}/feed/subscriptions` }]);
  });

  test('taps inside Kindgate\'s own card are never intercepted', async () => {
    const page = at('/watch?v=abc', { html: '<!doctype html><body><div class="kg-checkin"><a id="a" href="/shorts/abcdefg">x</a></div></body>' });
    await page.domReady();
    assert.equal(page.click('#a').defaultPrevented, false);
  });
});
