# changelog.d

One fragment per user-visible change. File name: `<topic>.<type>.md` with
`<type>` one of `added`, `changed`, `deprecated`, `removed`, `fixed`,
`security`. Content: Markdown list lines written for users.

Example `warm-overlay.added.md`:

    - Warm, dimmed screen at night, toggled from the popup.

Commands (from the repo root):

    python3 scripts/changelog.py check              # branch has a fragment if it needs one
    python3 scripts/changelog.py preview            # show the assembled section
    python3 scripts/changelog.py release <version>  # fold into CHANGELOG.md, bump manifest

See `CLAUDE.md` for the full workflow.
