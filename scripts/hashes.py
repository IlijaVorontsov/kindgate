#!/usr/bin/env python3
"""Print a sorted SHA-256 list of exactly the files that ship in the extension.

    python3 scripts/hashes.py                the working tree, staged as build.sh stages it
    python3 scripts/hashes.py --ref v6.4     the same for a tag or commit (tracked files only)
    python3 scripts/hashes.py --dir <folder> every file in a folder as it is, for example an
                                             installed app's .appex/Contents/Resources

One line per file, "<sha256>  <path>", sorted by path: the format of `shasum -a 256`,
so `shasum -a 256 -c` can read it too.

Which files ship is not decided here. This script reads the STRIP line from build.sh
(of the given ref, when --ref is used) and runs the same rsync with the same excludes
into a temporary folder, then hashes what arrived. Change STRIP and this list follows.

Stdlib only; needs rsync and, for --ref, git: both are already needed to build.
"""
import hashlib
import io
import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def die(msg):
    print(f"hashes: {msg}", file=sys.stderr)
    sys.exit(2)


def strip_list(src):
    """The STRIP entries of the build.sh in src."""
    m = re.search(r'^STRIP="([^"]*)"', (src / "build.sh").read_text(), re.M)
    if not m:
        die(f"no STRIP=\"...\" line in {src / 'build.sh'}")
    return m.group(1).split()


def stage(src, dest):
    """Same call as build.sh's "Stage the extension" step."""
    cmd = ["rsync", "-a", "--delete", "--exclude", ".*"]
    for name in strip_list(src):
        cmd += ["--exclude", name]
    subprocess.run(cmd + [f"{src}/", f"{dest}/"], check=True)


def hash_tree(folder):
    lines = []
    for path in sorted(p for p in folder.rglob("*") if p.is_file() or p.is_symlink()):
        if path.is_symlink():
            die(f"symbolic link in the tree: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append((path.relative_to(folder).as_posix(), digest))
    lines.sort()
    return [f"{digest}  {rel}" for rel, digest in lines]


def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return
    if len(argv) not in (0, 2) or (argv and argv[0] not in ("--ref", "--dir")):
        die("usage: hashes.py [--ref <tag or commit> | --dir <folder>]")

    if argv and argv[0] == "--dir":
        folder = Path(argv[1])
        if not folder.is_dir():
            die(f"not a folder: {folder}")
        print("\n".join(hash_tree(folder)))
        return

    with tempfile.TemporaryDirectory() as tmp:
        src, dest = ROOT, Path(tmp) / "stage"
        dest.mkdir()
        if argv:
            src = Path(tmp) / "src"
            src.mkdir()
            tar = subprocess.run(["git", "-C", str(ROOT), "archive", "--format=tar", argv[1]],
                                 capture_output=True)
            if tar.returncode != 0:
                die(f"git cannot read {argv[1]!r}: {tar.stderr.decode().strip()}")
            with tarfile.open(fileobj=io.BytesIO(tar.stdout)) as archive:
                archive.extractall(src)
        stage(src, dest)
        print("\n".join(hash_tree(dest)))


if __name__ == "__main__":
    main(sys.argv[1:])
