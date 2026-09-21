# On-device QA

The automated tests prove the logic. This pass proves the product, on the one
platform it runs on. Do the **smoke** section for any branch that touches a
content script; do the **full** pass before a TestFlight or App Store build.
Copy the relevant section into the PR description and tick as you go.

Setup: `bash build.sh` onto the paired iPhone, the extension enabled in
Settings › Safari › Extensions with youtube.com and instagram.com allowed, and
Safari's Web Inspector open on the Mac (Develop › your iPhone) to watch for
console errors. Reset between runs by deleting and reinstalling the app, which
clears the extension's storage.

## Smoke (every content-script PR)

- [ ] `npm run qa` passes locally and CI is green.
- [ ] YouTube opens on Subscriptions, `/shorts/<id>` opens the normal player, a
      Shorts tap does nothing, the logo goes to Subscriptions.
- [ ] Instagram home shows the Following feed, Reels and Explore bounce back,
      no "Sponsored" post visible after a scroll.
- [ ] Daytime check-in appears on the first open of each site, one tap logs and
      the toast shows; no card for 20 minutes after.
- [ ] Set the night window to start now: any site shows the night screen,
      "Continue anyway" counts down and works once, an allow-listed site is let
      through.
- [ ] Warm overlay: set the start time to now, page turns amber within a minute,
      set it back, it clears. Page stays tappable underneath.
- [ ] A pause site shows the pause screen with the page hidden behind it; a
      normal site never flashes blank.
- [ ] No errors in the Web Inspector console from `kg`/Kindgate scripts.

## Full pass (before a release)

### YouTube
- [ ] Home, Explore, Trending → Subscriptions, both on www and m hosts.
- [ ] Shorts URL, Shorts link, Shorts tab, Shorts shelf on the feed: none reachable.
- [ ] Watch page: no recommendations, no comments entry point, autoplay off,
      Kindgate's own bottom bar with the two entries works.
- [ ] Subscriptions feed: thumbnails hidden when the option is on, text list scrolls.
- [ ] Picture in Picture and rotate helpers do what the popup says; speed and
      quality preferences stick across videos.
- [ ] Toggle each YouTube feature off in the popup and confirm the page reacts
      without a reload; toggle back on.
- [ ] Signed-out YouTube does not redirect-loop (open in a private tab).

### Instagram
- [ ] Following feed forced; `/reels/`, `/reel/`, `/explore/` bounce back.
- [ ] Suggested-for-you carousel, suggested posts after "caught up": hidden.
- [ ] Sponsored posts and story-tray ads hidden; a caption mentioning
      "sponsored" is not.
- [ ] Checkpoint (if on): appears every N posts as configured.
- [ ] Profiles, posts, DMs, stories untouched.

### Check-in, windows, morning
- [ ] Cue card on YouTube and Instagram by day; not on other sites.
- [ ] After-work window: plans card, plan taps leave the site and log a win,
      snooze shows the 10-minute timer on return.
- [ ] Morning window: checklist, finishing it once means done for the day.
- [ ] Night: sleep screen on every site, breathing runs, NSDR link opens the
      configured video with a pass (no second card on it).
- [ ] Night allow-list, per-tab "continue", switched-off window all behave.
- [ ] Coffee timer toast fires at the configured delay after the morning window.
- [ ] Safari's toolbar tints to match the card and returns to normal on close.
- [ ] Text under the toolbar and home indicator fades rather than clips.

### Pause
- [ ] Built-in list, hand-written list, and each bundled list (adult, social,
      gambling) trigger on a matching site.
- [ ] Goal modes: abstain, weekends only, not after, not before, not at work,
      each changes the title and the countdown length.
- [ ] Feeling → replacement → logged; "Leave" logged; "Continue anyway" grants
      ten minutes on the site; at night it hands over to the night timer.
- [ ] "Last time" review appears after an out-of-goal continue.
- [ ] A non-pause site never stays blank (kill Safari mid-load and reopen).

### Warm overlay
- [ ] Ramps in over the configured minutes, full strength inside, ramps out.
- [ ] Skip list honoured; fullscreen video stays tinted.
- [ ] Strength sliders in the popup apply live.

### Upsell / open-in-app
- [ ] No Smart App Banner on YouTube or Instagram.
- [ ] In-page "Open in app" sheets hidden; real controls labelled "Open" intact.
- [ ] Switch off in the popup: banners return.

### Popup and container app
- [ ] Every control in the popup reads and writes its setting and the page
      reacts without a reload; the cue breakdown and copy-to-clipboard work.
- [ ] Container app checklist goes green for: extension on, each site allowed,
      Home Screen shortcut detected.
- [ ] Fresh install: first open of the popup shows sensible defaults.
- [ ] Update install (over the previous build): existing settings survive, a
      tab left open across the update loads normally.

### Release checklist
- [ ] `python3 scripts/changelog.py preview` reads as release notes a user would
      want.
- [ ] `README.md` matches every behaviour ticked above.
- [ ] `manifest.json` version bumped by the release script; tag pushed.
