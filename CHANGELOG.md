# Changelog

All notable changes to Kindgate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow the major.minor number in `manifest.json`.

Unreleased changes live as fragments in `changelog.d/` and are folded in by
`scripts/changelog.py release <version>`.

## [Unreleased]

## [6.4] - 2026-11-24

### Added

- Privacy policy, support and open source licences are now one tap away, under
  About in the Kindgate app and in the popup.
- The pause self-check now shows when a result is saved on the device, and a "Clear result" button deletes it. Before, the score could only be removed by removing the extension.
- The daytime check-in card can now be switched off, at the top of Check-in &
  cues in the popup. It stays on unless you turn it off.
- A setup checklist in the Kindgate app itself. Each step reports live state:
  whether the extension is on, which sites you allowed, whether the YouTube and
  Instagram apps are gone, and whether the sites are on your Home Screen.
- The first time a cleaned feed opens, a small note says that Kindgate is on,
  what is gone, what still works and where the settings are. It fades by
  itself and is shown only once.
- The wins log and the pause log can now be copied as JSON and cleared from the
  popup, as the cue log already could: wins under Evening plan, the pause log
  under Pause › Patterns.
- The Mac app is now Kindgate's own: a window that shows whether the extension is turned on in Safari and which sites it is allowed on, with a button that opens Safari's extension settings.
- Privacy policy, support, source code, open source licences and the version are in the Mac app.
- A proper Mac app icon.
- `KINDGATE_REGISTER_DEVICE=1 bash build.sh --mac` lets Xcode register this Mac with the team, which a team-signed Mac build needs once.
- Kindgate for Safari on the Mac: `bash build.sh --mac` builds and installs it,
  `bash build.sh --stage` prepares a folder for Safari's Add Temporary Extension.
- Media keys on any video with a keyboard: Q normal speed, W / E slower / faster
  by 0.1×, A fullscreen, S / D back / forward 10 seconds. Keys go by position,
  so on Colemak they are Q, W / F, A, R / S. Every key, the speed step and the
  jump length can be changed under Media keys in the popup.
- The speed you pick with the media keys applies to every video in every tab
  and window, and is remembered after Safari restarts. Q switches between 1×
  and that speed.
- More YouTube Shorts tiles are hidden on the desktop site.
- Option to hide "Explore" and "More from YouTube" in YouTube's desktop menu
  (on by default).
- "Check it yourself" in the README: what each script that runs on all websites
  does, what is stored where, what the app is told, and what a check cannot show.
- A prompt to paste into an AI assistant so it checks the privacy claim against
  the code (`AUDIT.md`).
- On the Mac, the installed app's extension files can be compared with the
  public source: `scripts/verify-install.sh`, with the hash list from
  `scripts/hashes.py`. Not yet tried on an App Store build.
- How to report a security or privacy problem in private (`SECURITY.md`), how to
  contribute (`CONTRIBUTING.md`), and a note that the name and icon are not part
  of the open licence (`TRADEMARK.md`).
- Ready-made pause lists: switch on adult sites, social feeds or gambling in
  the popup instead of typing every site by hand. The lists ship inside the
  extension and never phone home.
- Optional: carry speed changes from the player over to all videos. A speed you pick in any player's own menu becomes the speed for every video in every tab, also on the iPhone, where there are no keys. Off by default; site-made changes and ads are ignored.
- The popup shows the speed every video starts at, with −, 1× and + to change it without a keyboard (on the iPhone too).
- `bash build.sh --mac` builds without a signing certificate (signed to run
  locally; Safari then needs *Allow unsigned extensions*), and `--no-install`
  builds without copying the app to `~/Applications`.
- `bash build.sh --simulator` compiles the iPhone app for the iOS Simulator
  with no device or Apple ID.

### Changed

- The cards and pages now say only what the research supports. Lines such as
  "Most urges are gone before this reaches zero" and "Urges crest and fade
  within minutes" are gone: ten minutes later you simply decide again. The
  night page no longer says an app cannot help with insomnia, and the morning
  and coffee notes no longer claim more than is known.
