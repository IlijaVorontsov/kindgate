#!/usr/bin/env python3
"""Fold changelog.d/ fragments into CHANGELOG.md (Keep a Changelog format).

    python3 scripts/changelog.py check              exit 1 if code changed vs origin/main
                                                    but no fragment was added
    python3 scripts/changelog.py preview            print the section that would be released
    python3 scripts/changelog.py release <version>  write the section, delete fragments,
                                                    bump manifest.json, update compare links

Fragment file name: <topic>.<type>.md, type in TYPES below. Stdlib only.
"""
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAGMENT_DIR = ROOT / "changelog.d"
CHANGELOG = ROOT / "CHANGELOG.md"
MANIFEST = ROOT / "manifest.json"
REPO_URL = "https://github.com/IlijaVorontsov/kindgate"

# Keep a Changelog section order.
TYPES = ["added", "changed", "deprecated", "removed", "fixed", "security"]
CODE_GLOBS = ("*.js", "*.css", "*.html", "manifest.json")


def die(msg):
    print(f"changelog: {msg}", file=sys.stderr)
    sys.exit(1)


def fragments():
    """Return {type: [(path, text), ...]} in file-name order."""
    out = {t: [] for t in TYPES}
    for path in sorted(FRAGMENT_DIR.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        parts = path.name.split(".")
        if len(parts) < 3 or parts[-2] not in TYPES:
            die(f"bad fragment name {path.name}: expected <topic>.<type>.md with type in {TYPES}")
        text = path.read_text().strip()
        if not text:
            die(f"empty fragment {path.name}")
        lines = []
        for line in text.splitlines():
            line = line.rstrip()
            if not line:
                continue
            if not line.startswith(("- ", "* ")) and not line.startswith("  "):
                line = "- " + line
            lines.append(line)
        out[parts[-2]].append((path, "\n".join(lines)))
    return out


def render(version, date, frags):
    body = [f"## [{version}] - {date}"]
    for t in TYPES:
        if frags[t]:
            body.append("")
            body.append(f"### {t.capitalize()}")
            body.append("")
            body.extend(text for _, text in frags[t])
    return "\n".join(body) + "\n"


def cmd_preview():
    frags = fragments()
    if not any(frags.values()):
        print("no fragments in changelog.d/")
        return
    print(render("Unreleased", datetime.date.today().isoformat(), frags), end="")


def cmd_check():
    try:
        subprocess.run(["git", "fetch", "-q", "origin", "main"], cwd=ROOT, check=True)
    except subprocess.CalledProcessError:
        die("git fetch origin main failed")
    base = subprocess.run(
        ["git", "merge-base", "origin/main", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip() or "origin/main"
    changed = subprocess.run(
        ["git", "diff", "--name-only", base, "HEAD", "--"], cwd=ROOT, capture_output=True, text=True
    ).stdout.split()
    changed += subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--"], cwd=ROOT, capture_output=True, text=True
    ).stdout.split()
    changed += subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True
    ).stdout.split()
    code = sorted({f for f in changed
                   if not f.startswith("site/") and any(Path(f).match(g) for g in CODE_GLOBS)})
    frag = sorted({f for f in changed if f.startswith("changelog.d/") and f != "changelog.d/README.md"})
    if code and not frag:
        print("changelog: code changed but no fragment added in changelog.d/:", file=sys.stderr)
        for f in code:
            print(f"  {f}", file=sys.stderr)
        print("Add changelog.d/<topic>.<type>.md. Only refactors, build and docs-only "
              "changes may skip this.", file=sys.stderr)
        sys.exit(1)
    fragments()  # validates names
    print("changelog: ok" + (f" ({len(frag)} fragment(s))" if frag else " (no code changes)"))


def cmd_release(version):
    if not re.fullmatch(r"\d+\.\d+(\.\d+)?", version):
        die(f"version must look like 6.3 or 6.3.1, got {version}")
    frags = fragments()
    if not any(frags.values()):
        die("no fragments to release")
    text = CHANGELOG.read_text()
    if f"## [{version}]" in text:
        die(f"version {version} already in CHANGELOG.md")
    m = re.search(r"^## \[Unreleased\]\n", text, re.M)
    if not m:
        die("CHANGELOG.md has no '## [Unreleased]' heading")
    prev = re.search(r"^## \[(\d[^\]]*)\]", text[m.end():], re.M)
    prev_version = prev.group(1) if prev else None

    today = datetime.date.today().isoformat()
    section = render(version, today, frags)
    text = text[: m.end()] + "\n" + section + "\n" + text[m.end():].lstrip("\n")

    # Compare links at the bottom.
    text = re.sub(
        r"^\[Unreleased\]: .*$",
        f"[Unreleased]: {REPO_URL}/compare/v{version}...HEAD",
        text, flags=re.M,
    )
    link = (f"[{version}]: {REPO_URL}/compare/v{prev_version}...v{version}"
            if prev_version else f"[{version}]: {REPO_URL}/releases/tag/v{version}")
    text = re.sub(r"^(\[Unreleased\]: .*)$", r"\1\n" + link, text, count=1, flags=re.M)
    CHANGELOG.write_text(text)

    manifest = json.loads(MANIFEST.read_text())
    manifest["version"] = version
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    for t in TYPES:
        for path, _ in frags[t]:
            path.unlink()

    print(section, end="")
    print(f"\nCHANGELOG.md and manifest.json updated to {version}; fragments removed.")
    print(f"Next: git add -A && git commit -m 'chore: release {version}' ; after merge: git tag v{version}")


def main(argv):
    if len(argv) >= 2 and argv[1] == "preview":
        cmd_preview()
    elif len(argv) >= 2 and argv[1] == "check":
        cmd_check()
    elif len(argv) == 3 and argv[1] == "release":
        cmd_release(argv[2])
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv)
