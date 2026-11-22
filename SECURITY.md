# Security

Kindgate runs on every website you open in Safari. A mistake here matters, so reports are welcome.

## How to report

Please do not open a public issue for a security or privacy problem.

- **Preferred:** GitHub's private report form:
  <https://github.com/IlijaVorontsov/kindgate/security/advisories/new>
- **Or by mail:** hello@kindgate.app, with "security" in the subject.

Say what you found, where (file and line, or the steps), which version (the number in
`manifest.json`, or the commit), and on which device and system. A short proof helps. Leave out
other people's data.

## In scope

- Anything that makes data leave the device without the user sending it.
- A website reading what Kindgate stores or shows: the logs, the settings, the PIN.
- A website or another extension making Kindgate do something: run code, open addresses, change
  settings, skip the pause.
- The native message between the extension and its app, and what the app keeps.
- The build: a way for a file that is not part of the extension to end up in the shipped app.
- A difference between what the README, the popup or the privacy policy say and what the code does.

## Not in scope

- Getting past a pause or check-in on purpose, as the person using the device. Kindgate adds
  friction, not a lock, and the PIN on the pause section is a curtain (see the README).
- Layout that breaks because YouTube or Instagram changed their pages. Open a normal issue.
- The websites Kindgate runs on, Safari itself, and kindgate.app's hosting.

## What to expect

One person maintains Kindgate.

- An answer within 7 days that the report arrived.
- An assessment, and a plan if it is confirmed, within 30 days.
- A fix in the next release, a `security` entry in `CHANGELOG.md`, and your name in it if you
  want that.
- No bounty: there is no budget for one.

Only the newest release is fixed. Please give a fix time to reach the App Store before you publish
details; 90 days is the usual limit, sooner once the fix is out.
