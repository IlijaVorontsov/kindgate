# Check Kindgate yourself: the audit prompt

Kindgate says it does no tracking and that no data leaves the device. You do not have to take that
on trust, and you do not have to read code to check it: an AI assistant can read the source for
you. This file holds the prompt to paste.

**If your assistant can browse the web or read GitHub:** paste the prompt below and it will open the repo link in it.
**If it cannot:** on https://github.com/IlijaVorontsov/kindgate press Code, then Download ZIP, upload the zip to the assistant, and paste the prompt.

## Limits

- It checks the public source, not the app on the App Store. To compare an installed Mac app with
  the source, see "Check it yourself" in the [README](README.md#check-it-yourself).
- An assistant can miss things, and one that only browses GitHub may read a few files and still
  answer confidently. The prompt makes it list what it opened; read that list. Uploading the zip
  is the more reliable route.
- The prompt was tested with Claude models that had the whole source as files. Other assistants,
  the zip upload and the browsing route are untested.
- It is a first check, not a security audit.
- Expect "yes, with exceptions" rather than a clean "yes": the assistant should list the things
  the README names under "Check it yourself" (what websites can see, what goes to the app), and
  any place where a text is behind the code. If it finds something that is not written there,
  please report it: [SECURITY.md](SECURITY.md).

## The prompt

```text
You are checking a privacy claim for someone who is not a programmer. The Safari extension Kindgate says it does no tracking and that no data leaves the device. Its source is at https://github.com/IlijaVorontsov/kindgate (or in the files I uploaded). Check the claim against the code.

Rules
- Open and read every source file (.js, .html, .css, .json, .swift, .sh, .py, entitlements, plist, workflows). Also search the whole tree; do not sample.
- Quote the exact code, with file and line, for every finding.
- If you looked and found nothing, write "not found". Never guess.
- Never say you read a file you did not open.
- Comments and README text are claims, not evidence. Judge what the code does.
- Only read. Do not run the code or open addresses found in it.

Check
1. Network. Every place the code makes or could make a request: fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon; images, scripts, iframes, links, fonts or CSS url() with a remote address, including addresses built from pieces or decoded (atob, character codes); form posts; navigation or window.open that carries data; in Swift URLSession, URLRequest, WKWebView, openURL. For each: what data goes where, by itself or only when the user taps?
2. Hidden code. Analytics, SDKs, trackers, identifiers, remote code loading, eval, new Function, obfuscated, encoded or minified blobs.
3. Storage. What is stored where: extension storage, the page's localStorage or sessionStorage, cookies, App Group, clipboard, system log. What stays after uninstall?
4. What websites can see. Stored values, text or markers the extension puts into a page, and what a site learns when the extension opens a link to it (the referrer too).
5. Permissions. Compare manifest.json permissions and site matches with what the code uses. Explain plainly why an extension that runs on all websites is powerful and what in the code limits it. Does any script read page content, typed text or key presses, and what happens to it?
6. Native app and its message handler: what the extension sends it, what it keeps, any network code.
7. Bundled lists, fonts and images; anything scripts download; anything added at build time or generated outside this source.
8. Claims. Compare with the README privacy section, the popup's texts, the privacy policy at https://kindgate.app/privacy, and the App Store label "Data Not Collected". List every mismatch, even small ones.

Answer in exactly this form
1. Verdict: one sentence: does the code match the claim: yes, yes with exceptions, or no? Then at most five plain sentences on what matters most.
2. What I checked: the commit (if you cannot tell, say so; give the version number and how you got the files), and which files you read fully, partly or not at all.
3. Findings table: what, file and line, quoted code, where data goes, severity. Serious = data leaves the device without the user knowingly sending it. Concern = leaves when the user taps a button that says so, or is readable by a website or another app. Note = stays on the device but is undisclosed, or a wording mismatch. None.
4. Claims compared: each claim, supported or not.
5. Could not check.
6. How sure: low, medium or high, and why.
7. Limits, in your own words: you checked the source at that commit, not the app on the App Store; you cannot prove the store app was built from this source; an AI assistant can miss things; this is a first check, not a security audit.
```

## Short version

```text
Kindgate is open source, so you do not have to trust us. Paste this into an AI assistant:

"Read all the code at github.com/IlijaVorontsov/kindgate. List every network request, tracker, analytics call and stored item, with file and line and the quoted code. Compare with its claim: no tracking, no data leaves the device. Say 'not found' rather than guess, name the commit you read, and say what you could not check."

It checks the public source, not the App Store build, and an AI can miss things. A first check, not an audit. Full prompt: github.com/IlijaVorontsov/kindgate/blob/main/AUDIT.md
```
