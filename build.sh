#!/bin/bash
# Kindgate — convert the web extension to an Xcode project, then either
# install it on the paired iPhone or build it for TestFlight.
#
#   bash build.sh                 Debug build, install over USB (the default)
#   bash build.sh --release       Release archive, exported as a signed .ipa
#   bash build.sh --upload        ...and upload it to App Store Connect
#
# --release and --upload need the paid Apple Developer Program membership and
# an App Store Connect API key. The runbook lives in the private ops repo:
# https://github.com/IlijaVorontsov/kindgatex/blob/main/docs/testflight.md
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

MODE=device
for arg in "$@"; do
  case "$arg" in
    --release) MODE=release;;
    --upload)  MODE=upload;;
    -h|--help) sed -n '2,11p' "$0"; exit 0;;
    *) echo "Unknown option: $arg (try --help)"; exit 1;;
  esac
done

exec > >(tee "$LOG") 2>&1
echo "== Kindgate build ($MODE) $(date) =="

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

step "App icon"
# The converter ships Apple's placeholder, which is also transparent and would
# be rejected on upload. Replace it every build so it can never go stale.
bash "$SRC/scripts/app-icon.sh" "$PROJDIR/Kindgate/Assets.xcassets/AppIcon.appiconset" || exit 6

step "Versions"
# manifest.json is the single source of the release number. The build number
# only has to rise: App Store Connect refuses a build number it has already
# seen, and a rejected upload costs a whole archive.
VERSION=$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['version'])") || exit 1
BUILD="${KINDGATE_BUILD:-$(date +%Y%m%d%H%M)}"
echo "Version $VERSION, build $BUILD"

step "Signing identity"
# The team ID is the certificate's OU, not the ID in the common name.
# Enrolling in the Developer Program creates a NEW team, so the personal-team
# certificate that built the device version has the wrong OU for distribution.
# DEVELOPMENT_TEAM in the environment always wins.
find_team() {
  local cert
  cert=$(security find-identity -v -p codesigning 2>/dev/null | grep -o "$1: [^\"]*" | head -1)
  [ -n "$cert" ] || return 1
  security find-certificate -c "$cert" -p 2>/dev/null | \
    openssl x509 -noout -subject -nameopt sep_multiline 2>/dev/null | \
    sed -n 's/^ *OU=//p' | head -1
}
TEAM="$DEVELOPMENT_TEAM"
if [ -z "$TEAM" ] && [ "$MODE" != device ]; then
  TEAM=$(find_team "Apple Distribution")
  [ -n "$TEAM" ] && echo "Using the Apple Distribution certificate"
fi
[ -z "$TEAM" ] && TEAM=$(find_team "Apple Development")
if [ -z "$TEAM" ]; then
  echo "No signing certificate found yet."
  echo "Open Xcode > Settings > Accounts, add your Apple ID, then in Signing &"
  echo "Capabilities pick your team for BOTH targets. Or set DEVELOPMENT_TEAM=<team id>."
  open "$PROJ"; exit 2
fi
echo "Team: $TEAM"

COMMON_SETTINGS=(
  CODE_SIGN_STYLE=Automatic
  DEVELOPMENT_TEAM="$TEAM"
  MARKETING_VERSION="$VERSION"
  CURRENT_PROJECT_VERSION="$BUILD"
)

if [ "$MODE" = device ]; then
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
    "${COMMON_SETTINGS[@]}" build | grep -E "error|warning: no|BUILD|Signing|Provisioning"
  [ "${PIPESTATUS[0]}" = 0 ] || { echo "BUILD FAILED — see $LOG"; open "$PROJ"; exit 4; }

  APP=$(find "$OUT/DerivedData/Build/Products" -name "Kindgate.app" -path "*iphoneos*" | head -1)
  step "Install $APP"
  xcrun devicectl device install app --device "$DEVICE" "$APP" || exit 5

  echo
  echo "== DONE =="
  echo "On the iPhone: Settings > General > VPN & Device Management > trust your Apple ID (first time only),"
  echo "then open Kindgate: its checklist walks through enabling the extension, allowing the sites,"
  echo "and deleting the apps, and each step turns green by itself once done."
  exit 0
