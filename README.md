# Kindgate — Safari extension for iPhone/iPad

The Subscriptions feed is a plain text list: thumbnails are hidden and the
inline preview players never start.

YouTube drops its bottom tab bar from the DOM while a video is open, so
Kindgate supplies its own with **Subscriptions** and **You**.

What stays on a watch page: the title, channel row, Share and Save-to-playlist
actions, and the description. What goes: recommendations, the filter chips
above them, the Shorts shelf, the comments teaser and autoplay.

YouTube watch pages are stripped down too: recommended videos, the comments
section and the autoplay toggle are removed, and a video never rolls into the
next one. Tapping the YouTube logo goes to Subscriptions.

YouTube: opens on **Subscriptions** instead of the Home feed (Home, Explore and
Trending all redirect there and their nav buttons are removed), hides every
Shorts entry point, and opens any Shorts link in the normal player instead.
Search, subscriptions, watch pages, channels and playlists keep working.

Instagram checkpoint: every N posts (default 15) a card shaped like a post is
inserted in the feed showing how many posts and minutes have gone by, with
"Keep going" and "That's enough". Not a block — the point is to make the
scrolling a choice again.

Note: an earlier version hid every sibling after "You're all caught up", which
also hid the older posts below it and the sentinel that loads the next page,
so the feed stopped loading at a few weeks old. Suggested content is matched by
its own markers instead.

Instagram: locked to the accounts you follow (forces the "Following" feed,
removes Reels/Explore, hides "Suggested for you" content and sponsored posts).

**Important limitation:** a Safari extension only affects Safari. It does nothing
inside the YouTube or Instagram *apps*. To make it stick, delete those apps and
add `youtube.com` / `instagram.com` to your Home Screen from Safari (Share →
"Add to Home Screen"). Optionally use Screen Time → Content & Privacy →
Allowed Apps / App Store restrictions so the apps can't quietly come back.

Coffee timer: ticking the first step marks when you got up; the morning page
then counts down to your coffee time (default 90 minutes, settable 60/90/120)
and the next page you open after it passes carries a one-line alert. An extension cannot send iOS notifications while Safari is closed, so for an
alert that buzzes it hands off to Shortcuts: name a shortcut in the popup and a
button on the morning page opens
`shortcuts://run-shortcut?name=<name>&input=text&text=<minutes>` (Apple's
documented scheme). Clock and Reminders have no public URL scheme, so there is
no supported way to open them with parameters pre-filled.

Making your own: the popup has a shortcut-link builder (name + optional input
-> a `shortcuts://run-shortcut` URL you can copy), a button that opens
`shortcuts://create-shortcut` to start a new one, a copyable recipe, a test
button, and a field for an iCloud share link so a shortcut is one tap to
reinstall. Every "Optional link" field in Kindgate accepts a `shortcuts://`
URL, so any button in the extension can run a shortcut of yours. The shortcut receives the number of minutes to wait as its input, so it needs
an Adjust Date action (add Shortcut Input minutes to Current Date) feeding the
reminder's or timer's time — a fixed time ignores the input. Note that YouTube
strips both the URL fragment and unknown query parameters before any content
script runs, so an x-callback-url result cannot be read back there; the popup's
Test button is the reliable check.

Morning (popup): a morning window (default 06:00-08:30) in which opening a
feed shows your three pre-set steps instead — no question, nothing to decide.
The reasoning: for roughly 15-30 minutes after waking the anterior cortical
regions are still returning to waking blood flow (Balkin et al. 2002), so
executive control is at its lowest and behaviour follows whatever the context
cues (Neal, Wood & Drolet 2013); the decision therefore belongs to the night
before. The section also carries a five-point set-up routine (phone out of the
bedroom, fixed wake time, if-then wording, daylight in the first hour, decide
the night before) and says plainly that habits took a median of ~66 days to
settle in Lally (2010), range 18-254 — not 21.

Evening plan (popup): two time windows — after work and night — with your own
times and up to three "instead, I will…" plans. Inside a window the check-in
stops asking how you feel and shows those plans as one-tap buttons
(implementation intentions: the decision was made earlier), offers "Give it 10 minutes" rather than a flat no (urges decay) — which opens
a full-screen countdown with a quote, your plans underneath, and a "continue"
that unlocks after the delay, counts every plan you pick as a
win with a weekly total and day streak (immediate reward), and holds "Continue
anyway" behind a 10-second countdown so the impulsive path is a little slower
than the planned one. Night mode covers **every website**, not just YouTube and Instagram: inside
the night window any site opened in Safari lands on the can't-sleep page, with
one shared 10-minute timer; "continue anyway" clears only the tab it was tapped
in (a per-tab sessionStorage pass), so every new tab lands on the page again.
A per-line allowlist in the popup exempts sites you may genuinely need (maps,
banking). This needs the extension to be allowed on all websites: Settings >
Apps > Safari > Extensions > Kindgate > Other Websites > Allow.

