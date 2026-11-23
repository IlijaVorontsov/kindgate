# Tests

Kindgate ships as plain scripts with no build step, and that stays true. This
folder adds an automated layer *around* them without touching how they ship:

| Layer | Command | Needs | What it proves |
|---|---|---|---|
| Static checks | `npm run check` | Node ≥ 22 | The repo obeys its own rules: manifest references exist, permissions are the declared two, `brand.css` loads first, no raw colours creep in, nothing at the root ships by accident, every script parses, no network calls. |
| Behaviour tests | `npm test` | Node ≥ 22, `npm install` once | Each content script does what `README.md` says, run against a fake page: redirects, taps, the clock, storage changes, failure modes. |
| Changelog gate | `python3 scripts/changelog.py check` | Python 3 | A branch that changes code carries a user-facing fragment. |
| On-device QA | [`QA.md`](QA.md) | An iPhone, `bash build.sh` | What no simulator can: Safari's real event order, layout on the sites as they are today, the container app. |

`npm run qa` runs the first three. CI runs them on every pull request
(`.github/workflows/ci.yml`). The device pass is manual and part of the
definition of done for anything that touches a content script.

## Running

```sh
npm install          # once; installs jsdom, the only dependency, dev-only
npm test             # everything
npm run check        # static checks only, no install needed
node --test test/warm.test.js            # one file
node --test --test-name-pattern night    # by name
npm run test:watch   # re-run on save
```

The runner is Node's built-in `node:test`; there is no framework to learn.
Assertions come from `node:assert/strict`.

## How a test works

The content scripts are strict IIFEs that reach for `browser`, `location`,
`Date`, the timers and the DOM as free globals and export nothing. So
`harness.js` does not import them. It reads the file, wraps the source in a
function whose *parameters* shadow those globals, and calls it with fakes:

```js
const { load } = require('./harness');

const page = load('warm.js', {
  url: 'https://www.youtube.com/watch?v=abc',   // sets host, origin, jsdom's own location
  now: '2026-09-21 23:30',                       // local time, as getHours() sees it
  storage: { fgWarm: { warmth: 100 } },          // browser.storage.local contents
});
await page.flush();                              // let storage reads settle
assert.ok(page.$('#kg-warm'));
```

What you get back:

| Field | Meaning |
|---|---|
| `page.$`, `page.$$`, `page.text` | `querySelector`, `querySelectorAll` as an array, trimmed `textContent` |
| `page.nav` | Every navigation the script asked for: `[{ how: 'replace' \| 'assign' \| 'href', url }]`. jsdom's own `location` cannot navigate, so the script gets a recording one. |
| `page.storage` | The fake `browser.storage.local`. `.data` is a snapshot, `.calls` the call log. `await page.storage.set({...})` fires `onChanged` the way the popup would. |
| `page.runtime` | `.sent` (`runtime.sendMessage`), `.native` (`sendNativeMessage`), `.deliver(msg)` to poke a background listener. |
| `page.clock` | `.advance(ms)` fires due timers in order and moves `Date.now()` with them. `.set(when)` jumps without firing. |
| `page.tap(el)` | A real iOS tap: `touchstart`, `touchend`, then the synthesised `click`. The scripts' `onTap()` must fire exactly once. |
| `page.click(el)` | A bare click; returns the event so you can read `defaultPrevented`. |
| `page.spa(path)` | A route change via `history.pushState`, as YouTube and Instagram do it. |
| `page.domReady()` | With `loading: true`, finish parsing and fire `DOMContentLoaded`. |

Load options worth knowing: `loading: true` simulates `document_start`
(`readyState` is `'loading'`, `document.body` may be empty); `localStorage` and
`sessionStorage` seed the page's own storage before the script runs (the
feature mirror, the redirect loop guard, the night tab pass); `storageFail`
and `storageStall` make every storage call reject or hang *from the first
call*, which is the only way to test the fail-open paths; `noStorage` removes
the extension API altogether (a desktop browser); `globals` overrides anything
else, for instance `{ window: { top: {} } }` to be inside a frame.

`fetch` always rejects. Nothing in a test may reach the network, and the
static checks confirm the scripts never try.

## Writing one

- One file per script, `test/<script>.test.js`. Start from the nearest
  existing file.
- Name tests after the behaviour in `README.md`, not the function. If the
  README does not say it, decide whether it should, and write that sentence
  first.
- Put the time in the test. Windows, ramps, cooldowns and goals all read the
  clock; a test that uses the real clock will pass at noon and fail at night.
  `2026-09-21` is a Monday; `2026-09-26` a Saturday.
- Prefer asserting what the user sees (an element, its text, a disabled
  button, a navigation) over what the code did. When a private function is
  the only sensible seam, test it through the smallest DOM that reaches it.
- Every failure mode the changelog promises gets a test: storage unreadable,
  storage never answering, a corrupt setting, a redirect loop.
- Nothing about the fakes is clever. If a script needs a global the harness
  does not provide, add it to `globals` in `harness.js` with the smallest
  faithful stub, and say in a comment what it stands in for.

## What this cannot tell you

jsdom has no layout, so nothing here measures pixels: `getBoundingClientRect`
returns zeros, `:has()` and `mix-blend-mode` are not rendered, and the CSS
files are not applied at all. Whether a selector still matches *today's*
Instagram markup, whether Safari delivers `touchend` before `click` on a given
control, whether the theme-color tint actually reaches the toolbar: only the
phone answers those. That is what `QA.md` is for.
