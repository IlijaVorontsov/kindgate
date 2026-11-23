// background.js — the heartbeat the container app's checklist relies on.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

describe('background heartbeat', () => {
  test('announces itself with the granted origins as soon as it starts', async () => {
    const page = load('background.js', { origins: ['*://www.youtube.com/*'], now: '2026-09-21 09:00' });
    await page.flush();
    assert.equal(page.runtime.native.length, 1);
    const { app, payload } = page.runtime.native[0];
    assert.equal(app, 'application.id');
    assert.equal(payload.type, 'alive');
    assert.deepEqual(payload.origins, ['*://www.youtube.com/*']);
    assert.equal(payload.at, page.clock.now());
  });

  test('reduces a reported host to youtube.com, instagram.com or other', async () => {
    const page = load('background.js');
    await page.flush();
    for (const [host, want] of [
      ['www.youtube.com', 'youtube.com'], ['m.youtube.com', 'youtube.com'], ['music.youtube.com', 'youtube.com'],
      ['www.instagram.com', 'instagram.com'], ['instagram.com', 'instagram.com'],
      ['notyoutube.com', 'other'], ['example.com', 'other'], ['', 'other'], [undefined, 'other'],
    ]) {
      page.runtime.native.length = 0;
      await page.runtime.deliver({ type: 'seen', host });
      page.clock.advance(61_000);   // past the throttle for the next host
      assert.equal(page.runtime.native[0]?.payload.host, want, `host ${host}`);
      assert.equal(page.runtime.native[0]?.payload.standalone, false);
    }
  });

  test('never forwards a raw hostname to the app', async () => {
    const page = load('background.js');
    await page.flush();
    await page.runtime.deliver({ type: 'seen', host: 'private-site.example.org' });
    const seen = page.runtime.native.find((m) => m.payload.type === 'seen');
    assert.equal(seen.payload.host, 'other');
    assert.equal(JSON.stringify(seen.payload).includes('private-site'), false);
  });

  test('throttles repeat reports per site to one a minute, Home Screen opens counted separately', async () => {
    const page = load('background.js');
    await page.flush();
    page.runtime.native.length = 0;
    await page.runtime.deliver({ type: 'seen', host: 'www.youtube.com' });
    await page.runtime.deliver({ type: 'seen', host: 'm.youtube.com' });
    assert.equal(page.runtime.native.length, 1, 'second report within a minute dropped');
    await page.runtime.deliver({ type: 'seen', host: 'www.youtube.com', standalone: true });
    assert.equal(page.runtime.native.length, 2, 'a Home Screen open is its own key');
    assert.equal(page.runtime.native[1].payload.standalone, true);
    page.clock.advance(60_000);
    await page.runtime.deliver({ type: 'seen', host: 'www.youtube.com' });
    assert.equal(page.runtime.native.length, 3, 'sent again after the throttle');
  });

  test('ignores messages it does not understand', async () => {
    const page = load('background.js');
    await page.flush();
    page.runtime.native.length = 0;
    await page.runtime.deliver({ type: 'other' });
    await page.runtime.deliver(null);
    await page.runtime.deliver('seen');
    assert.equal(page.runtime.native.length, 0);
  });
});