At night the landing page is different: instead of plans (a walk makes no
sense at 23:00) you get the **"can't sleep" protocol** — one line of framing,
then CBT-I stimulus control (get out of bed, no clock-watching, fixed wake
time), keep light low, and a built-in physiological-sigh breathing guide
(Balban et al. 2023) — drawn in dim amber on black so the screen isn't a light
source. At the bottom: **Give it 10 minutes** (the timer, whose only exit at
night is "phone on the charger") and a "continue" that unlocks after 10
seconds. The wind-down audio button defaults to Huberman Lab's 20-minute NSDR
(youtube.com/watch?v=hEypv90GzDE); the same recording is offered whenever you
log "tired" by day, and a 25-minute pass lets that one video through the
check-in and the night page. The NSDR always plays at 1x whatever the default speed, and starts by itself
where iOS allows; where it doesn't (sound needs a tap in the page), one big
"Tap to start" button appears. Set your own link in the popup to replace it.

Cue check-in: each time you open either site (at most once per 20 minutes per
site) a card asks *"What were you feeling 10 seconds ago?"* — one tap to log it
(Bored, Tired, Avoiding something, Between tasks, Lonely, Stressed, Just habit,
Came for something specific), then it shows your pattern for the week and
the card closes on that single tap; a toast then shows your pattern for the
week with a **Leave instead** button, and fades on its own. Tap the extension's icon in Safari
(the "aA" / puzzle-piece menu in the address bar) for the full breakdown by
feeling, site, hour and weekday, and to export or clear the log. Everything
stays on the phone in the extension's own storage.

Picture in Picture: watch pages get a **Picture in Picture** button. It is
deliberately manual — iOS only grants PiP from a real user gesture, so a tap is
the one thing that works reliably. Once the video is in the floating window it
keeps playing when you leave Safari, and pushing that window off the screen
edge continues it as audio.

Both the PiP button and rotating to landscape start the video first if it is
paused or hasn't begun. Rotate to fullscreen: turning the phone to landscape on
a watch page asks the video to go fullscreen, and turning it back to portrait leaves fullscreen.
Rotation is not a user gesture, so WebKit may refuse it; a single
**Tap for fullscreen** prompt then appears, and that tap is a gesture. iOS
stops any web page playing once Safari is backgrounded and no extension API can
change that — PiP is the one exception the system honours, so the button strips
the `disablepictureinpicture` attribute mobile YouTube sets on its player and
puts the video into PiP on one tap. The video then keeps playing when you leave
Safari, and pushing the PiP window off the screen edge continues it as audio.

Playback preferences (popup): **unmute automatically**, a **default speed**,
and a best-effort **default quality**. Speed and unmute are applied straight to
the video element and are reliable; quality only nudges the preference YouTube
persists, because the player API lives in the page's JavaScript world that a
content script cannot reach and YouTube's CSP blocks injecting a script to get
there.

"Open in app" prompts (popup, on by default): the App Store Smart Banner is
driven by a `<meta name="apple-itunes-app">` tag that Safari acts on, so
`upsell.js` runs at document start and removes it as soon as it appears; the
sites' own "use the app" banners are found by their button label or App Store
link and the small box around them is hidden.

## Pause (porn and other sites you choose)

Friction, not a wall. On sites you list (a built-in list of common adult sites
by default; words or domains, editable in the popup) the page is covered by a
pause: a 4-in/6-out breathing prompt, "what are you feeling?" (bored, stressed,
lonely, tired, actually aroused, just habit), the replacement action you
pre-set for that feeling, a Leave button, and "continue anyway" that unlocks
after 10–20 s. Flexible goals — weekends only, not after a time, not at work —
or stop altogether; outside the goal the pause is full length, inside it five
seconds. Nothing is ever a hard block: hard blocks get circumvented and invite
all-or-nothing thinking.

At night the two layers run in sequence: the pause screen first (it handles
the urge — feeling, replacement — with night-aware wording), and its
"continue" hands over to the 10-minute night timer with the charger exit
rather than opening the site; only the timer's own continue lets you through.

