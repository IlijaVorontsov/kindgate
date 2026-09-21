#!/bin/bash
# Kindgate — convert, build, and install onto the connected iPhone.
# Run:  bash build.sh   (from anywhere; the script finds its own folder)
#
# Layout: the repo root is the web extension. app/ holds the container app's
# own files (Swift, storyboard, entitlements) and is overlaid onto the project
# the converter generates, so the converter stays the source of truth for
# project.pbxproj and app/ stays the source of truth for the app.
set -o pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$(dirname "$SRC")/Kindgate-Xcode"
STAGE="$OUT/stage"                 # the extension alone, what the converter sees
PROJDIR="$OUT/Kindgate"
PROJ="$PROJDIR/Kindgate.xcodeproj"
PBX="$PROJ/project.pbxproj"
LOG="$SRC/build.log"

BUNDLE="app.kindgate"
APP_GROUP="group.$BUNDLE"
# Repo entries that are not part of the extension and must not be bundled.
# Keep in sync with CLAUDE.md when adding non-extension files to the root.
# docs/ is ignored by git but listed anyway: an untracked local copy would
# otherwise be rsynced straight into the signed .appex.
STRIP="app docs site scripts changelog.d build.sh build.log README.md LICENSE CLAUDE.md CHANGELOG.md"
STAGE_EXCLUDES=(--exclude '.*'); for s in $STRIP; do STAGE_EXCLUDES+=(--exclude "$s"); done

exec > >(tee "$LOG") 2>&1
echo "== Kindgate build $(date) =="

step() { echo; echo "---- $* ----"; }

step "Xcode"
xcodebuild -version || { echo "Xcode command-line tools not ready. Open Xcode once, accept the license, then re-run."; exit 1; }

step "Stage the extension"
# Only the extension goes to the converter. Staging is what keeps app/, the
# website, the build script and the docs out of the signed .appex; a plain
# conversion copies the whole folder and would bundle all of it.
mkdir -p "$STAGE"
rsync -a --delete "${STAGE_EXCLUDES[@]}" "$SRC/" "$STAGE/" || exit 1
ls "$STAGE"

step "Convert web extension -> Xcode project"
# The converter references each resource file individually, so a file added
# since the last conversion would never be bundled. Reconvert if any is missing.
if [ -f "$PBX" ]; then
  for f in "$STAGE"/*; do
    b=$(basename "$f")
    if ! grep -q "/\* $b \*/" "$PBX"; then
      echo "$b is not in the Xcode project yet -> regenerating project"
      rm -rf "$PROJDIR"; break
    fi
  done
fi
# ...and the reverse: a file the project still references but which no longer
# exists would fail the build with "No such file or directory".
if [ -f "$PBX" ]; then
  for ref in $(grep -o 'path = Resources/[^;]*;' "$PBX" | sed 's/path = Resources\///;s/;$//'); do
    if [ ! -e "$STAGE/$ref" ]; then
      echo "$ref is referenced by the Xcode project but was removed -> regenerating project"
      rm -rf "$PROJDIR"; break
    fi
  done
fi
if [ ! -d "$PROJ" ]; then
  rm -rf "$PROJDIR"
  xcrun safari-web-extension-converter "$STAGE" \
    --project-location "$OUT" --app-name Kindgate \
    --bundle-identifier "$BUNDLE" --ios-only --swift --no-open --force --copy-resources || exit 1
else
  echo "Project exists, syncing resources"
  rsync -a --delete "$STAGE/" "$PROJDIR/Kindgate Extension/Resources/"
fi
ls "$PROJ" >/dev/null || { echo "Project not found at $PROJ"; exit 1; }

step "Overlay app/ onto the generated project"
# Replaces the converter's ViewController.swift, Main.storyboard and
# SafariWebExtensionHandler.swift, and adds the two entitlements files.
rsync -a "$SRC/app/" "$PROJDIR/" || exit 1
find "$SRC/app" -type f | sed "s|$SRC/app/|  |"

step "App Group entitlements"
# Both targets need the same App Group so the extension can hand status to the
# app. CODE_SIGN_ENTITLEMENTS is a path, so no file references are required.
# This runs before the bundle ids are normalised, while the extension target
# is still the only one whose id ends in .Extension.
python3 - "$PBX" <<'PYEOF'
import re, sys
path = sys.argv[1]
src = open(path).read()
if src.count("CODE_SIGN_ENTITLEMENTS") >= 4:
    print("already set"); sys.exit(0)