- Instagram's switch is now called "Hide Reels and Explore", and the night page lists "Some things that may help".
- Renamed to Kindgate. The app icon is now a garden gate standing ajar, and the
  check-in, pause, timer and morning screens share one warm honey-and-cream
  palette instead of the old iOS greys and teal.
- Headlines are set in Fraunces and everything else in Instrument Sans, both
  bundled with the extension so they work offline.
- `build.sh --mac` signs the app to run locally unless `DEVELOPMENT_TEAM` is set, so a build never contacts Apple's signing service unasked. `--mac --release` prepares an archive for the Mac App Store.
- The default YouTube speed setting is gone. Speed is now set only with the
  media keys, as one speed for every video in every tab. A default speed you
  had set before becomes the starting speed.
- On the Mac the popup leaves out the iPhone-only player options (the Subscriptions / You bar, the Picture in Picture button, rotate to fullscreen), and its wording no longer assumes a phone.
- The private tabs note in the popup now says what it is for (tabs left open overnight) and is shown only on iPhone and iPad, where those Safari settings exist.
- The pause screen, the weekly stats line and the NSDR start button no longer speak of a phone or a tap.
- After a new install Kindgate cleans the two feeds and does nothing else. The
  check-in card, the morning, after-work and night windows, the warm screen
  and the pause are off until you switch them on.
- If you installed Kindgate before this update, nothing changes for you:
  everything you had on stays on, and anything you had switched off stays off.
- The privacy line in the popup now says exactly what happens: Kindgate sends
  nothing by itself, and the optional Claude button opens claude.ai with a
  message on the clipboard.
- The Kindgate app's setup asks for three things only: the extension, and
  youtube.com and instagram.com allowed. "Other Websites" and the steps to
  delete the apps move to "If you want" and are never shown as unfinished.
- The extension description no longer claims to remove Instagram's ads; it
  describes what you get instead — Instagram limited to the accounts you follow.
- The popup has two levels. It opens on the feeds: YouTube and Instagram with
  one switch each and "Adjust" for the details, the video speed (or, on a Mac,
  the video keys), and one door, "More help", to everything for evenings,
  nights, mornings and single sites.
- Under More help, each part has one switch and one sentence on what it does.
  The three that act on every website say so before you switch them on.
- After this update the popup says once that nothing was switched off, and
  shows you where your parts now live.
- The toolbar button is now called just "Kindgate".
- Builds from source now run on iOS 18 and macOS 15 or later, instead of only
  on the version the installed Xcode ships.

### Removed

- The iPhone and iPad no longer have media keys: the "Media keys on any video" switch, the key settings and "Reset keys" are gone from the popup there, and no key presses are watched. The video speed row and carry-over stay. The Mac keeps its keys.
- The evening plan no longer counts a day streak. It keeps a weekly total of
  wins and the date of the last one, so a missed day is never a loss.

### Fixed

- The licence of the ready-made pause lists now ships with them. The build left
  that file out before.
- Building the Mac app no longer leaves extra "Kindgate" entries in Safari's Extensions list: `build.sh --mac` unregisters its build copy and warns if more than one is registered.
- The Mac app shows Safari's error code when the settings button fails.
- YouTube on the desktop site: the video and the description below it could
  disappear, leaving a blank player and a page that would not scroll.
- The phone-only Subscriptions / You bar and the floating Picture in Picture
  button no longer appear on the Mac, including in fullscreen.
- Instagram: videos from accounts you follow are no longer hidden, and opening
  one of their reels is no longer sent back to the feed. Only the Reels tab and
  Explore are blocked.
- Instagram on the desktop site: ads labelled "Ad" (or "Anzeige" / "Werbung")
  are now hidden, not only those labelled "Sponsored".
- The settings popup scrolls on the Mac; it used to cut off below the first
  open section.
