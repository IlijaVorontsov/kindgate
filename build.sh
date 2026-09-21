#!/bin/bash
# Kindgate — convert, build, and install onto the connected iPhone.
# Run:  bash build.sh   (from anywhere; the script finds its own folder)
set -o pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$(dirname "$SRC")/Kindgate-Xcode"
LOG="$SRC/build.log"

BUNDLE="app.kindgate"
# Repo files that are not part of the extension and must not be bundled.
# Keep in sync with CLAUDE.md when adding non-extension files to the root.
STRIP="build.sh build.log README.md CLAUDE.md CHANGELOG.md changelog.d scripts site LICENSE"
RSYNC_EXCLUDES=(); for s in $STRIP; do RSYNC_EXCLUDES+=(--exclude "$s"); done

exec > >(tee "$LOG") 2>&1
echo "== Kindgate build $(date) =="

step() { echo; echo "---- $* ----"; }

step "Xcode"
xcodebuild -version || { echo "Xcode command-line tools not ready. Open Xcode once, accept the license, then re-run."; exit 1; }

step "Convert web extension -> Xcode project"
# The converter references each resource file individually, so a file added
# since the last conversion would never be bundled. Reconvert if any is missing.
PBX="$OUT/Kindgate/Kindgate.xcodeproj/project.pbxproj"
if [ -f "$PBX" ]; then
  for f in "$SRC"/*; do
    b=$(basename "$f")
    case " $STRIP " in *" $b "*) continue;; esac
    case "$b" in .*) continue;; esac
    if ! grep -q "/\* $b \*/" "$PBX"; then
      echo "$b is not in the Xcode project yet -> regenerating project"
      rm -rf "$OUT"; break
    fi
  done
fi
# ...and the reverse: a file the project still references but which no longer
# exists would fail the build with "No such file or directory".
if [ -f "$PBX" ]; then
  for ref in $(grep -o 'path = Resources/[^;]*;' "$PBX" | sed 's/path = Resources\///;s/;$//'); do
    if [ ! -e "$SRC/$ref" ]; then
      echo "$ref is referenced by the Xcode project but was removed -> regenerating project"
      rm -rf "$OUT"; break
    fi
  done
fi
if [ ! -d "$OUT/Kindgate/Kindgate.xcodeproj" ]; then
  rm -rf "$OUT"; mkdir -p "$OUT"
  xcrun safari-web-extension-converter "$SRC" \
    --project-location "$OUT" --app-name Kindgate \
    --bundle-identifier "$BUNDLE" --ios-only --swift --no-open --force --copy-resources || exit 1
else
  echo "Project exists, syncing resources"
  rsync -a --delete --exclude build.sh --exclude build.log --exclude README.md "$SRC/" "$OUT/Kindgate/Kindgate Extension/Resources/"
fi
PROJ="$OUT/Kindgate/Kindgate.xcodeproj"
ls "$PROJ" >/dev/null || { echo "Project not found at $PROJ"; exit 1; }

step "Strip non-extension files from Resources"
# A fresh conversion copies the whole source folder, so build.sh/build.log/README
# end up inside the signed .appex. Drop the files and their project references.
python3 - "$PROJ/project.pbxproj" $STRIP <<'PYEOF'
import re, sys
path = sys.argv[1]
strip = set(sys.argv[2:])
lines = open(path).read().splitlines(True)
ids = set()
for ln in lines:
    m = re.search(r'path = Resources/([^;]+);', ln)
    if m and m.group(1).strip() in strip:
        ids.update(re.findall(r'\b[0-9A-F]{24}\b', ln))
if ids:
    keep = [ln for ln in lines if not any(i in ln for i in ids)]
    open(path, "w").write("".join(keep))
print("stripped %d reference id(s)" % len(ids))
PYEOF
for f in build.sh build.log README.md; do
  rm -f "$OUT/Kindgate/Kindgate Extension/Resources/$f"
done

step "Normalise bundle identifiers"
# The converter names the app target after the app name (dev.vorontsov.Kindgate)
# while the extension keeps the requested id, so the extension is no longer
# prefixed by its parent and signing fails. Force both to $BUNDLE.
sed -i '' \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9._-]*\.Extension;/PRODUCT_BUNDLE_IDENTIFIER = @@EXT@@;/g" \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9][A-Za-z0-9._-]*;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE;/g" \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = @@EXT@@;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE.Extension;/g" \
  "$PROJ/project.pbxproj"
grep -o 'PRODUCT_BUNDLE_IDENTIFIER = [^;]*' "$PROJ/project.pbxproj" | sort -u

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
echo "then Settings > Apps > Safari > Extensions > Kindgate > On, and Allow youtube.com + instagram.com."