fi

# ---------------------------------------------------------------- distribution

step "App Store Connect credentials"
# Automatic signing cannot mint a distribution certificate or an App Store
# provisioning profile on its own; it needs an API key to talk to App Store
# Connect. The same key uploads the build, so there is no second credential.
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
AUTH=()
if [ -n "$ASC_KEY_ID" ] && [ -n "$ASC_ISSUER_ID" ] && [ -f "$ASC_KEY_PATH" ]; then
  AUTH=(-authenticationKeyPath "$ASC_KEY_PATH"
        -authenticationKeyID "$ASC_KEY_ID"
        -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  echo "Key $ASC_KEY_ID at $ASC_KEY_PATH"
elif [ "$MODE" = upload ]; then
  echo "--upload needs an App Store Connect API key. Set ASC_KEY_ID and ASC_ISSUER_ID"
  echo "(and ASC_KEY_PATH if the .p8 is not at ~/.appstoreconnect/private_keys/)."
  echo "See kindgatex/docs/testflight.md."
  exit 7
else
  echo "No API key set. Archiving with whatever signing assets are already on"
  echo "this Mac; if none exist the archive step will say so."
fi

step "Archive"
ARCHIVE="$OUT/build/Kindgate-$VERSION-$BUILD.xcarchive"
rm -rf "$ARCHIVE"
xcodebuild -project "$PROJ" -scheme Kindgate -configuration Release \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
  -derivedDataPath "$OUT/DerivedData" -allowProvisioningUpdates \
  "${AUTH[@]}" "${COMMON_SETTINGS[@]}" archive | grep -E "error|warning: no|ARCHIVE|Signing|Provisioning"
if [ "${PIPESTATUS[0]}" != 0 ]; then
  echo "ARCHIVE FAILED — see $LOG"
  # Automatic signing reports a missing distribution profile as a missing input
  # file, naming a .mobileprovision it was supposed to have downloaded. That is
  # almost always the credential gap rather than anything wrong with the code.
  if grep -q "Build input file cannot be found.*mobileprovision" "$LOG"; then
    echo
    echo "No App Store provisioning profile could be downloaded for team $TEAM."
    if [ ${#AUTH[@]} -eq 0 ]; then
      echo "Set ASC_KEY_ID and ASC_ISSUER_ID so signing can create one; see kindgatex/docs/testflight.md."
    else
      echo "The key worked but the team has no App Store profile for $BUNDLE."
      echo "Check that $BUNDLE and $BUNDLE.Extension are registered as identifiers,"
      echo "and that DEVELOPMENT_TEAM ($TEAM) is the paid team, not the personal one."
    fi
  fi
  exit 4
fi

step "Export"
EXPORT_DIR="$OUT/build/export-$VERSION-$BUILD"
rm -rf "$EXPORT_DIR"
# manageAppVersionAndBuildNumber must stay off: with it on, Xcode silently
# renumbers the build and the number in the log stops matching the upload.
DEST=export; [ "$MODE" = upload ] && DEST=upload
cat > "$OUT/build/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DEST</string>
  <key>teamID</key><string>$TEAM</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/build/ExportOptions.plist" \
  -exportPath "$EXPORT_DIR" -allowProvisioningUpdates \
  "${AUTH[@]}" | grep -E "error|EXPORT|Uploaded|upload"
[ "${PIPESTATUS[0]}" = 0 ] || { echo "EXPORT FAILED — see $LOG"; exit 8; }

echo
echo "== DONE =="
echo "Version $VERSION, build $BUILD"
if [ "$MODE" = upload ]; then
  echo "Uploaded to App Store Connect. Processing takes a few minutes; the build"
  echo "then needs export compliance answered, and an external tester group has"
  echo "to clear Beta App Review before strangers can install it."
else
  echo "Archive:  $ARCHIVE"
  echo "Exported: $EXPORT_DIR"
  echo "Re-run with --upload to send it to App Store Connect."
fi