- The toolbar icon has transparent corners instead of a white square around it, and comes in sizes made for the Mac toolbar.
- Resizing a YouTube window on the Mac from tall to wide no longer starts the video and asks for fullscreen, as if a phone had been rotated.
- Safari's address bar and toolbar now match the pause, night, timer and morning screens instead of staying white underneath them.
- Text on those screens fades into the background at the top and bottom edges instead of being cut off by Safari's bars.
- A speed you pick in the player's own menu is no longer forced back to Kindgate's speed. Kindgate's speed is where each video starts, not a lock: the change holds for that video, and the next one starts at your speed again.
- The ready-made social list no longer pauses three messaging addresses
  (m.me, messages-facebook.com and a WeChat one). The list is for feeds, not
  for talking to people.
- If the extension's settings can't be read (for example in a tab left open across an update), pages now load normally instead of showing the night-time or pause screen with default settings.
- The app icon on the home screen is Kindgate's own gate mark rather than the
  generic placeholder Xcode's converter supplies.
- Building from source works with Xcode 27.2, which writes its projects in a
  new format the build script could not edit.
- On YouTube, the player's own speed menu now shows the speed Kindgate set, also after you change it in Safari's fullscreen player, and the next video starts at it.
- Links and section labels in the light popup, check-in card and Mac app are a darker amber, easier to read on the cream and sand backgrounds.
- On an iPad, where Safari opens YouTube's desktop site, the phone-only extras (the Subscriptions / You bar, the floating Picture in Picture button and rotate to fullscreen) no longer appear over the desktop player. They stay on m.youtube.com.

### Security

- The Mac app no longer contains Apple's placeholder code, which wrote every message from the extension to the system log. It uses the same small handler as the iPhone app, and its source is in the repository.
- The Mac app asks macOS for less: it runs in the sandbox with no network access and no access to files.
- Kindgate now asks for the `nativeMessaging` permission. It is used for one
  thing: the extension tells the Kindgate app on the same device that it is
  switched on and which of YouTube, Instagram and other websites it may run on,
  so the app's setup checklist can show live state. Nothing leaves the device.
- The extension tells the Kindgate app less. Instead of the list of sites
  Safari has granted, it now passes three yes/no answers (YouTube, Instagram,
  other websites), which is all the setup checklist shows. A list stored by an
  earlier version is removed, and a message the app does not understand is no
  longer written to the system log.
- Links Kindgate opens for you (claude.ai, the NSDR recording, your own
  "instead" links) no longer tell the site you land on which site you came
  from. Before, Safari passed the address of the site you were on, which on a
  pause screen is the paused site.
- The NSDR diagnostic no longer stores the path of the YouTube page it fired
  on, only the time. A path stored by an earlier version is removed the next
  time the popup is opened.
- The README now says that the copy of the feature switches kept in YouTube's
  and Instagram's own storage can be read by those sites and stays after
  Kindgate is removed, and that the app is told which sites you granted the
  extension. Neither leaves the device; both were undocumented.
- Why Kindgate asks for the `nativeMessaging` permission: the extension uses it
  only to tell its own app, on the device, that it is switched on and which
  sites it may run on, so the app's setup checklist can show that. It reaches
  no other app and no server.
- The check-in card, the morning, night and timer pages, the pause screen and
  the toasts are now sealed off from the site they appear on. Before, a site
  could have read the feeling you tapped, your plans and your goal from the
  page. Kindgate never sent any of it; now the site cannot see it either.
- The morning page's Shortcuts button hands Shortcuts only the site's front
  page as the address to return to on an error, not the page you were on.

## [6.2] - 2026-09-18

### Added

- Initial public commit of the Safari web extension: YouTube without Shorts or
  the Home feed, Instagram limited to accounts you follow, cue check-in on every
  page open, pause screens and coffee timer.

[Unreleased]: https://github.com/IlijaVorontsov/kindgate/compare/v6.4...HEAD
[6.4]: https://github.com/IlijaVorontsov/kindgate/compare/v6.2...v6.4
[6.2]: https://github.com/IlijaVorontsov/kindgate/releases/tag/v6.2