Deliberately absent: streaks. Progress is shown as a trend ("down 40% this
month"), so one slip doesn't erase anything. Going ahead is "went ahead", never
"relapse"; the next visit after a slip outside your goal opens with "One slip
doesn't undo progress. What was going on?" Patterns show when and why urges
happen ("Most urges: late at night, when tired"), which is more actionable
than a count. A six-question self-check based on the ICD-11 description of
compulsive sexual behaviour points toward professional help when the score is
high — a pointer, not a diagnosis. No "dopamine detox", no "reboot".

Privacy: on-device only, nothing sent anywhere. The log holds the time, the
feeling, the outcome and whether it was within your goal — never a URL or a
hostname. The popup section can be locked with a PIN (PBKDF2, salted per install), which
keeps it out of casual view on a shared phone — it is a curtain, not a lock, and
the log behind it is ordinary extension storage.

The popup is grouped into collapsible categories — Check-in & cues, Evening
plan, Pause, YouTube & feeds, Safari & privacy — with sub-sections inside the
bigger ones; which sections are open is remembered.

Talk it through with Claude (opt-in): a button on the after-work card, the
timer and the pause screen composes a short message about the moment — time,
feeling, your plan, never a site — copies it to the clipboard and opens
claude.ai/new for you to paste. claude.ai's `?q=` prefill was removed in
October 2025 (prompt-injection concerns), so paste is the honest mechanism;
nothing leaves the phone until you press send there. Not offered at night: the
night flow is charger and breathing, not another screen.

Every YouTube and Instagram measure is an individual toggle in the popup
(YouTube: open on Subscriptions, hide Shorts, hide recommendations, hide
comments, no autoplay, the Subscriptions/You bar, the PiP button, rotate to
fullscreen; Instagram: open on Following, block Reels/Explore, hide suggested,
hide sponsored). The site scripts read the map from a localStorage mirror so
document-start redirects are right from the second visit on.

## What's in this folder

```
manifest.json     Extension manifest (Manifest V3, Safari-compatible)
youtube.js/.css   Shorts + Home-feed removal for www.youtube.com and m.youtube.com
instagram.js/.css Following-only, ad-free feed for instagram.com
checkin.js/.css   The cue check-in card (both sites)
pip.js/.css       Picture in Picture button + rotate-to-fullscreen
player.js         Auto-unmute, default playback speed and quality
upsell.js         Blocks the App Store banner and "open in app" nags (both sites)
pause.js/.css     The pause screen for sites you list (all sites, document_start)
popup.html/js/css The "Your cues" summary behind the extension icon
images/           Icons (icon.svg is the master; the PNGs are rendered from it)
brand.css         Colour and type tokens: honey, sage, ink, cream, sand, amber ink
fonts/            Fraunces + Instrument Sans (Latin subsets, OFL 1.1)
```

## Brand

The name is Kindgate; the line is "a gate, not a wall". `brand.css` holds the
whole palette as named custom properties, loaded first in every content-script
entry and linked from the popup, so no surface should carry a raw hex again.

| Name      | Value     | Used for                     |
| --------- | --------- | ---------------------------- |
| Honey     | `#D98E3A` | the icon, marks, bar charts  |
| Sage      | `#6F8461` | wins and "done" states       |
| Ink       | `#1F1D1A` | text and primary buttons     |
| Cream     | `#F6F1E8` | the ground                   |
| Sand      | `#EADFCE` | cards and secondary buttons  |
| Amber ink | `#A85F17` | links and section labels     |

Type is Fraunces for headlines and Instrument Sans for everything else. Both
ship in `fonts/` as Latin subsets of the upstream variable fonts, under the SIL
Open Font License 1.1 (`fonts/OFL.txt`). They always load in the popup. Inside
a content script the host page's `font-src` policy has the last word, so on a
site that refuses an extension font the stacks fall through to New York and the
system sans and nothing breaks.

The app icon is a garden gate standing ajar. `images/icon.svg` is the master;
the five PNGs are rendered from it. To re-render after an edit:

```bash
qlmanage -t -s 512 -o /tmp/icon images/icon.svg   # repeat per size
```

## Build & install (one command)

With Xcode installed, your Apple ID added to Xcode, and the iPhone plugged in
and unlocked:

```bash
bash build.sh   # from this folder; the script finds its own location
```

It converts the extension into a `Kindgate-Xcode` folder beside this one, signs it with your
Personal Team, builds, and installs onto the connected phone. Re-run it after
editing any file here — it rsyncs the sources into the Xcode project, so edit
*these* files, not the copies inside the project. Full log: `build.log`.

Two things the script has to work around, worth knowing if you ever convert by
hand:

- `safari-web-extension-converter` names the app target after the app name
  (`…Kindgate`) while the extension keeps the id you passed
  (`…kindgate.Extension`). The case mismatch means the extension is not
  prefixed by its parent and signing fails, so the script rewrites both ids.
- Apple registers App IDs case-insensitively, so once `…Kindgate` has been
  registered, `…kindgate` is permanently unavailable to you. Pick a fresh
  base identifier rather than changing only the case.

## Build & install (Mac with Xcode, free Apple ID)

1. Copy this `Kindgate` folder to your Mac. Install Xcode from the App Store
   and open it once so it installs its command-line tools.

2. Convert the web extension into an iOS app project:

   ```bash
   xcrun safari-web-extension-converter ~/Downloads/Kindgate \
     --project-location ~/Developer \
     --app-name Kindgate \
     --bundle-identifier app.kindgate \
     --ios-only --swift --no-open
   open ~/Developer/Kindgate/Kindgate.xcodeproj
   ```

3. In Xcode: Settings → Accounts → add your Apple ID (free "Personal Team").
   Then select the project → each of the two targets (`Kindgate` and
   `Kindgate Extension`) → Signing & Capabilities → tick
   "Automatically manage signing" and choose your Personal Team.
   If Xcode complains the bundle ID is taken, change `app.kindgate` to
   anything unique.

4. On the iPhone: Settings → Privacy & Security → Developer Mode → on
   (requires a restart). Connect the phone by cable, pick it as the run
   destination in Xcode, press ▶ Run. First time: Settings → General →
   VPN & Device Management → trust your developer certificate.

5. Enable the extension: Settings → Apps → Safari → Extensions → Kindgate →
   on, and set both `youtube.com` and `instagram.com` to **Allow**
   (choose "Always Allow" when Safari asks). For night mode to cover every
   site, also set **Other Websites** to Allow.

6. Open youtube.com in Safari — it should land on /feed/subscriptions with no
   Home tab and no Shorts tab or shelves.
   Open instagram.com — it should land on `/?variant=following`.

### Free Apple ID caveats

- Apps signed with a Personal Team expire after **7 days**. Just plug the
  phone in and press Run again in Xcode; nothing else needs to change.
- Max 3 sideloaded apps at a time, and 10 app IDs per week.
- A paid developer membership (€99/yr) removes the 7-day limit and lets you
  install via TestFlight for a year at a time.

## Tuning

- Instagram ads are found by their "Sponsored" label, matched as a whole label
  so a caption mentioning the word is not hidden with it. Add your UI language's
  wording to `SPONSORED_TEXT` in `instagram.js`. Posts marked "Paid partnership"
  come from accounts you follow and are kept; there is a commented-out list in
  `instagram.js` if you want those gone too.
- Instagram's UI text is matched in English and German. If your Instagram is
  in another language, add the localized "Suggested for you" / "You're all
  caught up" strings to `SUGGESTED_TEXT` / `CAUGHT_UP_TEXT` in `instagram.js`.
- Check-in wording, the list of feelings, the 20-minute cooldown and how long
  the toast stays are at the top of `checkin.js`.
- Taps are handled by `onTap()` in `checkin.js`, which accepts `touchend`,
  `pointerup` or `click` — whichever iOS delivers first — and both site scripts
  skip their own click-blocking for anything inside `.kg-checkin` / `.kg-toast`.
  That combination is what keeps a single tap from being swallowed.
- Thumbnail hiding is scoped by the `kg-nothumbs` class that `youtube.js` puts
  on `<html>` for `/feed/` paths; widen `isFeed()` to cover search too.
- Which YouTube pages count as "the feed" is the `FEED_PATHS` list in
  `youtube.js` (currently `/`, `/shorts`, `/feed/explore`, `/feed/trending`).
  The "Up next" recommendations beside a playing video are left alone.
- m.youtube.com's bottom tab bar has no links: each tab is a `<div role="tab">`
  carrying a `targetId` class (`w2w` = Home, `shorts`, `library`). `youtube.css`
  hides Home/Shorts by that class and `youtube.js` also hides tabs by their
  visible label (`HIDDEN_TABS`) as a fallback.
- The watch-page selectors were taken from the rendered mobile DOM, not from
  guesswork: recommendations are `ytm-video-with-context-renderer`, the comments
  entry point is `yt-video-metadata-carousel-view-model`. Both are scoped by the
  `kg-watch` class `youtube.js` puts on `<html>`.
- Instagram and YouTube change their markup regularly. If something leaks
  through, the selectors in the `.css` files and the `TITLE_SELECTORS` list in
  `youtube.js` are the places to add to. Safari's Web Inspector on the Mac
  (Develop → your iPhone → the page) shows the live DOM of the phone's Safari.
- To rebuild after editing: edit the copies inside the Xcode project
  (`Kindgate Extension/Resources/`), then Run again.

## Why not just a content blocker?

Safari's content-blocker format can only hide elements or block URLs; it can't
redirect `/shorts/…` to `/watch`, force the Following feed, or match on text.
That needs a real Web Extension with a content script, which is what this is.
