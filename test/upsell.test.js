// upsell.js — "open in app" prompts (README "Open in app prompts").
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const YT = 'https://m.youtube.com/watch?v=abc';
const META = '<meta name="apple-itunes-app" content="app-id=544007664">';

describe('upsell: Smart App Banner', () => {
  test('strips the meta tag that is already in the page', () => {
    const page = load('upsell.js', { url: YT, html: `<!doctype html><html><head>${META}</head><body></body></html>` });
    assert.equal(page.$('meta[name="apple-itunes-app"]'), null);
  });

  test('strips a meta tag inserted later, before Safari can act on it', async () => {
    const page = load('upsell.js', { url: YT, loading: true });
    const m = page.document.createElement('meta');
    m.name = 'apple-itunes-app'; m.content = 'app-id=1';
    page.document.head.appendChild(m);
    await page.flush();
    assert.equal(page.$('meta[name="apple-itunes-app"]'), null);
  });
});

describe('upsell: in-page banners', () => {
  const body = (inner) => `<!doctype html><html><head></head><body>${inner}<main><p>content</p><a href="/watch?v=x">A video</a></main></body></html>`;

  test('hides the small box around an "Open in the YouTube app" button', async () => {
    const page = load('upsell.js', { url: YT, html: body('<div id="nag"><span>Watch more</span><button>Open in the YouTube app</button></div>') });
    await page.flush();
    assert.ok(page.$('#nag').hasAttribute('data-kindgate-hidden'));
  });

  test('matches the German phrasing and App Store links', async () => {
    const page = load('upsell.js', { url: YT, html: body('<div id="de"><a role="button">In der App öffnen</a></div><div id="link"><a href="itms-apps://apps.apple.com/x">Get the app</a></div>') });
    await page.flush();
    assert.ok(page.$('#de').hasAttribute('data-kindgate-hidden'));
    assert.ok(page.$('#link').hasAttribute('data-kindgate-hidden'));
  });

  test('never touches ordinary controls just because they say Open', async () => {
    const page = load('upsell.js', { url: YT, html: body('<div id="ctl"><button>Open</button><button>Open in</button><button>Share</button></div>') });
    await page.flush();
    assert.equal(page.$('#ctl').hasAttribute('data-kindgate-hidden'), false);
    assert.equal(page.$$('[data-kindgate-hidden]').length, 0);
  });

  test('a banner that arrives later is caught by the observer', async () => {
    const page = load('upsell.js', { url: YT, html: body('') });
    await page.flush();
    const div = page.document.createElement('div');
    div.id = 'late';
    div.innerHTML = '<button>Use the app</button>';
    page.document.body.prepend(div);
    await page.flush();
    page.clock.advance(400);
    assert.ok(page.$('#late').hasAttribute('data-kindgate-hidden'));
  });

  test('can be switched off from the popup', async () => {
    const page = load('upsell.js', { url: YT, storage: { fgBlockUpsell: false }, html: body('') });
    await page.flush();
    const div = page.document.createElement('div');
    div.id = 'late';
    div.innerHTML = '<button>Use the app</button>';
    page.document.body.prepend(div);
    await page.flush();
    page.clock.advance(3000);
    assert.equal(page.$('#late').hasAttribute('data-kindgate-hidden'), false);
  });
});
