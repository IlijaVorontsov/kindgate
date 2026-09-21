# Kindgate

Safari web extension (iOS/iPadOS, Manifest V3) that strips YouTube and
Instagram down to intentional use and adds cue check-ins, pause screens and a
night-time warm overlay. Plain JavaScript and CSS, no bundler, no package
manager, no test runner. `README.md` is the user-facing behaviour spec; keep it
accurate when behaviour changes.

## Layout

- `manifest.json` — content scripts, permissions, popup. `version` is the
  release number (major.minor, e.g. `6.3`).
- `youtube.js/.css`, `instagram.js/.css` — site-specific content scripts,
  `document_start`.
- `checkin.js/.css` — cue check-in shown on every page open.
- `pause.js/.css`, `warm.js/.css` — pause screen and warm/dim overlay on all URLs.
- `pip.js/.css`, `player.js` — YouTube player helpers, `document_idle`.
- `upsell.js` — nudges on YouTube/Instagram.
- `popup.html/.js/.css` — extension settings popup.
- `brand.css` — colour and type tokens (honey, sage, ink, cream, sand,
  amber ink). Loaded first in every content-script entry and by the popup;
  no other stylesheet should carry a raw hex.
- `fonts/` — Fraunces and Instrument Sans, Latin subsets, OFL 1.1. Declared
  in `web_accessible_resources` so injected CSS can reach them.
- `background.js` — status heartbeat for the container app. Sends a native
  message when the extension starts and when a content script reports a site,
  which is the only way the app can know either.
- `app/` — the container app's own files (Swift, storyboard, entitlements).
  `build.sh` overlays this folder onto the project the converter generates, so
  the converter owns `project.pbxproj` and `app/` owns the app.
- `build.sh` — converts the folder to an Xcode project in `../Kindgate-Xcode`,
  builds and installs on the paired iPhone. `--release` archives a signed
  `.ipa`, `--upload` sends it to App Store Connect. Writes `build.log` (ignored).
- `scripts/app-icon.sh` — renders `images/icon.svg` into the app target's
  icon set on every build; the converter's placeholder is transparent and
  App Store Connect rejects it.
- `CHANGELOG.md`, `changelog.d/`, `scripts/changelog.py` — release notes, see below.
- `site/` — the kindgate.app website (Cloudflare Pages), see `site/README.md`.
  Not part of the extension; `changelog.py check` ignores it.

Strategy, market research, pricing and go-to-market notes are **not** kept in
this repository and must not be committed to it, in any branch. They live
outside the checkout entirely. `docs/` is ignored so they cannot come back by
accident. Runbooks (TestFlight, release), the website and anything that needs
a secret live in the private ops repo `IlijaVorontsov/kindgatex`, whose
workflows act on this repo.

`build.sh` stages the extension into a folder of its own before handing it to
the converter, and the `STRIP` list is what it leaves out. Anything in the repo
root that is not part of the extension must be in that list, or it ends up
inside the signed `.appex`. Add to `STRIP` whenever you add a non-extension file
or folder to the root.

## Conventions

- Content scripts run in Safari on iOS. Test on a real device via `bash build.sh`;
  there is no automated test suite.
- Keep each concern in its own script/css pair; register new pairs in
  `manifest.json` with the narrowest `matches` that works.
- Storage goes through `browser.storage.local`. No remote calls.
- Only the `storage` permission is declared. Adding a permission needs a
  `security` changelog fragment explaining why.

## Git workflow: feature branches, rebase

- `main` is always releasable. Never commit directly to `main`.
- Branch from up-to-date `main` for every change:
  `git switch -c <type>/<short-topic>` where type is `feat`, `fix`, `chore`,
  `docs` or `refactor`.
- Rebase is the default integration strategy. `pull.rebase=true` is set in the
  repo config; run `git fetch && git rebase origin/main` before opening or
  updating a PR. No merge commits from `main` into a feature branch.
- Integrate with a fast-forward or rebase merge (`git merge --ff-only` locally,
  "Rebase and merge" on GitHub). Squash only when the branch history is noise.
- Force-push only your own feature branch, and only with `--force-with-lease`.
- Commit messages: imperative subject ≤ 72 chars, blank line, body explaining
  *why*. One logical change per commit.

## Changelog: Keep a Changelog + `changelog.d/`

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and is only edited by the release script. Day-to-day changes are recorded as
fragments in `changelog.d/` so parallel branches never conflict on one file.

- Every user-visible change on a branch adds a fragment:
  `changelog.d/<topic>.<type>.md`, where `<type>` is one of
  `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`.
  `<topic>` is the branch topic or issue number. Example:
  `changelog.d/warm-overlay.added.md`.
- A fragment is one or more Markdown list lines written for users, not
  developers ("Warm, dimmed screen at night." not "add warm.js").
- Pure refactors, build tweaks and doc-only changes need no fragment.
- `python3 scripts/changelog.py check` fails if the branch changes
  `*.js`, `*.css`, `*.html` or `manifest.json` relative to `origin/main` but
  adds no fragment. Run it before opening a PR.
- Preview the assembled section: `python3 scripts/changelog.py preview`.
- Release: `python3 scripts/changelog.py release <version>` folds the fragments
  into a new `## [<version>] - <date>` section, deletes them, bumps
  `manifest.json`'s `version` and updates the compare links. Commit that as
  `chore: release <version>` on a branch, merge, then tag `v<version>`.

## Definition of done for a PR

1. Branch rebased on `origin/main`, history clean.
2. Fragment in `changelog.d/` if the change is user-visible (`changelog.py check` passes).
3. `README.md` updated if behaviour or limitations changed.
4. Built and tried on device with `bash build.sh` for anything touching a
   content script.
