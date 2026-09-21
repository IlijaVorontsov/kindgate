// instagram.js — Following-only feed, no Reels/Explore, ads hidden (README "Instagram").
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const IG = 'https://www.instagram.com';
const at = (path, opts) => load('instagram.js', { url: IG + path, loading: true, ...opts });
const FOLLOWING = `${IG}/?variant=following`;

describe('instagram: URL enforcement at document_start', () => {
  test('the home feed is forced into the Following view', () => {
    assert.deepEqual(at('/').nav, [{ how: 'replace', url: FOLLOWING }]);
    assert.deepEqual(at('/?variant=following').nav, [], 'already there');
    assert.deepEqual(at('/?variant=home').nav, [{ how: 'replace', url: FOLLOWING }], 'the algorithmic variant');
  });

  test('Reels and Explore go back to the Following feed', () => {
    for (const p of ['/reels/', '/reels/abc/', '/reel/', '/explore/', '/explore/tags/x/']) {
      assert.deepEqual(at(p).nav, [{ how: 'replace', url: FOLLOWING }], `path ${p}`);
    }
  });

  test('profiles, posts, DMs and stories are left alone', () => {
    for (const p of ['/someone/', '/p/abc123/', '/direct/inbox/', '/stories/someone/1/', '/accounts/edit/']) {
      assert.deepEqual(at(p).nav, [], `path ${p}`);
    }
  });

  test('switched-off features do not redirect', () => {
    assert.deepEqual(at('/reels/', { localStorage: { 'fg:features': { igReels: false } } }).nav, []);
    assert.deepEqual(at('/', { localStorage: { 'fg:features': { igFollowing: false } } }).nav, []);
  });

  test('stands down after three redirects in ten seconds', () => {
    const now = new Date('2026-09-21T12:00:00').getTime();
    const page = at('/', { now, sessionStorage: { 'kg-ig-hops': [now - 3000, now - 2000, now - 1000] } });
    assert.deepEqual(page.nav, []);
  });

  test('a tap on a Reels link is swallowed', async () => {
    const page = at('/?variant=following', { html: '<!doctype html><body><a id="r" href="/reels/">Reels</a><a id="p" href="/someone/">Profile</a></body>' });
    await page.domReady();
    assert.equal(page.click('#r').defaultPrevented, true);
    assert.equal(page.click('#p').defaultPrevented, false);
  });
});

describe('instagram: feed sweep', () => {
  const feed = (inner) => `<!doctype html><body><main role="main"><section>${inner}</section></main></body>`;
  const post = (id, header) => `<article id="${id}"><header><div><span>${header}</span></div></header><div>caption</div></article>`;

  test('hides a post whose header says Sponsored, but not one that merely mentions it', async () => {
    const page = at('/?variant=following', { html: feed(post('ad', 'Sponsored') + post('de', 'Gesponsert') + post('ok', 'someone') + '<article id="cap"><header><span>me</span></header><p>This is not sponsored content</p></article>') });
    await page.domReady();
    page.clock.advance(1000);
    await page.flush();
    assert.ok(page.$('#ad').hasAttribute('data-kindgate-hidden'), 'English ad hidden');
    assert.ok(page.$('#de').hasAttribute('data-kindgate-hidden'), 'German ad hidden');
    assert.equal(page.$('#ok').hasAttribute('data-kindgate-hidden'), false, 'a normal post stays');
    assert.equal(page.$('#cap').hasAttribute('data-kindgate-hidden'), false, 'a caption mentioning the word stays');
  });

  test('a suggested-posts block is hidden once it appears', async () => {
    const page = at('/?variant=following', { html: feed(post('ok', 'someone')) });
    await page.domReady();
    const div = page.document.createElement('div');
    div.id = 'sugg';
    div.innerHTML = '<h4>Suggested for you</h4><ul><li>a</li><li>b</li></ul>';
    page.$('section').appendChild(div);
    await page.flush();
    page.clock.advance(1000);
    await page.flush();
    assert.ok(page.$('#sugg').closest('[data-kindgate-hidden]'), 'suggestion block hidden');
    assert.equal(page.$('#ok').hasAttribute('data-kindgate-hidden'), false);
  });
});
