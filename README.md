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

A block works while it is on, and many people take theirs down. Kindgate takes
a smaller step that is easier to keep: it removes the parts of YouTube and
Instagram that are designed to keep you there, and where a blocker would say
no, it asks a question and leaves the choice with you.

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Privacy](#privacy)
- [Features in detail](#features-in-detail)
- [Project layout](#project-layout)
- [Brand](#brand)
- [Development](#development)
- [FAQ](#faq)
- [Check it yourself](#check-it-yourself)
- [License](#license)

## What it does

| | |
| --- | --- |
| **YouTube, subscriptions only** | Opens on Subscriptions. No Home feed, no Shorts, no recommendations, no autoplay. Search, channels and playlists keep working. |
| **Instagram, people you follow** | Locked to the Following feed. Reels, Explore, suggested posts and sponsored posts are gone. |
| **Media keys on a Mac** | On any video: Q toggles 1× and your speed, W / E slower / faster by 0.1×, A fullscreen, S / D back / forward 10 s (QWERTY positions; Q W F A R S on Colemak). Every key can be changed, and the speed carries over to every tab. |

**More help, when you want it.** Six parts for evenings, nights, mornings and
single sites. Each is off after install until you switch it on in the popup
under **More help**,
and none of them blocks: "continue anyway" is always there.

| | |
| --- | --- |
| **A check-in, not a block** | Every so often a card asks what you were feeling ten seconds ago. One tap logs it. No verdict. |
| **Evening plan** | After work, opening a feed shows three things you decided earlier, one tap each. |
| **Night page** | At night every site first lands on a dim page with a ten-minute timer. |
| **Warm screen at night** | After your set hour every page eases toward candlelight. Contrast survives, layouts never break. |
| **Morning sequence** | For the first half hour after waking, a feed shows your own morning steps instead. Nothing to decide. |
| **Pause screen** | On sites you list, friction rather than a wall: breathing, a question, your pre-set alternative, and a countdown on "continue anyway". |
| **Hands off to Shortcuts** | Any button can run a shortcut of yours. Timers, reminders, whatever you already trust. |

**After an update.** An install from before these parts became opt-in keeps
what it had. Once, on the first start after the update, every part that was
never switched off is written into storage as on, so nothing changes for
that install; a part that was switched off stays off. A fresh install is told
apart by its empty storage (`migrate.js`).

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

With a paid developer membership the same script also produces TestFlight
builds: `bash build.sh --release` archives and exports a signed `.ipa`, and
`bash build.sh --upload` sends it to App Store Connect. The App Store Connect
key, team id and tester checklist are in the private ops repo's
[TestFlight runbook](https://github.com/IlijaVorontsov/kindgatex/blob/main/docs/testflight.md).

Each iPhone build carries a privacy manifest for the app and one for the
extension, and declares `ITSAppUsesNonExemptEncryption` as false: Kindgate has
no cryptography of its own and makes no network connections; the pause PIN is
hashed by Safari's built-in WebCrypto. `--release` checks both in the archive
before exporting.

`bash build.sh --simulator` builds the iPhone app for the iOS Simulator, with
no device, certificate or Apple ID, and checks the same things in the built
app. It is the quick way to see that everything compiles.

**On a Mac**, `bash build.sh --mac` builds a macOS-only project in a
`Kindgate-Xcode-mac` folder beside this one, signs it to run locally, copies
`Kindgate.app` to `~/Applications` and opens it once so Safari picks up the
extension. Then tick Kindgate in Safari → Settings → Extensions and allow it on
every website. Safari treats a locally signed build as an unsigned extension:
it stays hidden until you tick *Allow unsigned extensions* under Safari →
Settings → Developer, and Safari clears that box every time it quits. With
`DEVELOPMENT_TEAM=<team id>` the build is signed with your Apple Development
certificate instead and needs no such box. Xcode then fetches a provisioning
profile from your developer account, because the app's App Group needs one,
and that only works once this Mac is registered with the team (Xcode offers to
do it under Signing & Capabilities). `--adhoc` forces local signing.
Add `--no-install` to build without copying or opening the app. The app that
opens is [Kindgate's own Mac app](#on-the-mac): a window with the setup steps
and their state. `bash build.sh --mac --release` archives it for the Mac App
Store and exports a signed `.pkg`; it needs the paid developer team and stops
at once, before building, on a Mac that has nothing to sign with.

Without Xcode, `bash build.sh --stage`
only stages the extension folder: load it from Safari → Settings → Developer →
*Add Temporary Extension…* (turn on *Allow unsigned extensions* first). Safari
drops a temporary extension when it quits or after 24 hours, so this is for
trying changes, not daily use.

The script needs Xcode 26 or later. Xcode 27.2 writes new projects in its
JSON format (`project.xcproj`); the script converts the project back to
`project.pbxproj` with `xcodebuild -convert-project pbxproj`, because that is
the format it edits and both Xcode versions build it. The builds run on the
current system and the two before it (iOS 18, macOS 15, or later);
`KINDGATE_IOS_MIN` and `KINDGATE_MAC_MIN` change that. `KINDGATE_OUT=<folder>`
puts the staged extension, the project and the build products somewhere else,
which keeps a trial build away from a folder Safari has loaded.

Then open Kindgate on the phone. Its [setup checklist](#the-container-app)
covers enabling the extension, allowing the sites and deleting the apps, and
each step turns green by itself once it is done.

### By hand

<details>
<summary>Step by step, if you would rather not run the script</summary>

1. Copy this folder to your Mac. Install Xcode from the App Store and open it
   once so it installs its command-line tools.

2. Convert the web extension into an iOS app project (from Xcode 26 the tool
   is called `safari-web-extension-packager`; the options are the same):

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

Everything stays on the device. There is no account, no server and no
analytics. Your logs and settings are in the extension's own storage; the few
things kept elsewhere on the device are listed under
[Outside the extension's storage](#outside-the-extensions-storage) below.

- The cue log records the time, the feeling and which of the two sites it was.
  It can never become a browsing history, because it only ever names those two.
- The pause log records the time, the feeling, the outcome and whether it was
  within your goal. Never a URL, never a hostname.
- The wins log records the time, the plan you tapped, the window, and
  `youtube`, `instagram` or `other`. Never a URL, never a hostname.
- Each of the three logs can be copied out as JSON or cleared from the popup:
  the cue log under More help › Check-in, the wins log under More help ›
  Evening plan, the pause log under More help › Pause › Patterns (behind the
  PIN, if one is set).
- The self-check under More help › Pause › Check in with yourself keeps its last result (a
  score and the date, not the answers). The section shows when one is saved,
  and "Clear result" next to it deletes it.
- The pause section can be locked with a PIN, hashed with PBKDF2 and salted per
  install. It keeps the section out of casual view on a shared phone. It is a
  curtain, not a lock: the log behind it is ordinary extension storage.
- The video speed is one number in the same storage, shared by your tabs on
  this device, whether you set it with the keys or (with the option on) in a
  player. It is not synced to your other devices.
- The one thing that leaves the phone does so only when you press send. The
  optional "talk it through with Claude" button composes a short message about
  the moment, copies it to the clipboard and opens claude.ai for you to paste.
- Kindgate's cards, pages and toasts are drawn inside a closed shadow root, so
  the site underneath cannot read the feeling you tapped, your plans or your
  goal. It can still tell that something is covering it, and where on the
  screen you tapped.
- Links that Kindgate opens for you (claude.ai, the NSDR recording, your own
  "instead" links) are opened without a referrer, so the site you land on is
  not told which site you came from.

### Outside the extension's storage

A few small values are kept in the websites' own storage in Safari, because a
script that has to decide something before the page draws cannot wait for the
extension's storage. The site they are stored on can read them, so they also
show that site that Kindgate is installed. None holds a log entry, a feeling,
a plan or an address.

| Where | Key | What it holds | Goes away |
| --- | --- | --- | --- |
| YouTube and Instagram, `localStorage` | `fg:features` | A copy of the on/off switches for the YouTube and Instagram measures | When you clear that site's data |
| YouTube, `localStorage` | `yt-player-quality` | Your default quality, in YouTube's own setting | When you clear that site's data |
| YouTube, `sessionStorage` | `kg-hops` | Times of the last redirects, to stop a redirect loop | When the tab closes |
| Instagram, `sessionStorage` | `kg-ig-hops`, `fg:igStart` | The same loop guard, and when this visit started | When the tab closes |
| Any site, `sessionStorage` | `fg:nightPass` | That you tapped "continue anyway" at night in this tab | When the tab closes |

**These stay after you remove Kindgate.** Removing the extension deletes its
own storage, not what sits in a website's storage. To clear the two
`localStorage` entries: Settings › Apps › Safari › Advanced › Website Data,
search for youtube.com and instagram.com and delete them (on a Mac: Safari ›
Settings › Privacy › Manage Website Data). That also signs you out of those
sites. The `sessionStorage` entries are gone as soon as the tab is closed.

The Kindgate app keeps the setup checklist's status in an App Group it shares
with the extension (see [The container app](#the-container-app)). Deleting the
app removes it.

### What runs on every website

Four scripts are allowed on all sites, because night mode, the pause and the
warm screen have to work wherever you are. All three are off after install;
until one is switched on, its script reads its switch from storage and stops.
(The video keys are on, on a Mac.) Nothing but the code limits them, so this
is what each one does there:

- `checkin.js` checks the time against your windows and, at night, draws the
  night page. It reads the page's host name to apply your allow-list and
  pauses videos under the page; it stores `youtube`, `instagram` or `other`,
  never the host.
- `pause.js` compares the page's host name with your pause list and the
  bundled lists, and draws the pause screen on a match. The host name is not
  stored.
- `warm.js` draws the amber overlay, and tells the Kindgate app that the
  extension ran on a site other than YouTube and Instagram, reduced to
  `other`. The two sites report from their own scripts, so their rows in the
  app turn green with only those two sites allowed.
- `media-keys.js` runs in every frame and listens for key presses, because
  bare letter keys cannot be registered any other way. It looks each press up
  in a map of six keys, ignores everything typed into a field or held with a
  modifier, and stores and sends no keys. The only thing it saves is the
  playback speed you chose.

The bundled fonts, the pause lists and two stylesheets are readable by web
pages (`web_accessible_resources`), because Kindgate's own screens load them
from inside a page. A page that knew the extension's address could load one
and learn that Kindgate is installed. The storage keys above are an easier
tell.

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

The card is off after install; its switch is under More help › Check-in in the
popup. Off stops
only this daytime card: the morning, after-work and night windows have their
own switches, and the log and its summary stay.

In the popup (the extension's icon in Safari, from the "aA" menu in the address
bar), More help › Check-in › "Your week, by feeling" opens the full breakdown
by feeling, site, hour and weekday, and the export and clear controls.

### Morning

A morning window, off after install and 06:00 to 08:30 once switched on unless
you change it, in which opening a feed shows your pre-set steps instead. No
question, nothing to decide.

The reasoning: for a while after waking, thinking is slower. This sleep
inertia typically lasts 15 to 30 minutes and can last an hour or more on
careful measures (Hilditch & McHill 2019); in the classic imaging study, blood
flow returned mainly to the front of the brain over the first 15 minutes
(Balkin et al. 2002). So the decision belongs to the night before. The section
also carries a five-point set-up routine, and says plainly that new habits
take weeks to months: in Lally et al. (2010) the time to settle ranged from 18
to 254 days (the top of that range extrapolated), and later reviews quote a
median of about 66 days. Not 21.

**Coffee timer.** Ticking the first step marks when you got up. The morning page
counts down to your coffee time, by default 90 minutes and settable to 60, 90 or
120, and the next page you open after it passes carries a one-line alert. The
wait is a ritual, not physiology: no trial was found that backs delaying the
first coffee.

### Evening plan

Two time windows, after work and night, each off after install, with your own
times and up to three
"instead, I will…" plans. Inside a window the check-in stops asking how you feel
and shows those plans as one-tap buttons, because the decision was made earlier.
It offers **Give it 10 minutes** rather than a flat no: ten minutes later you
decide again. That
opens a full-screen countdown with a quote, your plans underneath, and a
continue button that unlocks after the delay. Every plan you pick counts as a
win, with a weekly total and no streak (see [Pause](#pause) for why). "Continue anyway" sits behind a
ten-second countdown, so the impulsive path is a little slower than the planned
one.

### Night

Night mode is off after install. Once switched on it covers **every website**,
not just YouTube and Instagram. Inside the
night window any site opened in Safari lands on the can't-sleep page, sharing
one ten-minute timer. "Continue anyway" clears only the tab it was tapped in, a
per-tab pass, so every new tab lands on the page again. A per-line allowlist in
the popup exempts sites you may genuinely need, such as maps or banking.

The night landing page is different by design, because a walk makes no sense at
23:00. Instead of plans you get the **can't-sleep page**: one line of framing,
then one rule borrowed from insomnia treatment (CBT-I stimulus control: if you
cannot sleep, get up; it is a tested part of treatment for insomnia, with no
evidence either way for people without it), keeping light low, and a breathing
guide with the cyclic-sigh pattern. In the trial behind that pattern (Balban et
al. 2023), five minutes a day for a month lifted mood a little and did not
change sleep; one round at night was not tested. The page is drawn dim, amber
on black: dimmer light is what the evidence supports, and the amber is for
comfort. For insomnia itself it points to CBT-I, with a clinician or a tested
programme. At the bottom sit
**Give it 10 minutes**, whose only exit at night is "phone on the charger", and
a continue that unlocks after ten seconds.

The wind-down audio button defaults to a 20-minute NSDR recording, offered again
whenever you log "tired" by day. A 25-minute pass lets that one video through
both the check-in and the night page. It always plays at 1x whatever your
media-key speed, and starts by itself where iOS allows; where it does not, one
large "Tap to start" button appears. Set your own link in the popup to replace
it.

**Warm screen.** Off after install. Once switched on, every page eases toward
candlelight after your set hour (21:00 to 07:00 unless you change it). The
overlay multiplies rather than washing the page out, so text contrast survives
and no layout breaks.

### Pause

Friction, not a wall, on sites you list. Off after install. Once switched on
with an empty list, it uses a short built-in list of common adult sites; the
list takes words or domains and is editable in the popup.

Three ready-made lists can be switched on next to it: adult sites (about 48,000
domains), social feeds (Facebook, Instagram, TikTok, X, Reddit and the like,
but not chat apps) and gambling. They are snapshots of the MIT-licensed
[StevenBlack/hosts](https://github.com/StevenBlack/hosts) category lists,
bundled with the extension and refreshed with each release. Nothing is fetched
from the network. A list is only read when it is on and your own list did not
already match, so pages outside the lists pay nothing.

The page is covered by a pause: a four-in, six-out breathing prompt, "what are
you feeling?" with bored, stressed, lonely, tired, actually aroused or just
habit, the replacement action you pre-set for that feeling, a Leave button, and
a "continue anyway" that unlocks after 10 to 20 seconds. Goals are flexible:
weekends only, not after a certain time, not at work, or stop altogether.
Outside the goal the pause runs full length; inside it, five seconds.

Nothing is ever a hard block. A block works while it is on, and many people
take theirs down. Nobody has tested a pause against a block head to head, so
this is offered as the smaller step that is easier to keep, not as the proven
better one.

At night the two layers run in sequence. The pause screen comes first, handling
the urge with night-aware wording, and its continue hands over to the ten-minute
night timer with the charger exit rather than opening the site. Only the timer's
own continue lets you through.

**Deliberately absent: streaks**, here and in the evening plan. Progress is a
trend, "down 40% this month", so one slip erases nothing. In experiments people
engaged less after a broken streak, more so when they blamed themselves
(Silverman & Barasch 2023). Going ahead is "went ahead", never "relapse". The
next visit after a slip outside your goal opens with "One slip doesn't undo
progress. What was going on?". Patterns show when urges happen and what you
were feeling. A six-question self-check based on the ICD-11
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

Playback preferences in the popup cover **unmute automatically** and a
best-effort **default quality**. Speed is set only with the [media
keys](#media-keys), one speed for every video. Unmute is applied
straight to the video element and is reliable. Quality only nudges the
preference YouTube persists, because the player API lives in the page's
JavaScript world that a content script cannot reach, and YouTube's content
security policy blocks injecting a script to get there.

### Media keys

With a hardware keyboard (a Mac, or an iPad with a keyboard) every HTML5 video
answers to six bare keys. They are matched by position on the keyboard, not by
the letter they type, so the same physical keys work on any layout:

| QWERTY | Colemak | Action |
| --- | --- | --- |
| Q | Q | Speed to 1.0×; press again to go back to the speed you had |
| W / E | W / F | Speed down / up by 0.1× (0.1× to 16×) |
| A | A | Fullscreen on / off |
| S / D | R / S | Back / forward 10 seconds |

Every key, the speed step (0.05× to 0.5×) and the jump (5 to 30 s) can be
changed in the popup under **Video keys › Adjust**: click an action and press the key you
want. Esc cancels, Delete leaves the action without a key, and a key already in
use moves to the new action.

The speed is global, like the Global Speed extension: the one you pick applies
to every video in every tab and window, to videos that load later, and after
Safari restarts. Q switches between 1× and that speed. Until you first press a speed key, videos
play at whatever the site chooses.

Without a keyboard (on the iPhone, say), the popup's **Video speed** row, on
its first screen, shows the current speed and changes it with −, 1× and +,
in the same steps as the keys; 1× switches back to the speed before, like Q.

It is a starting speed, not a lock. Each video starts at it, and so does every
video when you change it. A speed you then pick in the player's own menu holds
for that video, and the next video starts at your speed again. Only while a
video is loading, when sites reset the speed on their own, is a change with no
tap or key of yours behind it set back; a site that keeps forcing its own speed
is left alone on that video after a few tries.

**Carry speed changes from the player over to all videos** (in the popup under
the video row's Adjust, off by default) makes a speed you pick in any player's own menu
the global speed, as if you had used the keys. This works on the iPhone too,
where there are no keys. Only your own changes count: one that follows a tap,
click or key of yours, or that you make in Safari's own fullscreen player.
Changes the site makes (a new video loading, an ad, a live stream going back
to 1×) are ignored, nothing is taken over during an ad, and the NSDR recording
stays at 1× without changing your speed. Other open tabs pick the new speed up
the next time they are shown; the most recent change wins.

A short readout over the video shows the new speed or the jump. Keys are left
alone while you type in a field, when Command, Control, Option or Shift is held, and on
pages without a video. Fullscreen
uses the site's own button when there is one (YouTube, Twitch, Vimeo and the
common player libraries), so its controls and subtitles stay. On Netflix, S and
D are left to Netflix's own arrow keys, because its player breaks when the
position is set from outside. Videos inside an embedded player answer once you
have clicked into that player. Turn it off with the Video keys switch in the
popup (on the iPhone and iPad: under Video speed › Adjust).

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

### The container app

Every Safari web extension ships inside a host app. The converter generates an
empty one that says the extension is enabled and nothing else, which is both
useless to a new user and thin for App Review. Kindgate's is a setup checklist,
and every row reports live state rather than telling you what to go and check.

| Row | Where the state comes from |
| --- | --- |
| Extension enabled | The extension itself, via a native message |
| youtube.com allowed | A content script reporting that it ran there |
| instagram.com allowed | The same |
| Other Websites allowed | The same, bucketed as "other" |
| YouTube app deleted | `canOpenURL("youtube://")` |
| Instagram app deleted | `canOpenURL("instagram://")` |
| Site on the Home Screen | `navigator.standalone`, reported by the content script |

iOS gives an app no way to ask whether its own Safari extension is enabled, or
which sites the user allowed. So the extension tells it. `background.js` sends a
native message when it starts, which is proof the extension is on, and again
when a content script reports it ran on a site, which is proof that site is
allowed. `SafariWebExtensionHandler.swift` writes timestamps into a shared App
Group and the checklist reads them.

What crosses that boundary is deliberately tiny. When the extension starts:
three yes/no answers, whether Safari has granted it youtube.com, instagram.com
and all other websites. When a page opens: a host name already reduced to
`youtube.com`, `instagram.com` or `other`, and whether the page was opened from
the Home Screen. No URLs, no list of sites, no page content, and it never
leaves the device. The messages are throttled to one a minute per site. A
message the app does not understand is dropped, and its content is not logged.

A row that was green and has gone quiet for a week turns amber rather than
silently staying green, so an extension switched off in Settings shows up.

Under the checklist an **About** section links the
[privacy policy](https://kindgate.app/privacy) and the
[support page](https://kindgate.app/support) and shows the open source notices.

#### On the Mac

The Mac app (`app-mac/`) is one window with the same idea and fewer rows.

| Row | Where the state comes from |
| --- | --- |
| Extension turned on | Safari itself (`SFSafariExtensionManager`), which a Mac app may ask |
| youtube.com allowed | The extension: Safari granted it the site, or a content script ran there |
| instagram.com allowed | The same |
| Other websites allowed | The same, bucketed as "other" |

A button opens Safari's extension settings with Kindgate selected. A row that
is still open has an "Open in Safari" button for the site. Below that: the
privacy policy, the support page, the source code, the open source licences
(the full OFL and MIT texts, read from the extension inside the app) and the
version. There are no "delete the app" rows: on a Mac the sites are used in
the browser anyway.

The native side is the same as on the iPhone: one handler
(`app/Kindgate Extension/SafariWebExtensionHandler.swift`) is built into both
apps, takes the same two messages and writes them to the App Group
`group.app.kindgate`. The Mac app is sandboxed, and its entitlements are the
sandbox and that App Group, nothing else: no network access, no file access.
It makes no network request; links open in the browser. Its typefaces are
loaded from the extension bundled inside it, not copied.

A build that is signed to run locally carries no App Group: Xcode signs one
only with a provisioning profile, which needs a developer team. In such a
build the first row works and the three "allowed" rows say that they cannot be
shown. Inside Safari nothing is different.

### The popup

Two levels. The first is the feeds and nothing else: a card for YouTube and
one for Instagram, each with one switch and a count ("9 of 9 on") that opens
the individual switches under **Adjust**; the video speed row on the iPhone,
or the video keys on a Mac; and one door, **More help**. Below them sit
links to Your data (the Claude hand-off, what is stored where, your own
shortcuts), the privacy policy, support and About.

A site's one switch turns all its measures off and remembers which were on;
switched on again, it brings that set back.

**More help** opens the second level: the check-in, the evening plan, the
night page, the warm screen, the morning list and the pause, each with one
switch, one sentence on what it does and, for the three that act on every
website, a "works on every website" label. Each one's settings open in place
under it. When parts are on, the door says how many and which. The PIN, if
set, also holds the pause's switch until it is entered.

After the update from an earlier version, the popup says once, at the top,
that the layout is new and nothing was switched off, and names what is on,
with **Show me** (opens More help) and **OK**. Which panels are open is
remembered; the popup always opens on the first level.

About links the privacy policy and the support page, which open in a tab, and
lists the open source licences. The font and list licence texts are read from
the bundle, so they show offline.

Every YouTube and Instagram measure is an individual toggle. For YouTube: open
on Subscriptions, hide Shorts, hide recommendations, hide comments, no autoplay,
the Subscriptions/You bar, the PiP button and rotate to fullscreen. For
Instagram: open on Following, block Reels and Explore, hide suggested, hide
sponsored. The site scripts read the map from a localStorage mirror, so
document-start redirects are right from the second visit on. The mirror is in
the sites' own storage, where the site can read it; see
[Outside the extension's storage](#outside-the-extensions-storage).

## Project layout

```
manifest.json      Extension manifest (Manifest V3, Safari-compatible)
brand.css          Colour and type tokens; loaded first everywhere
fonts/             Fraunces + Instrument Sans (Latin subsets, OFL 1.1)
lists/             Bundled pause lists: adult, social, gambling (StevenBlack/hosts, MIT)
images/            Icons; icon.svg is the master, the PNGs render from it

youtube.js/.css    Shorts and Home-feed removal, youtube.com and m.youtube.com
instagram.js/.css  Following-only feed for instagram.com
checkin.js/.css    The cue check-in card, both sites
pause.js/.css      The pause screen for sites you list, all sites
warm.js/.css       The warm night overlay, all sites
pip.js/.css        Picture in Picture button and rotate-to-fullscreen
player.js          Auto-unmute and default quality; keeps the NSDR at 1x
media-keys.js/.css Rebindable speed, seek and fullscreen keys; one global speed
upsell.js          Blocks the App Store banner and "open in app" nags
popup.html/js/css  Settings and the cue summary behind the extension icon
background.js      Status heartbeat: tells the container app the extension is on

app/               The iPhone app: setup checklist, Swift, entitlements and the
                   two privacy manifests (PrivacyInfo.xcprivacy), overlaid on
                   the project the converter generates. Its native message
                   handler and the extension's privacy manifest are also the
                   Mac's: there is one copy of each
app-mac/           The Mac app: its window (AppKit and SwiftUI), menu bar,
                   sandbox entitlements and privacy manifest, overlaid the
                   same way by build.sh --mac
build.sh           Convert, sign and install onto a paired iPhone or this Mac (--mac),
                   stage for Add Temporary Extension (--stage), or archive for
                   TestFlight (--release) or the Mac App Store (--mac --release)
scripts/           changelog.py (release notes), app-icon.sh and mac-icon.sh (the
                   app icons build.sh installs), hashes.py and verify-install.sh
                   (compare an installed Mac app with the source)
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

## Check it yourself

Kindgate asks for access to every website. This section says what it does with
that access, where to look in the code, and how far a check can go.

### The scripts that run on all websites

Four content scripts match `<all_urls>` in `manifest.json`. The rest only run
on YouTube and Instagram.

| Script | Why it runs everywhere | What it reads from the page |
| --- | --- | --- |
| `checkin.js` | The night page appears on any site during your night window, and the morning coffee reminder can show on any site. Apart from those two it does nothing on sites other than YouTube and Instagram. Top frame only. | The host name, to check your night allow-list. In the logs every site other than the two is written as `other`. |
| `pause.js` | The pause screen has to appear on whatever site is on your list or on a bundled list you switched on. Top frame only. | The host name, compared on the device with those lists. The pause log never holds a URL or host name. |
| `warm.js` | The warm night overlay covers every page. Top frame only. On sites other than YouTube and Instagram it also tells the background script the host name, which is how the app's optional "Other Websites" row knows they are allowed (see below). | The host name, for that report and for your skip list. |
| `media-keys.js` | Speed, seek and fullscreen keys work on any video, so it listens for `keydown` on every page, in every frame. | The physical key code of each key press, looked up in a map of six keys. Other keys, keys with a modifier and keys typed into a field are passed on untouched. It stores the chosen speed and nothing about what was typed. |

None of the four makes a network request. The one `fetch` in the code
(`pause.js`) reads a list bundled inside the extension.

### What is stored where

| Where | What | Who can read it |
| --- | --- | --- |
| The extension's own storage (`browser.storage.local`) | All settings; the cue log (time, feeling, `youtube` / `instagram` / `other`); the wins log (time, the plan you tapped, the same three site names); the pause log (time, feeling, outcome, within goal or not); the PIN hash; the result of the pause self-check; a diagnostic for the NSDR link that holds a YouTube path. The popup also remembers which of its sections are open, in its own page storage. | Kindgate only. Removed with the extension. |
| YouTube's and Instagram's own `localStorage` | `fg:features`, a copy of the feature switches, so the scripts can act before the page draws. On YouTube also the site's own `yt-player-quality` setting when a default quality is set. | **Those sites can read it**, and can tell from it that Kindgate is installed. It stays after Kindgate is removed, until you clear the site's data. |
| The page's `sessionStorage`, until the tab closes | On YouTube and Instagram: redirect counters and a session start time. On any site where you tap "continue anyway" at night: a marker `fg:nightPass`. | The site the tab shows. |
| The page itself | Kindgate's cards and screens are ordinary page elements, so the site they are drawn over can read their text: the feeling you tap, your plan labels, your goal. | The site the tab shows. |
| The clipboard | The message for Claude, only when you tap that button. It holds the time, the window, the feeling and the plan, not the site. | Whatever you paste it into. |

When a button on a Kindgate card opens another address (claude.ai, the NSDR
video, a link you set for a plan), Safari may tell that address which site you
came from, as with any link.

### What crosses to the app

`background.js` sends native messages to the app that carries the extension.
They stay on the device.

- When the extension starts: a timestamp and three yes/no answers, whether
  Safari has granted the extension youtube.com, instagram.com and all other
  websites. The list of granted sites itself is not sent.
- When a page loads, at most once a minute per name: `youtube.com`,
  `instagram.com` or `other`, a timestamp, and whether the page was opened
  from the Home Screen. `youtube.js`, `instagram.js` and (for every other
  site) `warm.js` pass the full host name to the background script, which
  reduces it to those three before anything is sent on.

The handler (`app/Kindgate Extension/SafariWebExtensionHandler.swift`, the
same file in the iPhone and the Mac app) keeps these in the App Group the app
reads for its checklist. A message it does not recognise is dropped; the
system log gets one fixed line saying so, without the message. The Swift code
has no network call.

### Ask an AI assistant

[AUDIT.md](AUDIT.md) holds a prompt to paste into an AI assistant. It makes the
assistant read every file, quote the code for each finding and compare it with
the claims here and in the privacy policy. Its limits are listed in that file;
the main ones: an assistant can miss things, and it reads the source, not the
app you installed.

### Compare an installed Mac app with the source

On a Mac the extension's files sit readable inside the app. From a clone of
this repository:

```bash
python3 scripts/hashes.py --ref <tag>                               # SHA-256 list of the files that ship
bash scripts/verify-install.sh /Applications/Kindgate.app <tag>     # compare the installed app with it
```

`hashes.py` lists exactly the files `build.sh` stages, by reading the `STRIP`
list from it, plus the extension's privacy manifest, which the build adds from
`app/Kindgate Extension/`. `verify-install.sh` prints every file in the app
that differs from the source at that tag, is missing or is extra.
`build.sh --mac` runs the same comparison on the app it has just built.

### What a check cannot show

- **There is no App Store build and no release tag yet.** The check script has
  been run on a Mac app built locally from this repository, where every file
  matched, not on an app from the store. The store may add or rewrite files;
  which ones is not known yet.
- **Source at a tag, not the store binary.** Reading the code, by eye or with
  an assistant, checks this repository. Only the hash comparison ties an
  installed app to it, and only for the extension's scripts, styles, lists,
  fonts and images.
- **The Swift code cannot be compared.** Apple signs and repackages the
  compiled app, so nobody can show that it equals the source. That covers the
  app and the native message handler.
- **What the Mac app still takes from Apple's converter.** The app's code,
  window, entitlements and icon are in this repository (`app-mac/`, `app/`,
  `scripts/mac-icon.sh`). The Xcode project itself is generated by Apple's
  converter on every build and then edited by `build.sh`; it is not checked in.
- **iPhone and iPad only in part.** The files are not reachable on the device.
  The same source feeds both builds, so a Mac check is indirect evidence for
  the iPhone build of the same version, not proof.
- **"Data Not Collected"** on the App Store is the developer's own
  declaration. Apple does not verify it.

Found something that does not match? See [SECURITY.md](SECURITY.md).

## License

[Mozilla Public License 2.0](LICENSE).

The bundled typefaces in `fonts/` are not covered by it. They are licensed
separately under the SIL Open Font License 1.1; see `fonts/OFL.txt`. The pause
lists in `lists/` come from StevenBlack/hosts under the MIT License; see
`lists/LICENSE`. Both files ship inside the extension, and the app and the popup
show the notices under About, Open source licences.

The name "Kindgate" and the icon are not covered by it either. Forks are
welcome under another name and icon; see [TRADEMARK.md](TRADEMARK.md).

Kindgate is not affiliated with YouTube, Instagram, Apple or Mozilla.
