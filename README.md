<div align="center">

<img src="images/icon-128.png" width="96" height="96" alt="">

# Kindgate

**A gate, not a wall.**

A Safari extension for iPhone and iPad that quiets YouTube and Instagram,
then asks one kind question instead of blocking anything.

[![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20iPadOS-1F1D1A)](https://kindgate.app)
[![Safari Web Extension](https://img.shields.io/badge/Safari-Web%20Extension%20MV3-D98E3A)](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
[![On-device](https://img.shields.io/badge/data-stays%20on%20device-6F8461)](#privacy)
[![License](https://img.shields.io/badge/license-MPL--2.0-A85F17)](LICENSE)

[kindgate.app](https://kindgate.app)

</div>

---

Blocking breeds wanting. Every hard blocker teaches you to route around it, and
the guilt after a slip does more damage than the slip. Kindgate takes the other
road: it removes the parts of YouTube and Instagram that are designed to keep
you there, and where a blocker would say no, it asks a question and offers a
way through.

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Privacy](#privacy)
- [Features in detail](#features-in-detail)
- [Project layout](#project-layout)
- [Brand](#brand)
- [Development](#development)
- [FAQ](#faq)
- [License](#license)

## What it does

| | |
| --- | --- |
| **YouTube, subscriptions only** | Opens on Subscriptions. No Home feed, no Shorts, no recommendations, no autoplay. Search, channels and playlists keep working. |
| **Instagram, people you follow** | Locked to the Following feed. Reels, Explore, suggested posts and sponsored posts are gone. |
| **A check-in, not a block** | Every so often a card asks what you were feeling ten seconds ago. One tap logs it. No verdict. |
| **Morning sequence** | For the first half hour after waking, a feed shows your own morning steps instead. Nothing to decide. |
| **Warm screen at night** | After your set hour every page eases toward candlelight. Contrast survives, layouts never break. |
| **Pause screen** | On sites you list, friction rather than a wall: breathing, a question, your pre-set alternative, and a countdown on "continue anyway". |
| **Hands off to Shortcuts** | Any button can run a shortcut of yours. Timers, reminders, whatever you already trust. |

> [!IMPORTANT]
> A Safari extension only affects Safari. It does nothing inside the YouTube or
> Instagram **apps**. To make it stick, delete those apps and add `youtube.com`
> and `instagram.com` to your Home Screen from Safari via Share, then "Add to
> Home Screen". Screen Time, under Content & Privacy, can stop the apps quietly
> coming back.

## Install

There is no App Store build yet. Until there is, you build it yourself on a Mac
with Xcode. A free Apple ID is enough.

### One command

With Xcode installed, your Apple ID added to it, and the iPhone plugged in and
unlocked:

```bash
bash build.sh
```

The script finds its own folder, converts the extension into a `Kindgate-Xcode`
folder beside it, signs it with your Personal Team, builds, and installs onto
the connected phone. Re-run it after editing any file here; it copies the
sources into the Xcode project, so edit *these* files rather than the copies
inside the project. The full log lands in `build.log`.

### By hand

<details>
<summary>Step by step, if you would rather not run the script</summary>

1. Copy this folder to your Mac. Install Xcode from the App Store and open it
   once so it installs its command-line tools.

2. Convert the web extension into an iOS app project:

   ```bash
   xcrun safari-web-extension-converter ~/Downloads/Kindgate \
     --project-location ~/Developer \
     --app-name Kindgate \
     --bundle-identifier app.kindgate \
     --ios-only --swift --no-open
   open ~/Developer/Kindgate/Kindgate.xcodeproj
   ```

3. In Xcode, open Settings then Accounts and add your Apple ID, which gives you
   a free "Personal Team". Select the project, then each of the two targets,
   `Kindgate` and `Kindgate Extension`, then Signing & Capabilities. Tick
   "Automatically manage signing" and choose your Personal Team. If Xcode says
   the bundle ID is taken, change `app.kindgate` to anything unique.

4. On the iPhone, turn on Developer Mode under Settings, Privacy & Security.
   That needs a restart. Connect the phone by cable, pick it as the run
   destination in Xcode and press Run. The first time, trust your developer
   certificate under Settings, General, VPN & Device Management.

5. Enable the extension under Settings, Apps, Safari, Extensions, Kindgate.
   Set both `youtube.com` and `instagram.com` to Allow, choosing "Always Allow"
   when Safari asks. For night mode to cover every site, set **Other Websites**
   to Allow as well.

6. Open youtube.com in Safari. It should land on `/feed/subscriptions` with no
   Home tab and no Shorts. Open instagram.com and it should land on
   `/?variant=following`.

</details>

### What the build script works around

Worth knowing if you ever convert by hand:

- `safari-web-extension-converter` names the app target after the app name
  while the extension keeps the identifier you passed. The case mismatch means
  the extension is no longer prefixed by its parent and signing fails, so the
  script rewrites both identifiers.
- Apple registers App IDs case-insensitively and never releases them. Once
  `…Kindgate` is registered, `…kindgate` is permanently unavailable to you.
  Pick a fresh base identifier rather than changing only the case.

### Free Apple ID limits

| | |
| --- | --- |
| Signed build expires after | 7 days, then plug in and press Run again |
| Sideloaded apps at once | 3 |
| App IDs per week | 10 |

A paid developer membership removes the seven-day limit and allows TestFlight
installs that last a year.

## Privacy

Everything stays on the phone, in the extension's own storage. There is no
account, no server and no analytics.

- The cue log records the time, the feeling and which of the two sites it was.
  It can never become a browsing history, because it only ever names those two.
- The pause log records the time, the feeling, the outcome and whether it was
  within your goal. Never a URL, never a hostname.
- Both can be copied out as JSON or cleared from the popup.
- The pause section can be locked with a PIN, hashed with PBKDF2 and salted per
  install. It keeps the section out of casual view on a shared phone. It is a
  curtain, not a lock: the log behind it is ordinary extension storage.
- The one thing that leaves the phone does so only when you press send. The
  optional "talk it through with Claude" button composes a short message about
  the moment, copies it to the clipboard and opens claude.ai for you to paste.

## Features in detail

### YouTube

Opens on **Subscriptions** rather than the Home feed. Home, Explore and Trending
all redirect there and their navigation buttons are removed. Every Shorts entry
point is hidden and any Shorts link opens in the normal player. Search,
subscriptions, watch pages, channels and playlists keep working.

The Subscriptions feed is a plain text list: thumbnails are hidden and the
inline preview players never start. YouTube drops its bottom tab bar from the
DOM while a video is open, so Kindgate supplies its own with **Subscriptions**
and **You**. Tapping the YouTube logo goes to Subscriptions.

On a watch page, what stays is the title, the channel row, Share and
Save-to-playlist, and the description. What goes is recommendations, the filter
chips above them, the Shorts shelf, the comments teaser and autoplay. A video
never rolls into the next one.

### Instagram

Locked to the accounts you follow: the Following feed is forced, Reels and
Explore are removed, and "Suggested for you" and sponsored posts are hidden.

Every so often, by default every 15 posts, a card shaped like a post is
inserted in the feed showing how many posts and minutes have gone by, with
"Keep going" and "That's enough". It is not a block. The point is to make the
scrolling a choice again.

> [!NOTE]
> An earlier version hid every sibling after "You're all caught up", which also
> hid the older posts below it and the sentinel that loads the next page, so the
> feed stopped loading at a few weeks old. Suggested content is matched by its
> own markers instead.

### Cue check-in

Each time you open either site, at most once per 20 minutes per site, a card
asks *"What were you feeling 10 seconds ago?"*. One tap logs it: bored, tired,
avoiding something, between tasks, lonely, stressed, just habit, or came for
something specific. The card closes on that single tap, and a toast then shows
your pattern for the week with a **Leave instead** button before fading by
itself.

Tapping the extension's icon in Safari, from the "aA" menu in the address bar,
opens the full breakdown by feeling, site, hour and weekday, and the export and
clear controls.

### Morning

A morning window, by default 06:00 to 08:30, in which opening a feed shows your
three pre-set steps instead. No question, nothing to decide.

The reasoning: for roughly 15 to 30 minutes after waking the anterior cortical
regions are still returning to waking blood flow (Balkin et al. 2002), so
executive control is at its lowest and behaviour follows whatever the context
cues (Neal, Wood & Drolet 2013). The decision therefore belongs to the night
before. The section also carries a five-point set-up routine, and says plainly
that habits took a median of about 66 days to settle in Lally (2010), with a
range of 18 to 254. Not 21.

**Coffee timer.** Ticking the first step marks when you got up. The morning page
counts down to your coffee time, by default 90 minutes and settable to 60, 90 or
120, and the next page you open after it passes carries a one-line alert.

### Evening plan

Two time windows, after work and night, with your own times and up to three
"instead, I will…" plans. Inside a window the check-in stops asking how you feel
and shows those plans as one-tap buttons, because the decision was made earlier.
It offers **Give it 10 minutes** rather than a flat no, since urges decay. That
opens a full-screen countdown with a quote, your plans underneath, and a
continue button that unlocks after the delay. Every plan you pick counts as a
win, with a weekly total and a day streak. "Continue anyway" sits behind a
ten-second countdown, so the impulsive path is a little slower than the planned
one.

### Night

Night mode covers **every website**, not just YouTube and Instagram. Inside the
night window any site opened in Safari lands on the can't-sleep page, sharing
one ten-minute timer. "Continue anyway" clears only the tab it was tapped in, a
per-tab pass, so every new tab lands on the page again. A per-line allowlist in
the popup exempts sites you may genuinely need, such as maps or banking.

The night landing page is different by design, because a walk makes no sense at
23:00. Instead of plans you get the **can't-sleep protocol**: one line of
framing, then CBT-I stimulus control, keeping light low, and a built-in
physiological-sigh breathing guide (Balban et al. 2023). It is drawn in dim
amber on black so the screen is not itself a light source. At the bottom sit
**Give it 10 minutes**, whose only exit at night is "phone on the charger", and
a continue that unlocks after ten seconds.

The wind-down audio button defaults to a 20-minute NSDR recording, offered again
whenever you log "tired" by day. A 25-minute pass lets that one video through
both the check-in and the night page. It always plays at 1x whatever your
default speed, and starts by itself where iOS allows; where it does not, one
large "Tap to start" button appears. Set your own link in the popup to replace
it.

**Warm screen.** After your set hour every page eases toward candlelight. The
overlay multiplies rather than washing the page out, so text contrast survives
and no layout breaks.

### Pause

Friction, not a wall, on sites you list. The default list covers common adult
sites; it takes words or domains and is editable in the popup.

The page is covered by a pause: a four-in, six-out breathing prompt, "what are
you feeling?" with bored, stressed, lonely, tired, actually aroused or just
habit, the replacement action you pre-set for that feeling, a Leave button, and
a "continue anyway" that unlocks after 10 to 20 seconds. Goals are flexible:
weekends only, not after a certain time, not at work, or stop altogether.
Outside the goal the pause runs full length; inside it, five seconds.

Nothing is ever a hard block. Hard blocks get circumvented and invite
all-or-nothing thinking.

At night the two layers run in sequence. The pause screen comes first, handling
the urge with night-aware wording, and its continue hands over to the ten-minute
night timer with the charger exit rather than opening the site. Only the timer's
own continue lets you through.

**Deliberately absent: streaks.** Progress is a trend, "down 40% this month", so
one slip erases nothing. Going ahead is "went ahead", never "relapse". The next
visit after a slip outside your goal opens with "One slip doesn't undo progress.
What was going on?". Patterns show when and why urges happen, which is more
actionable than a count. A six-question self-check based on the ICD-11
description of compulsive sexual behaviour points toward professional help when
the score is high. It is a pointer, not a diagnosis. No "dopamine detox", no
"reboot".

### Player and Picture in Picture

Watch pages get a **Picture in Picture** button. It is deliberately manual,
because iOS only grants PiP from a real user gesture. iOS stops any web page
playing once Safari is backgrounded and no extension API can change that. PiP is
the one exception the system honours, so the button strips the
`disablepictureinpicture` attribute that mobile YouTube sets on its player and
puts the video into PiP on one tap. The video keeps playing when you leave
Safari, and pushing the floating window off the screen edge continues it as
audio.

Turning the phone to landscape on a watch page asks the video to go fullscreen,
and turning it back leaves fullscreen. Rotation is not a user gesture, so WebKit
may refuse; a single **Tap for fullscreen** prompt then appears, and that tap is
a gesture. Both the PiP button and rotation start the video first if it is
paused or has not begun.

Playback preferences in the popup cover **unmute automatically**, a **default
speed** and a best-effort **default quality**. Speed and unmute are applied
straight to the video element and are reliable. Quality only nudges the
preference YouTube persists, because the player API lives in the page's
JavaScript world that a content script cannot reach, and YouTube's content
security policy blocks injecting a script to get there.

### "Open in app" prompts

On by default. The App Store Smart Banner is driven by an
`apple-itunes-app` meta tag that Safari acts on, so `upsell.js` runs at document
start and removes it as soon as it appears. The sites' own "use the app" banners
are found by their button label or App Store link, and the small box around them
is hidden.

### Shortcuts

An extension cannot send iOS notifications while Safari is closed, so for an
alert that actually buzzes it hands off to Shortcuts. Name a shortcut in the
popup and a button on the morning page opens
`shortcuts://run-shortcut?name=<name>&input=text&text=<minutes>`, Apple's
documented scheme. Clock and Reminders have no public URL scheme, so there is no
supported way to open them with parameters pre-filled.

The shortcut receives the number of minutes to wait as its input, so it needs an
**Adjust Date** action, adding Shortcut Input minutes to Current Date, feeding
the reminder's or timer's time. A fixed time ignores the input.

The popup has a shortcut-link builder, a button that opens
`shortcuts://create-shortcut`, a copyable recipe, a test button, and a field for
an iCloud share link so a shortcut is one tap to reinstall. Every "Optional
link" field accepts a `shortcuts://` URL, so any button in the extension can run
a shortcut of yours.

> [!NOTE]
> YouTube strips both the URL fragment and unknown query parameters before any
> content script runs, so an x-callback-url result cannot be read back there.
> The popup's Test button is the reliable check.

### The popup

Grouped into collapsible categories, Check-in & cues, Evening plan, Pause,
YouTube & feeds, and Safari & privacy, with sub-sections inside the larger ones.
Which sections are open is remembered.

Every YouTube and Instagram measure is an individual toggle. For YouTube: open
on Subscriptions, hide Shorts, hide recommendations, hide comments, no autoplay,
the Subscriptions/You bar, the PiP button and rotate to fullscreen. For
Instagram: open on Following, block Reels and Explore, hide suggested, hide
sponsored. The site scripts read the map from a localStorage mirror, so
document-start redirects are right from the second visit on.

## Project layout

```
manifest.json      Extension manifest (Manifest V3, Safari-compatible)
brand.css          Colour and type tokens; loaded first everywhere
fonts/             Fraunces + Instrument Sans (Latin subsets, OFL 1.1)
images/            Icons; icon.svg is the master, the PNGs render from it

youtube.js/.css    Shorts and Home-feed removal, youtube.com and m.youtube.com
instagram.js/.css  Following-only, ad-free feed for instagram.com
checkin.js/.css    The cue check-in card, both sites
pause.js/.css      The pause screen for sites you list, all sites
warm.js/.css       The warm night overlay, all sites
pip.js/.css        Picture in Picture button and rotate-to-fullscreen
player.js          Auto-unmute, default playback speed and quality
upsell.js          Blocks the App Store banner and "open in app" nags
popup.html/js/css  Settings and the cue summary behind the extension icon

build.sh           Convert, sign, build and install onto a paired iPhone
site/              The kindgate.app website (Cloudflare Pages)
scripts/           Release tooling; see CHANGELOG.md and changelog.d/
```

## Brand

The name is Kindgate; the line is "a gate, not a wall". `brand.css` holds the
whole palette as named custom properties, loaded first in every content-script
entry and linked from the popup, so no surface carries a raw hex.

| Name | Value | Used for |
| --- | --- | --- |
| Honey | `#D98E3A` | the icon, marks, bar charts |
| Sage | `#6F8461` | wins and "done" states |
| Ink | `#1F1D1A` | text and primary buttons |
| Cream | `#F6F1E8` | the ground |
| Sand | `#EADFCE` | cards and secondary buttons |
| Amber ink | `#A85F17` | links and section labels |

Headlines are set in Fraunces and everything else in Instrument Sans. Both ship
in `fonts/` as Latin subsets of the upstream variable fonts, under the SIL Open
Font License 1.1. They always load in the popup. Inside a content script the
host page's `font-src` policy has the last word, so on a site that refuses an
extension font the stacks fall through to New York and the system sans, and
nothing breaks.

The app icon is a garden gate standing ajar. `images/icon.svg` is the master and
the five PNGs are rendered from it:

```bash
qlmanage -t -s 512 -o /tmp/icon images/icon.svg   # repeat per size
```

## Development

Plain JavaScript and CSS. No bundler, no package manager, no test runner.
Content scripts run in Safari on iOS, so the only real test is a device:
`bash build.sh`, then look. Safari's Web Inspector on the Mac, under Develop,
then your iPhone, shows the live DOM of the phone's Safari.

`CLAUDE.md` carries the working conventions. User-visible changes need a
fragment in `changelog.d/`; see that folder's README.

<details>
<summary>Tuning the selectors</summary>

Instagram and YouTube change their markup regularly. If something leaks
through, the selectors in the `.css` files and the `TITLE_SELECTORS` list in
`youtube.js` are the places to add to.

- Instagram ads are found by their "Sponsored" label, matched as a whole label
  so a caption mentioning the word is not hidden with it. Add your UI language's
  wording to `SPONSORED_TEXT` in `instagram.js`. Posts marked "Paid partnership"
  come from accounts you follow and are kept; there is a commented-out list in
  `instagram.js` if you want those gone too.
- Instagram's UI text is matched in English and German. For another language,
  add the localised "Suggested for you" and "You're all caught up" strings to
  `SUGGESTED_TEXT` and `CAUGHT_UP_TEXT` in `instagram.js`.
- Check-in wording, the list of feelings, the 20-minute cooldown and how long
  the toast stays are at the top of `checkin.js`.
- Taps are handled by `onTap()` in `checkin.js`, which accepts `touchend`,
  `pointerup` or `click`, whichever iOS delivers first. Both site scripts skip
  their own click-blocking for anything inside `.kg-checkin` or `.kg-toast`.
  That combination is what keeps a single tap from being swallowed.
- Thumbnail hiding is scoped by the `kg-nothumbs` class that `youtube.js` puts
  on `<html>` for `/feed/` paths. Widen `isFeed()` to cover search too.
- Which YouTube pages count as "the feed" is the `FEED_PATHS` list in
  `youtube.js`. The "Up next" recommendations beside a playing video are left
  alone.
- m.youtube.com's bottom tab bar has no links: each tab is a `<div role="tab">`
  carrying a `targetId` class, where `w2w` is Home. `youtube.css` hides Home and
  Shorts by that class, and `youtube.js` also hides tabs by their visible label
  via `HIDDEN_TABS` as a fallback.
- The watch-page selectors were taken from the rendered mobile DOM rather than
  guesswork: recommendations are `ytm-video-with-context-renderer` and the
  comments entry point is `yt-video-metadata-carousel-view-model`. Both are
  scoped by the `kg-watch` class `youtube.js` puts on `<html>`.

</details>

## FAQ

**Why not just a content blocker?** Safari's content-blocker format can only
hide elements or block URLs. It cannot redirect `/shorts/…` to `/watch`, force
the Following feed, or match on text. That needs a real web extension with a
content script, which is what this is.

**Does it work in the YouTube or Instagram apps?** No. A Safari extension only
affects Safari. See the note under [What it does](#what-it-does).

**Is anything sent anywhere?** No. See [Privacy](#privacy).

## License

[Mozilla Public License 2.0](LICENSE).

The bundled typefaces in `fonts/` are not covered by it. They are licensed
separately under the SIL Open Font License 1.1; see `fonts/OFL.txt`.

Kindgate is not affiliated with YouTube, Instagram, Apple or Mozilla.