out = []
n = 0
for ln in src.splitlines(True):
    m = re.match(r'(\s*)PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);', ln)
    if m:
        indent, ident = m.group(1), m.group(2).strip('"')
        ent = ('"Kindgate Extension/Kindgate Extension.entitlements"'
               if ident.endswith(".Extension") else "Kindgate/Kindgate.entitlements")
        out.append("%sCODE_SIGN_ENTITLEMENTS = %s;\n" % (indent, ent))
        n += 1
    out.append(ln)
open(path, "w").write("".join(out))
print("added CODE_SIGN_ENTITLEMENTS to %d build configurations" % n)
PYEOF
grep -c 'CODE_SIGN_ENTITLEMENTS' "$PBX"
grep -q "$APP_GROUP" "$PROJDIR/Kindgate/Kindgate.entitlements" || { echo "entitlements missing $APP_GROUP"; exit 1; }

step "App Info.plist: URL schemes the checklist may query"
# canOpenURL(youtube://) / canOpenURL(instagram://) tells the app whether the
# native apps are still installed; iOS only answers for schemes listed here.
plutil -replace LSApplicationQueriesSchemes -json '["youtube","instagram"]' "$PROJDIR/Kindgate/Info.plist" || exit 1
plutil -extract LSApplicationQueriesSchemes json -o - "$PROJDIR/Kindgate/Info.plist"

step "Normalise bundle identifiers"
# The converter names the app target after the app name (dev.vorontsov.Kindgate)
# while the extension keeps the requested id, so the extension is no longer
# prefixed by its parent and signing fails. Force both to $BUNDLE.
sed -i '' \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9._-]*\.Extension;/PRODUCT_BUNDLE_IDENTIFIER = @@EXT@@;/g" \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9][A-Za-z0-9._-]*;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE;/g" \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = @@EXT@@;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE.Extension;/g" \
  "$PBX"
grep -o 'PRODUCT_BUNDLE_IDENTIFIER = [^;]*' "$PBX" | sort -u

step "Signing identity"
# The team ID is the certificate's OU, not the ID in the common name.
CERT=$(security find-identity -v -p codesigning 2>/dev/null | grep -o 'Apple Development: [^"]*' | head -1)
TEAM=$(security find-certificate -c "$CERT" -p 2>/dev/null | \
  openssl x509 -noout -subject -nameopt sep_multiline 2>/dev/null | \
  sed -n 's/^ *OU=//p' | head -1)
if [ -z "$TEAM" ]; then
  echo "No Apple Development certificate found yet."
  echo "Opening the project in Xcode: add your Apple ID (Xcode > Settings > Accounts),"
  echo "then in Signing & Capabilities pick your Personal Team for BOTH targets and press Run."
  open "$PROJ"; exit 2
fi
echo "Team: $TEAM"

step "Connected iPhone"
xcrun devicectl list devices
DEVICE=$(xcrun devicectl list devices --json-output /tmp/kindgate-devices.json >/dev/null 2>&1 && \
  python3 -c "import json;d=json.load(open('/tmp/kindgate-devices.json'))['result']['devices'];p=[x for x in d if x.get('hardwareProperties',{}).get('platform')=='iOS' and x.get('connectionProperties',{}).get('pairingState')=='paired'];print(p[0]['identifier'] if p else '')")
if [ -z "$DEVICE" ]; then
  echo "No paired iPhone found. Plug it in, unlock it, tap Trust, then re-run."; exit 3
fi
echo "Device: $DEVICE"

step "Build (this can take a few minutes the first time)"
xcodebuild -project "$PROJ" -scheme Kindgate -configuration Debug \
  -destination "id=$DEVICE" -derivedDataPath "$OUT/DerivedData" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM" build | grep -E "error|warning: no|BUILD|Signing|Provisioning"
[ "${PIPESTATUS[0]}" = 0 ] || { echo "BUILD FAILED — see $LOG"; open "$PROJ"; exit 4; }

APP=$(find "$OUT/DerivedData/Build/Products" -name "Kindgate.app" -path "*iphoneos*" | head -1)
step "Install $APP"
xcrun devicectl device install app --device "$DEVICE" "$APP" || exit 5

echo
echo "== DONE =="
echo "On the iPhone: Settings > General > VPN & Device Management > trust your Apple ID (first time only),"
echo "then open Kindgate: its checklist walks through enabling the extension, allowing the sites,"
echo "and deleting the apps, and each step turns green by itself once done."
