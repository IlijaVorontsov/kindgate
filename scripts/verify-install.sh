#!/bin/bash
# Kindgate: compare an installed Mac app's extension files with the source at a tag.
#
#   bash scripts/verify-install.sh                         /Applications/Kindgate.app, tag v<its version>
#   bash scripts/verify-install.sh <Kindgate.app>          another copy of the app
#   bash scripts/verify-install.sh <Kindgate.app> <ref>    against a given tag or commit
#   bash scripts/verify-install.sh <Kindgate.app> --sums <file>
#                                                          against a published hash list
#
# Run it from a clone of https://github.com/IlijaVorontsov/kindgate. It hashes every
# file in the app's <extension>.appex/Contents/Resources, builds the hash list for the
# tag with scripts/hashes.py (the files build.sh stages), and prints every file that
# differs, is missing from the app, or is in the app but not in the source.
# Exit 0: all files match. Exit 1: at least one line printed. Exit 2: could not check.
#
# STATUS: run against a Mac app built locally by "build.sh --mac" (ad-hoc signed,
# 2026-11-22): all files matched and nothing was extra. NOT YET RUN AGAINST A STORE
# BUILD: no App Store or TestFlight build of the Mac app exists yet. The store may
# add files to Resources or rewrite some; nothing is treated as "expected to differ"
# until that has been seen on a real build, so every difference is printed.
# The one file in Resources that does not come from the staged extension folder is
# PrivacyInfo.xcprivacy, which the build adds from app/Kindgate Extension/. hashes.py
# lists it, so it is compared like the rest. A tag from before that file was listed
# shows it as EXTRA.
#
# What a clean result means: the scripts, styles, lists, fonts and images in this app
# are byte for byte the ones in the source at that tag. It says nothing about the
# compiled Swift code (the app and the small native message handler), and it does not
# work for the iPhone app. See "Check it yourself" in README.md.
set -o pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"

APP="/Applications/Kindgate.app"; REF=""; SUMS=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    --sums) SUMS="$2"; shift 2 || { echo "--sums needs a file"; exit 2; };;
    *.app|*.app/) APP="${1%/}"; shift;;
    *) REF="$1"; shift;;
  esac
done

[ -d "$APP" ] || { echo "No app at $APP. Give the path to Kindgate.app as the first argument."; exit 2; }
RES=""
for d in "$APP"/Contents/PlugIns/*.appex/Contents/Resources; do
  [ -f "$d/manifest.json" ] && RES="$d" && break
done
[ -n "$RES" ] || { echo "No Safari web extension (an .appex with a manifest.json) inside $APP."; exit 2; }

VERSION=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$RES/manifest.json") || exit 2
TMP=$(mktemp -d) || exit 2
trap 'rm -rf "$TMP"' EXIT

if [ -n "$SUMS" ]; then
  [ -f "$SUMS" ] || { echo "No hash list at $SUMS."; exit 2; }
  cp "$SUMS" "$TMP/expected"; AGAINST="hash list $SUMS"
else
  [ -n "$REF" ] || REF="v$VERSION"
  COMMIT=$(git -C "$REPO" rev-parse --verify --quiet "$REF^{commit}") || {
    echo "This clone has no tag or commit '$REF'. Run 'git fetch --tags', or name a ref or --sums <file>."; exit 2; }
  python3 "$HERE/hashes.py" --ref "$COMMIT" > "$TMP/expected" || exit 2
  AGAINST="source at $REF ($COMMIT)"
fi
python3 "$HERE/hashes.py" --dir "$RES" > "$TMP/actual" || exit 2

echo "App:      $APP (extension version $VERSION)"
echo "Files:    $RES"
echo "Against:  $AGAINST"
echo

# Lines are "<64 hex>  <path>"; the path starts at column 67 and may hold spaces.
awk '
  { hash = substr($0, 1, 64); path = substr($0, 67) }
  FNR == NR { want[path] = hash; next }
  { have[path] = hash }
  END {
    for (p in want) {
      if (!(p in have)) print "MISSING  " p
      else if (have[p] != want[p]) print "DIFFERS  " p
      else same++
    }
    for (p in have) if (!(p in want)) print "EXTRA    " p
    printf "SUMMARY  %d of %d source files match\n", same, length(want)
  }' "$TMP/expected" "$TMP/actual" | sort > "$TMP/report"

grep -v '^SUMMARY' "$TMP/report"
BAD=$(grep -vc '^SUMMARY' "$TMP/report")
grep '^SUMMARY' "$TMP/report" | sed 's/^SUMMARY  //'
if [ "$BAD" = 0 ]; then
  echo "OK: every extension file in the app matches the source. The compiled Swift code is not covered."
  exit 0
fi
echo "$BAD file(s) differ, are missing or are extra. MISSING: in the source, not in the app."
echo "EXTRA: in the app, not in the source. Either can come from Xcode or the store; read the header of this script."
exit 1
