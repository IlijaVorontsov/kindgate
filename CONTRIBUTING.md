# Contributing

The source is public mainly so that anyone can check what Kindgate does. Issues, questions about
the code and security reports (see [SECURITY.md](SECURITY.md)) are the most useful contributions.
Code is welcome too, under the rules below. For anything larger than a small fix, open an issue
first.

## Build and try a change

Plain JavaScript and CSS: no bundler, no package manager. You need a Mac.

| Where | Command | Needs |
| --- | --- | --- |
| Safari on the Mac, quickest | `bash build.sh --stage`, then Safari > Settings > Developer > Add Temporary Extension and pick the folder it prints | Nothing else. Safari drops the extension on quit. |
| Safari on the Mac, installed | `bash build.sh --mac` | Xcode and a free Apple ID |
| iPhone or iPad | `bash build.sh` with the device plugged in | Xcode and a free Apple ID |

After an edit, run the command again and reload the extension (or the page). There is no automated
test suite: try the change in Safari, on a real iPhone for anything that touches a content script.
The README has the details under Install and Development.

## Rules for a pull request

1. **Branch from `main`**, named `<type>/<short-topic>` with type `feat`, `fix`, `chore`, `docs`
   or `refactor`. Rebase on `main` instead of merging it in.
2. **One logical change per commit.** Subject in the imperative, 72 characters at most, then a
   body that says why.
3. **Changelog fragment.** Every change a user can notice adds a file
   `changelog.d/<topic>.<type>.md` with one or more list lines written for users. `<type>` is
   `added`, `changed`, `deprecated`, `removed`, `fixed` or `security`. Do not edit `CHANGELOG.md`.
   Check with `python3 scripts/changelog.py check`. See [changelog.d/README.md](changelog.d/README.md).
4. **README.** It is the description of what Kindgate does. Update it when behaviour changes.
5. **No remote calls, no new permission** without a `security` fragment that says why. Storage
   goes through `browser.storage.local`.
6. **New files in the repo root** that are not part of the extension go into the `STRIP` list in
   `build.sh`, or they end up inside the shipped app.
7. **Sign off every commit** (next section).

## Sign-off (DCO)

Every commit needs a line

```
Signed-off-by: Your Name <your@address>
```

which `git commit -s` adds for you. With it you state what the
[Developer Certificate of Origin 1.1](https://developercertificate.org/) says: that you wrote the
change, or otherwise have the right to submit it, under this project's licence (MPL-2.0). The
address may be your GitHub noreply address. Pull requests with unsigned commits are not merged.

Why: Kindgate is also distributed, and may be sold, on the App Store. The MPL allows that, but
only for code whose origin is clear. The sign-off is that record for each contribution. You keep
the copyright in what you write; there is no separate contributor agreement to sign.

## Licence and name

Contributions are under the [Mozilla Public License 2.0](LICENSE), like the rest of the code. The
name and the icon are not part of that: see [TRADEMARK.md](TRADEMARK.md).
