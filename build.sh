#!/bin/bash
# Kindgate — convert the web extension to an Xcode project, then either
# install it on the paired iPhone or build it for TestFlight.
#
#   bash build.sh                 Debug build, install over USB (the default)
#   bash build.sh --release       Release archive, exported as a signed .ipa
#   bash build.sh --upload        ...and upload it to App Store Connect
#   bash build.sh --mac           macOS build, installed to ~/Applications.
#                                 Signed to run locally unless DEVELOPMENT_TEAM
#                                 is set: a team build asks Apple for a profile
#   bash build.sh --mac --release Release archive for macOS, exported as a
#                                 signed .pkg for the Mac App Store. Stops at
#                                 once, before anything is built, if this Mac
#                                 cannot sign for the store.
#   bash build.sh --simulator     iOS Simulator build, unsigned: compiles the
#                                 app and checks what is inside it, installs nothing
#   bash build.sh --stage         only stage the extension folder, for Safari's
#                                 Settings > Developer > Add Temporary Extension
#                                 (no Xcode needed; Safari drops it on quit or
#                                 after 24 h)
#   --no-install                  with --mac: build only, do not copy the app to
#                                 ~/Applications or open it. Never opens Xcode.
#   --adhoc                       with --mac: sign to run locally even when
#                                 DEVELOPMENT_TEAM is set.
#
# KINDGATE_OUT=<folder> puts the staged extension, the Xcode project and the
# build products there instead of ../Kindgate-Xcode (../Kindgate-Xcode-mac for
# --mac), so a trial build cannot touch the folder Safari has loaded.
#
# Needs Xcode 26 or later. Xcode 27.2 writes the project as project.xcproj
# (JSON); this script converts it back to project.pbxproj, see to_pbxproj.
#
# --release and --upload need the paid Apple Developer Program membership and
# an App Store Connect API key. The runbook lives in the private ops repo:
# https://github.com/IlijaVorontsov/kindgatex/blob/main/docs/testflight.md
#
# Layout: the repo root is the web extension. app/ holds the iPhone app's own
# files (Swift, storyboard, entitlements) and app-mac/ the Mac app's. One of
# them is overlaid onto the project the converter generates, so the converter
# stays the source of truth for project.pbxproj and the two folders stay the
# source of truth for the apps. The native message handler and the extension's
# privacy manifest exist once, in app/, and the Mac build takes them from there.
set -o pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$SRC/build.log"

BUNDLE="app.kindgate"
APP_GROUP="group.$BUNDLE"
# Repo entries that are not part of the extension and must not be bundled.
# Keep in sync with CLAUDE.md when adding non-extension files to the root.
# docs/ is ignored by git but listed anyway: an untracked local copy would
# otherwise be rsynced straight into the signed .appex.
STRIP="app app-mac docs site scripts changelog.d build.sh build.log README.md LICENSE CLAUDE.md CHANGELOG.md SECURITY.md CONTRIBUTING.md TRADEMARK.md AUDIT.md"
# Anchored to the repo root ("/name"): a bare name matches at any depth, which
# used to drop lists/LICENSE, the MIT notice that has to ship with the lists.
STAGE_EXCLUDES=(--exclude '.*'); for s in $STRIP; do STAGE_EXCLUDES+=(--exclude "/$s"); done

MODE=device
INSTALL=1
MAC=0
FORCE_ADHOC=0
for arg in "$@"; do
  case "$arg" in
    --release) MODE=release;;
    --upload)  MODE=upload;;
    --mac)     MAC=1;;
    --stage)   MODE=stage;;
    --simulator) MODE=simulator;;
    --no-install) INSTALL=0;;
    --adhoc)   FORCE_ADHOC=1;;
    -h|--help) sed -n '2,36p' "$0"; exit 0;;
    *) echo "Unknown option: $arg (try --help)"; exit 1;;
  esac
done

# --mac alone is the Debug build for this Mac; with --release it is the Mac
# App Store archive. IS_MAC is true for both.
IS_MAC=0
if [ "$MAC" = 1 ]; then
  IS_MAC=1
  case "$MODE" in
    device)  MODE=mac;;
    release) MODE=macrelease;;
    *) echo "--mac goes alone or with --release. --mac with --$MODE is not written."; exit 1;;
  esac
fi
[ "$FORCE_ADHOC" = 1 ] && [ "$MODE" != mac ] && { echo "--adhoc only goes with --mac (the Debug build for this Mac)."; exit 1; }

# The Mac build is a separate macOS-only project next to the iOS one: the
# converter lays a universal project out differently, which app/ is not
# shaped for. Same bundle id, so the two can later become a universal purchase.
OUT="$(dirname "$SRC")/Kindgate-Xcode"
[ "$IS_MAC" = 1 ] && OUT="$(dirname "$SRC")/Kindgate-Xcode-mac"
[ -n "$KINDGATE_OUT" ] && OUT="$KINDGATE_OUT"
STAGE="$OUT/stage"                 # the extension alone, what the converter sees
PROJDIR="$OUT/Kindgate"
PROJ="$PROJDIR/Kindgate.xcodeproj"
PBX="$PROJ/project.pbxproj"
XCPROJ="$PROJ/project.xcproj"      # what Xcode 27.2 and later generate instead

# Oldest systems the build runs on. The converter writes the SDK's own version
# for the app (27.0 with Xcode 27), so a build would refuse to install on
# anything older than this year's release, and 12.0 / 15.0 for the extension.
# The floor here is the current release and the two before it (macOS 27, 26,
# 15; iOS 27, 26, 18): the systems Apple still updates, which is also where
# Safari itself is still updated. Nothing older has been tried.
MAC_MIN="${KINDGATE_MAC_MIN:-15.0}"
IOS_MIN="${KINDGATE_IOS_MIN:-18.0}"

# Opens the project in Xcode for a fix by hand, unless told to stay quiet.
open_project() { [ "$INSTALL" = 1 ] && open "$PROJ"; return 0; }

exec > >(tee "$LOG") 2>&1
echo "== Kindgate build ($MODE) $(date) =="

step() { echo; echo "---- $* ----"; }

if [ "$MODE" != stage ]; then
  step "Xcode"
  xcodebuild -version || { echo "Xcode not ready. Install Xcode, run 'sudo xcode-select -s /Applications/Xcode.app', open it once, then re-run."; exit 1; }
fi

if [ "$MODE" = macrelease ]; then
  step "Mac App Store signing"
  # Checked first, so the run stops here and not in the middle of an archive.
  # A Mac App Store upload is an installer package: the app is signed with an
  # Apple Distribution or Mac App Distribution certificate and the .pkg with a
  # Mac Installer Distribution one (in the keychain the older two are named
  # "3rd Party Mac Developer Application" and "... Installer").
  # Xcode can make both itself when it has an App Store Connect API key.
  # https://developer.apple.com/help/account/reference/certificate-types
  MAS_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  MAS_KEY=0
  [ -n "$ASC_KEY_ID" ] && [ -n "$ASC_ISSUER_ID" ] && [ -f "$MAS_KEY_PATH" ] && MAS_KEY=1
  MAS_APP=$(security find-identity -v -p codesigning 2>/dev/null | grep -c -E '"(Apple Distribution|3rd Party Mac Developer Application): ')
  MAS_PKG=$(security find-identity -v 2>/dev/null | grep -c -E '"(3rd Party Mac Developer Installer|Mac Installer Distribution): ')
  echo "App Store Connect API key: $([ "$MAS_KEY" = 1 ] && echo "$ASC_KEY_ID" || echo none)"
  echo "Distribution certificates in the keychain: app $MAS_APP, installer $MAS_PKG"
  if [ "$MAS_KEY" = 0 ] && { [ "$MAS_APP" = 0 ] || [ "$MAS_PKG" = 0 ]; }; then
    echo
    echo "Cannot build for the Mac App Store on this Mac: nothing to sign with. Nothing was built."
    echo "It needs the paid Apple Developer Program team and one of:"
    echo "  - an App Store Connect API key: set ASC_KEY_ID and ASC_ISSUER_ID (and ASC_KEY_PATH if"
    echo "    the .p8 is not in ~/.appstoreconnect/private_keys/), plus DEVELOPMENT_TEAM=<team id>."
    echo "    Xcode then creates the certificates and profiles itself; or"
    echo "  - both certificates in the keychain: Apple Distribution (or Mac App Distribution) and"
    echo "    Mac Installer Distribution"
    echo "    (Xcode > Settings > Accounts > Manage Certificates)."
    echo "For a build that runs on this Mac without any of that: bash build.sh --mac"
    exit 2
  fi
  if [ "$MAS_APP" = 0 ] && [ -z "$DEVELOPMENT_TEAM" ]; then
    echo
    echo "An API key is set but no certificate names the team. Set DEVELOPMENT_TEAM=<team id>"
    echo "(the paid team, not the personal one) and re-run. Nothing was built."
    exit 2
  fi
  INSTALL=0      # a release run never opens Xcode or the app
fi

step "Stage the extension"
# Only the extension goes to the converter. Staging is what keeps app/, the
# website, the build script and the docs out of the signed .appex; a plain
# conversion copies the whole folder and would bundle all of it.
mkdir -p "$STAGE"
rsync -a --delete "${STAGE_EXCLUDES[@]}" "$SRC/" "$STAGE/" || exit 1
ls "$STAGE"

if [ "$MODE" = stage ]; then
  echo
  echo "== STAGED =="
  echo "$STAGE"
  echo "Safari > Settings > Advanced: show features for web developers."
  echo "Safari > Settings > Developer: Allow unsigned extensions, then Add Temporary Extension... and pick the folder above."
  echo "After editing a file, re-run --stage and press Reload next to Kindgate in that list."
  exit 0
fi

# Xcode 27.2 made a JSON file, project.xcproj, the default project format, and
# its converter writes that instead of project.pbxproj. Every project edit in
# this script is written for project.pbxproj, which Xcode 26 still generates
# and Xcode 27 still reads and builds, so the project is converted back with
# Xcode's own tool and one set of edits serves both.
# https://developer.apple.com/documentation/xcode/updating-your-xcode-project-configuration-file-format
to_pbxproj() {
  [ -f "$XCPROJ" ] || { [ -f "$PBX" ] || { echo "No project.pbxproj in $PROJ"; return 1; }; return 0; }
  xcodebuild -project "$PROJ" -convert-project pbxproj >/dev/null 2>&1 && [ -f "$PBX" ] || {
    echo "Could not convert $XCPROJ to project.pbxproj."
    echo "This script edits project.pbxproj; 'xcodebuild -convert-project pbxproj' comes with Xcode 27.2."
    return 1; }
  echo "converted project.xcproj -> project.pbxproj"
}

step "Convert web extension -> Xcode project"
[ -d "$PROJ" ] && { to_pbxproj || exit 1; }
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
  # Xcode 26 renamed the converter to safari-web-extension-packager.
  CONVERTER=safari-web-extension-packager
  xcrun --find "$CONVERTER" >/dev/null 2>&1 || CONVERTER=safari-web-extension-converter
  PLATFORM_FLAG=--ios-only; [ "$IS_MAC" = 1 ] && PLATFORM_FLAG=--macos-only
  xcrun "$CONVERTER" "$STAGE" \
    --project-location "$OUT" --app-name Kindgate \
    --bundle-identifier "$BUNDLE" "$PLATFORM_FLAG" --swift --no-open --force --copy-resources || exit 1
else
  echo "Project exists, syncing resources"
  rsync -a --delete "$STAGE/" "$PROJDIR/Kindgate Extension/Resources/"
fi
ls "$PROJ" >/dev/null || { echo "Project not found at $PROJ"; exit 1; }

to_pbxproj || exit 1
[ -f "$XCPROJ" ] && { echo "Both project.xcproj and project.pbxproj are in $PROJ; delete $PROJDIR and re-run."; exit 1; }
echo "project.pbxproj, $(sed -n 's/^[[:space:]]*objectVersion = \([0-9]*\);/object version \1/p' "$PBX")"

# The iPhone app in app/ is UIKit, the Mac app in app-mac/ is AppKit and
# SwiftUI; each build takes its own folder.
APPSRC="$SRC/app"; [ "$IS_MAC" = 1 ] && APPSRC="$SRC/app-mac"
step "Overlay $(basename "$APPSRC")/ onto the generated project"
# Replaces the converter's ViewController.swift, Main.storyboard (and, on the
# Mac, AppDelegate.swift) and SafariWebExtensionHandler.swift, and adds the two
# entitlements files and the two privacy manifests.
rsync -a "$APPSRC/" "$PROJDIR/" || exit 1
find "$APPSRC" -type f | sed "s|$APPSRC/|  |"
if [ "$IS_MAC" = 1 ]; then
  # One handler and one extension privacy manifest for both platforms: the
  # message format is the same, and one file is easier to read than two.
  for f in SafariWebExtensionHandler.swift PrivacyInfo.xcprivacy; do
    cp "$SRC/app/Kindgate Extension/$f" "$PROJDIR/Kindgate Extension/$f" || exit 1
    echo "  Kindgate Extension/$f (from app/)"
  done
  grep -q 'os_log(.default, "Received message' "$PROJDIR/Kindgate Extension/SafariWebExtensionHandler.swift" && {
    echo "The extension still has the converter's handler, which logs every message."; exit 1; }
fi

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
for t in "Kindgate/Kindgate" "Kindgate Extension/Kindgate Extension"; do
  grep -q "$APP_GROUP" "$PROJDIR/$t.entitlements" || { echo "$t.entitlements is missing $APP_GROUP"; exit 1; }
done

step "Privacy manifests"
# App Store Connect refuses an iOS upload whose code uses a required-reason API
# (here UserDefaults on the App Group) without a PrivacyInfo.xcprivacy in the
# bundle that holds that code, so the app and the extension each carry one:
# https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
# The overlay only puts the files on disk. Unlike the entitlements they are
# resources, so each has to be in its target's Copy Bundle Resources phase.
# The project is read as JSON to find the phase and to check the result; the
# edit itself is text, so Xcode's own file format is kept.
python3 - "$PBX" <<'PYEOF' || exit 1
import hashlib, json, re, subprocess, sys
pbx = sys.argv[1]
NAME = "PrivacyInfo.xcprivacy"
TARGETS = ["Kindgate", "Kindgate Extension"]     # target name = its folder in app/

def objects():
    out = subprocess.check_output(["plutil", "-convert", "json", "-o", "-", pbx])
    return json.loads(out)["objects"]

def state(objs, target):
    """'bundled', or the id of the target's resources phase, or None."""
    t = next((o for o in objs.values()
              if o.get("isa") == "PBXNativeTarget" and o.get("name") == target), None)
    if t is None:
        return None
    # A synchronized folder builds whatever is inside it, no reference needed.
    for gid in t.get("fileSystemSynchronizedGroups", []):
        if objs.get(gid, {}).get("path") == target:
            return "bundled"
    for pid in t.get("buildPhases", []):
        phase = objs.get(pid, {})
        if phase.get("isa") != "PBXResourcesBuildPhase":
            continue
        for bid in phase.get("files", []):
            ref = objs.get(objs.get(bid, {}).get("fileRef"), {})
            if (ref.get("path") or "").endswith(NAME):
                return "bundled"
        return pid
    return None

def insert_after(src, start, marker, line):
    """Adds line after the first marker found at or after start."""
    at = src.find(marker, start)
    if at < 0:
        sys.exit("project.pbxproj: no '%s' where one was expected" % marker.strip())
    at += len(marker)
    return src[:at] + line + src[at:]

def definition(src, oid):
    m = re.search(r"^\t\t%s (?:/\* .*? \*/ )?= \{" % oid, src, re.M)
    if not m:
        sys.exit("project.pbxproj: object %s not found" % oid)
    return m.start()

objs = objects()
src = open(pbx).read()
changed = False
for target in TARGETS:
    st = state(objs, target)
    if st is None:
        sys.exit("No resources phase found for target '%s'; add %s to it in Xcode." % (target, NAME))
    if st == "bundled":
        print("%s: already in the target" % target)
        continue
    digest = hashlib.md5(("kindgate privacy manifest " + target).encode()).hexdigest().upper()
    ref_id, build_id = digest[:24], digest[8:32]
    # Path from the project root, so it is right whichever group shows it.
    group = next((k for k, o in objs.items()
                  if o.get("isa") == "PBXGroup" and o.get("path") == target), None)
    if group is None:
        root = next(o for o in objs.values() if o.get("isa") == "PBXProject")
        group = root["mainGroup"]
    src = insert_after(src, 0, "/* Begin PBXBuildFile section */\n",
        "\t\t%s /* %s in Resources */ = {isa = PBXBuildFile; fileRef = %s /* %s */; };\n"
        % (build_id, NAME, ref_id, NAME))
    src = insert_after(src, 0, "/* Begin PBXFileReference section */\n",
        "\t\t%s /* %s */ = {isa = PBXFileReference; lastKnownFileType = text.xml; "
        "name = %s; path = \"%s/%s\"; sourceTree = SOURCE_ROOT; };\n"
        % (ref_id, NAME, NAME, target, NAME))
    src = insert_after(src, definition(src, group), "children = (\n",
        "\t\t\t\t%s /* %s */,\n" % (ref_id, NAME))
    src = insert_after(src, definition(src, st), "files = (\n",
        "\t\t\t\t%s /* %s in Resources */,\n" % (build_id, NAME))
    changed = True
    print("%s: added to Copy Bundle Resources" % target)

if changed:
    open(pbx, "w").write(src)
    objs = objects()          # also proves the file still parses
    for target in TARGETS:
        if state(objs, target) != "bundled":
            sys.exit("%s: %s is still not in the target after the edit" % (target, NAME))
PYEOF
for t in "Kindgate" "Kindgate Extension"; do
  plutil -lint "$PROJDIR/$t/PrivacyInfo.xcprivacy" || exit 1
done

if [ "$IS_MAC" = 0 ]; then
step "App Info.plist: URL schemes the checklist may query"
# canOpenURL(youtube://) / canOpenURL(instagram://) tells the app whether the
# native apps are still installed; iOS only answers for schemes listed here.
plutil -replace LSApplicationQueriesSchemes -json '["youtube","instagram"]' "$PROJDIR/Kindgate/Info.plist" || exit 1
plutil -extract LSApplicationQueriesSchemes json -o - "$PROJDIR/Kindgate/Info.plist"
fi

step "App Info.plist: export compliance"
# Declares that Kindgate uses no encryption that needs export documentation,
# so App Store Connect stops asking on every upload and TestFlight builds are
# not held back waiting for the answer. True as long as this holds: no
# cryptography of its own and none linked in; the app and the extension make
# no network connections; the one use of cryptography is the pause PIN, hashed
# with PBKDF2 by Safari's own WebCrypto (popup.js), which is the system's.
# Review this line before adding any encryption or a networking library.
# https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PROJDIR/Kindgate/Info.plist" || exit 1
plutil -extract ITSAppUsesNonExemptEncryption raw -o - "$PROJDIR/Kindgate/Info.plist"

if [ "$IS_MAC" = 1 ]; then
step "Mac app: sandbox, category, no placeholder files"
# The Mac App Store takes sandboxed apps only, and every Mac app needs a
# category: https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox
# https://developer.apple.com/documentation/bundleresources/information-property-list/lsapplicationcategorytype
plutil -replace LSApplicationCategoryType -string public.app-category.productivity "$PROJDIR/Kindgate/Info.plist" || exit 1
plutil -extract LSApplicationCategoryType raw -o - "$PROJDIR/Kindgate/Info.plist"
# The converter grants its own app outgoing network connections and read access
# to files the user picks, as build settings that Xcode turns into entitlements.
# Kindgate's app uses neither, so the two settings go and the entitlements
# files in app-mac/ are the whole list. The sandbox itself and the hardened
# runtime stay on.
sed -i '' -e '/ENABLE_OUTGOING_NETWORK_CONNECTIONS = /d' -e '/ENABLE_USER_SELECTED_FILES = /d' "$PBX"
for want in "ENABLE_APP_SANDBOX = YES" "ENABLE_HARDENED_RUNTIME = YES"; do
  [ "$(grep -c "$want;" "$PBX")" = 4 ] || { echo "Expected '$want' in all four target configurations of $PBX."; exit 1; }
done
echo "App Sandbox and hardened runtime: on, both targets; no network or file entitlements"
sed -i '' 's/INFOPLIST_KEY_NSHumanReadableCopyright = "";/INFOPLIST_KEY_NSHumanReadableCopyright = "Open source under the Mozilla Public License 2.0.";/' "$PBX"
fi
# The converter's app is a web view around Main.html, Script.js, Style.css and
# Icon.png. app/ and app-mac/ replace the code that loaded them; this takes the
# four files out of the project and off the disk on both platforms, so the app
# holds nothing that is not in the repo and no placeholder reaches App Review.
python3 - "$PBX" <<'PYEOF' || exit 1
import json, re, subprocess, sys
pbx = sys.argv[1]
src = open(pbx).read()
NAMES = r"(?:Main\.html|Script\.js|Style\.css|Icon\.png)"
# One-line objects and list entries that name one of the four files.
out = re.sub(r"^[^\n]*/\* %s(?: in Resources)? \*/(?:,| = \{[^\n]*\};)\n" % NAMES, "", src, flags=re.M)
out = re.sub(r"^[^\n]*path = Base\.lproj/Main\.html;[^\n]*\n", "", out, flags=re.M)
# The Main.html variant group is a block of its own.
out = re.sub(r"^\t\t[0-9A-F]{24} /\* Main\.html \*/ = \{\n.*?^\t\t\};\n", "", out, flags=re.M | re.S)
out = re.sub(r"^\t*[0-9A-F]{24} /\* Base \*/,\n(?=\t*\);\n\t*name = Main\.html;)", "", out, flags=re.M)
if out == src:
    print("placeholder files: already out of the project")
else:
    open(pbx, "w").write(out)
    print("placeholder files: removed from the project")
objs = json.loads(subprocess.check_output(["plutil", "-convert", "json", "-o", "-", pbx]))["objects"]
left = [o.get("path") or o.get("name") for o in objs.values()
        if re.fullmatch(NAMES, str(o.get("path") or o.get("name") or "").split("/")[-1])]
if left:
    sys.exit("project.pbxproj still names %s" % ", ".join(sorted(set(left))))
ids = set(objs)
for oid, o in objs.items():
    for key in ("children", "files", "buildPhases"):
        for ref in o.get(key, []):
            if ref not in ids:
                sys.exit("project.pbxproj: %s refers to a removed object %s" % (oid, ref))
    if o.get("isa") == "PBXBuildFile" and o.get("fileRef") not in ids:
        sys.exit("project.pbxproj: build file %s has no file" % oid)
PYEOF
rm -rf "$PROJDIR/Kindgate/Resources" "$PROJDIR/Kindgate/Assets.xcassets/LargeIcon.imageset"

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
[ "$(grep -o 'PRODUCT_BUNDLE_IDENTIFIER = [^;]*' "$PBX" | sort -u | wc -l | tr -d ' ')" = 2 ] || {
  echo "Expected exactly two bundle identifiers ($BUNDLE and $BUNDLE.Extension) in $PBX."; exit 1; }

step "Deployment targets"
# One floor for the app and the extension; see MAC_MIN and IOS_MIN at the top.
sed -i '' \
  -e "s/MACOSX_DEPLOYMENT_TARGET = [0-9.]*;/MACOSX_DEPLOYMENT_TARGET = $MAC_MIN;/g" \
  -e "s/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*;/IPHONEOS_DEPLOYMENT_TARGET = $IOS_MIN;/g" \
  "$PBX"
grep -o '[A-Z]*_DEPLOYMENT_TARGET = [^;]*' "$PBX" | sort | uniq -c

step "App icon"
# The converter ships a placeholder: on iOS Apple's own, which is transparent
# and would be rejected on upload; on the Mac the extension's toolbar icon
# scaled up. Replace it every build so it can never go stale.
if [ "$IS_MAC" = 1 ]; then
  bash "$SRC/scripts/mac-icon.sh" "$PROJDIR/Kindgate/Assets.xcassets/AppIcon.appiconset" || exit 6
else
  bash "$SRC/scripts/app-icon.sh" "$PROJDIR/Kindgate/Assets.xcassets/AppIcon.appiconset" || exit 6
fi

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
[ "$MODE" = simulator ] && TEAM=none      # a simulator build is not signed
[ "$FORCE_ADHOC" = 1 ] && TEAM=           # --adhoc: as if there were no team
if [ -z "$TEAM" ] && [ "$MODE" != device ] && [ "$MODE" != mac ]; then
  TEAM=$(find_team "Apple Distribution")
  [ -z "$TEAM" ] && [ "$IS_MAC" = 1 ] && TEAM=$(find_team "3rd Party Mac Developer Application")
  [ -n "$TEAM" ] && echo "Using the Apple Distribution certificate"
fi
# The Mac Debug build does not go looking for a certificate. With the App
# Group, a team-signed Mac build needs a provisioning profile, which Xcode
# fetches or creates on the developer account; that should happen because
# DEVELOPMENT_TEAM was set, not because a certificate happens to be in the
# keychain.
[ -z "$TEAM" ] && [ "$MODE" != mac ] && TEAM=$(find_team "Apple Development")
ADHOC=0
if [ -z "$TEAM" ] && [ "$MODE" = mac ]; then
  # Sign ad hoc, Xcode's "Sign to Run Locally". The build runs on this Mac
  # only, and Safari treats its extension as unsigned (see the closing text).
  ADHOC=1; TEAM=none
  echo "Signing to run locally (ad hoc). For a team-signed build set DEVELOPMENT_TEAM=<team id>."
fi
if [ -z "$TEAM" ]; then
  echo "No signing certificate found yet."
  echo "Open Xcode > Settings > Accounts, add your Apple ID, then in Signing &"
  echo "Capabilities pick your team for BOTH targets. Or set DEVELOPMENT_TEAM=<team id>."
  open_project; exit 2
fi
echo "Team: $TEAM"

COMMON_SETTINGS=(
  CODE_SIGN_STYLE=Automatic
  DEVELOPMENT_TEAM="$TEAM"
  MARKETING_VERSION="$VERSION"
  CURRENT_PROJECT_VERSION="$BUILD"
)
# With a team, let Xcode register the App Group for the Mac targets as well:
# group. ids on macOS are authorised by the provisioning profile, and this
# setting is what makes automatic signing put them there. The converter sets it
# on the app target only. https://developer.apple.com/forums/thread/721701
[ "$IS_MAC" = 1 ] && COMMON_SETTINGS+=(REGISTER_APP_GROUPS=YES)
PROVISIONING=(-allowProvisioningUpdates)
if [ "$ADHOC" = 1 ]; then
  COMMON_SETTINGS=(
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=
    MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD"
  )
  PROVISIONING=()
  if grep -q "$APP_GROUP" "$PROJDIR/Kindgate/Kindgate.entitlements"; then
    # Xcode refuses to sign an App Group whose id starts with "group." without
    # a provisioning profile ("requires a provisioning profile"), and a local
    # signature has none. So this build is signed with the sandbox alone, for
    # both targets. The app notices and says that its three "allowed" rows
    # cannot be shown; everything inside Safari works as usual.
    cat > "$OUT/local.entitlements" <<'ENT'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
</dict>
</plist>
ENT
    COMMON_SETTINGS+=(CODE_SIGN_ENTITLEMENTS="$OUT/local.entitlements")
    echo "Local signature: sandbox only, no App Group."
  fi
fi

# What has to be inside the built bundles. Checked on the product, because a
# file can be in the project and still not be copied. $1 is Kindgate.app.
check_bundle() {
  local app="$1" res="$1" plug="$1/PlugIns" info="$1/Info.plist"
  # A Mac bundle keeps everything one level down, in Contents.
  [ -d "$app/Contents" ] && { res="$app/Contents/Resources"; plug="$app/Contents/PlugIns"; info="$app/Contents/Info.plist"; }
  [ -f "$res/PrivacyInfo.xcprivacy" ] || { echo "No privacy manifest in the app bundle — see the Privacy manifests step."; return 1; }
  [ -n "$(find "$plug" -name PrivacyInfo.xcprivacy -path '*.appex/*' 2>/dev/null)" ] || { echo "No privacy manifest in the extension bundle — see the Privacy manifests step."; return 1; }
  echo "Privacy manifest: app and extension"
  [ "$(plutil -extract ITSAppUsesNonExemptEncryption raw -o - "$info" 2>/dev/null)" = false ] || { echo "ITSAppUsesNonExemptEncryption is not false in the built Info.plist — see the export compliance step."; return 1; }
  echo "Export compliance: declared, no non-exempt encryption"
  # The fonts (OFL) and the lists (MIT) may only be shipped with their licence
  # texts, and the popup's "Open source licences" reads these two files.
  local f
  for f in fonts/OFL.txt lists/LICENSE; do
    [ -n "$(find "$plug" -path "*.appex/*$f" 2>/dev/null)" ] || { echo "$f is not in the extension bundle."; return 1; }
  done
  echo "Licence texts: fonts/OFL.txt, lists/LICENSE"
  for f in Main.html Script.js Style.css Icon.png; do
    [ -z "$(find "$res" -name "$f" -not -path '*/PlugIns/*' 2>/dev/null)" ] || { echo "The converter's placeholder $f is still in the app bundle."; return 1; }
  done
  echo "Placeholder files: none"
}

# The Mac-only part: what the store and the "anyone can check" claim rest on.
# $1 is Kindgate.app as built or archived.
check_mac_bundle() {
  local app="$1" appex res="$1/Contents/Resources" info="$1/Contents/Info.plist"
  appex=$(find "$app/Contents/PlugIns" -maxdepth 1 -name '*.appex' | head -1)
  [ -n "$appex" ] || { echo "No extension in $app/Contents/PlugIns."; return 1; }
  [ "$(plutil -extract LSApplicationCategoryType raw -o - "$info" 2>/dev/null)" = public.app-category.productivity ] || { echo "LSApplicationCategoryType is not set in the built Info.plist."; return 1; }
  echo "Category: public.app-category.productivity"
  local icon; icon=$(plutil -extract CFBundleIconFile raw -o - "$info" 2>/dev/null)
  [ -n "$icon" ] && [ -f "$res/${icon%.icns}.icns" ] || { echo "No app icon (.icns) in the app bundle — see the App icon step."; return 1; }
  echo "App icon: ${icon%.icns}.icns, $(sips -g pixelWidth "$res/${icon%.icns}.icns" 2>/dev/null | sed -n 's/.*pixelWidth: //p') px"
  local f
  for f in Main.html Script.js Style.css Icon.png; do
    [ -z "$(find "$res" -name "$f" 2>/dev/null)" ] || { echo "The converter's placeholder $f is still in the app bundle."; return 1; }
  done
  echo "Placeholder files: none"
  # Entitlements as signed, not as written: exactly the sandbox and the App
  # Group, plus get-task-allow in a Debug build.
  local b
  for b in "$app" "$appex"; do
    codesign -d --entitlements - --xml "$b" 2>/dev/null | python3 -c '
import plistlib, sys
name, group = sys.argv[1], sys.argv[2]
data = sys.stdin.buffer.read()
ent = plistlib.loads(data) if data.strip() else {}
problems = []
if ent.get("com.apple.security.app-sandbox") is not True:
    problems.append("App Sandbox is off")
groups = ent.get("com.apple.security.application-groups", [])
if group and group not in groups:
    problems.append("App Group %s is missing" % group)
if not group and groups:
    problems.append("a local signature should carry no App Group")
allowed = {"com.apple.security.app-sandbox", "com.apple.security.application-groups",
           "com.apple.security.get-task-allow", "com.apple.application-identifier",
           "com.apple.developer.team-identifier"}
extra = sorted(set(ent) - allowed)
if extra:
    problems.append("unexpected entitlements: " + ", ".join(extra))
if problems:
    sys.exit("%s: %s" % (name, "; ".join(problems)))
print("Entitlements, %s: %s" % (name, ", ".join(sorted(ent))))
' "$(basename "$b")" "$([ "$ADHOC" = 1 ] || echo "$APP_GROUP")" || return 1
    codesign -d --verbose=2 "$b" 2>&1 | grep -q 'flags=.*runtime' \
      && echo "Hardened runtime, $(basename "$b"): on" \
      || echo "Hardened runtime, $(basename "$b"): not in this signature (ad-hoc Debug builds leave it out; a Release archive must have it)"
  done
  # The extension's files against the source, the check a user can repeat on
  # an installed copy with scripts/verify-install.sh.
  python3 "$SRC/scripts/hashes.py" > "$OUT/SHA256SUMS" || return 1
  bash "$SRC/scripts/verify-install.sh" "$app" --sums "$OUT/SHA256SUMS" | tail -3 || return 1
}

if [ "$MODE" = simulator ]; then
  step "Build for the iOS Simulator"
  # Compiles both targets against the iOS SDK without a device, a certificate
  # or an Apple ID. Nothing is installed.
  xcodebuild -project "$PROJ" -scheme Kindgate -configuration Debug \
    -destination "generic/platform=iOS Simulator" -derivedDataPath "$OUT/DerivedData" \
    CODE_SIGNING_ALLOWED=NO MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
    build | grep -E "error:|warning: no|BUILD"
  [ "${PIPESTATUS[0]}" = 0 ] || { echo "BUILD FAILED — see $LOG"; exit 4; }
  APP=$(find "$OUT/DerivedData/Build/Products" -name "Kindgate.app" -path "*iphonesimulator*" | head -1)
  [ -n "$APP" ] || { echo "Kindgate.app not found under $OUT/DerivedData"; exit 5; }
  step "Check the built app"
  check_bundle "$APP" || exit 9
  echo
  echo "== DONE =="
  echo "$APP"
  echo "Unsigned simulator build. To try it: boot a simulator, then"
  echo "xcrun simctl install booted \"$APP\""
  exit 0
fi

if [ "$MODE" = mac ]; then
  # Registering this Mac with the team changes the developer account, so it
  # is asked for by name: KINDGATE_REGISTER_DEVICE=1, once per Mac.
  [ "$KINDGATE_REGISTER_DEVICE" = 1 ] && [ "$ADHOC" = 0 ] && PROVISIONING+=(-allowProvisioningDeviceRegistration)
  step "Build for this Mac"
  xcodebuild -project "$PROJ" -scheme Kindgate -configuration Debug \
    -destination "platform=macOS" -derivedDataPath "$OUT/DerivedData" \
    "${PROVISIONING[@]}" "${COMMON_SETTINGS[@]}" build | grep -E "error:|warning: no|BUILD|Signing|Provisioning"
  if [ "${PIPESTATUS[0]}" != 0 ]; then
    echo "BUILD FAILED — see $LOG"
    if [ "$ADHOC" = 0 ] && grep -q -E "isn't registered in your developer account|No profiles for" "$LOG"; then
      # The App Group makes a team-signed Mac build need a provisioning profile,
      # and a development profile lists the Macs it may run on.
      echo
      echo "Signing with team $TEAM needs a Mac development profile for $BUNDLE, and this Mac"
      echo "is not registered with the team. Either build without the team: bash build.sh --mac --adhoc"
      echo "or register this Mac once: open the project in Xcode, select each target, Signing &"
      echo "Capabilities, and let Xcode register the device; then re-run."
    fi
    open_project; exit 4
  fi

  APP=$(find "$OUT/DerivedData/Build/Products/Debug" -maxdepth 1 -name "Kindgate.app" | head -1)
  [ -n "$APP" ] || { echo "Kindgate.app not found under $OUT/DerivedData"; exit 5; }
  step "Check the built app"
  check_bundle "$APP" && check_mac_bundle "$APP" || exit 9
  # Xcode registers every Mac app it builds with Launch Services, extension
  # included, so each build folder used to add one more "Kindgate" to Safari's
  # Extensions list. Only the installed copy may stay registered.
  LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
  forget_copy() {   # $1 is a Kindgate.app that must not be known to Safari
    local ex; ex=$(find "$1/Contents/PlugIns" -maxdepth 1 -name "*.appex" 2>/dev/null | head -1)
    [ -n "$ex" ] && pluginkit -r "$ex" 2>/dev/null
    "$LSREG" -u "$1" >/dev/null 2>&1
  }
  if [ "$INSTALL" = 1 ]; then
    step "Install to ~/Applications"
    mkdir -p "$HOME/Applications"
    osascript -e 'tell application id "app.kindgate" to quit' >/dev/null 2>&1
    rm -rf "$HOME/Applications/Kindgate.app"
    cp -R "$APP" "$HOME/Applications/" || exit 5
    forget_copy "$APP"; rm -rf "$APP"      # one copy on disk, the installed one
    "$LSREG" -f "$HOME/Applications/Kindgate.app" >/dev/null 2>&1
    # Opening the app once registers its extension with Safari.
    open "$HOME/Applications/Kindgate.app"
  else
    forget_copy "$APP"
  fi
  step "Kindgate extensions known to Safari"
  COPIES=$(pluginkit -m -A -D -v -p com.apple.Safari.web-extension 2>/dev/null | grep -c "app.kindgate.Extension")
  pluginkit -m -A -D -v -p com.apple.Safari.web-extension 2>/dev/null | grep "app.kindgate.Extension" | sed 's/^ *//'
  [ "$COPIES" -le 1 ] || echo "WARNING: $COPIES copies are registered; Safari will list each. Remove the others with: pluginkit -r <path to the .appex>"

  echo
  echo "== DONE =="
  [ "$INSTALL" = 1 ] || { echo "Built, not installed and not registered: $APP"; echo "Opening that app registers its extension with Safari."; }
  if [ "$ADHOC" = 1 ]; then
    echo "This build is signed to run locally, without a certificate. Safari ignores such an"
    echo "extension until you allow unsigned extensions:"
    echo "  Safari > Settings > Advanced: Show features for web developers."
    echo "  Safari > Settings > Developer: Allow unsigned extensions (asks for your password)."
    echo "That setting resets every time Safari quits; the extension is then hidden again until"
    echo "you tick the box once more. Then Safari > Settings > Extensions: tick Kindgate and"
    echo "allow it on every website (or at least youtube.com and instagram.com)."
    echo "To avoid the toggle, add your Apple ID in Xcode > Settings > Accounts and re-run with"
    echo "DEVELOPMENT_TEAM=<team id>: the build is then signed with your development certificate."
    echo "That needs this Mac registered with the team (Xcode offers it under Signing & Capabilities)."
  else
    echo "Safari > Settings > Extensions: tick Kindgate, then allow it on every website"
    echo "(or at least youtube.com and instagram.com). A signed build stays installed across"
    echo "Safari restarts; no unsigned-extensions toggle needed."
  fi
  exit 0
fi

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
    "${COMMON_SETTINGS[@]}" build | grep -E "error:|warning: no|BUILD|Signing|Provisioning"
  [ "${PIPESTATUS[0]}" = 0 ] || { echo "BUILD FAILED — see $LOG"; open_project; exit 4; }

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
ARCHIVE_FOR="generic/platform=iOS"; [ "$IS_MAC" = 1 ] && ARCHIVE_FOR="generic/platform=macOS"
xcodebuild -project "$PROJ" -scheme Kindgate -configuration Release \
  -destination "$ARCHIVE_FOR" -archivePath "$ARCHIVE" \
  -derivedDataPath "$OUT/DerivedData" -allowProvisioningUpdates \
  "${AUTH[@]}" "${COMMON_SETTINGS[@]}" archive | grep -E "error:|warning: no|ARCHIVE|Signing|Provisioning"
if [ "${PIPESTATUS[0]}" != 0 ]; then
  echo "ARCHIVE FAILED — see $LOG"
  # Automatic signing reports a missing distribution profile as a missing input
  # file, naming a .mobileprovision it was supposed to have downloaded. That is
  # almost always the credential gap rather than anything wrong with the code.
  if grep -q -E "Build input file cannot be found.*(mobileprovision|provisionprofile)" "$LOG"; then
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

step "Check the archive"
# What has to be inside the bundles for App Store Connect to accept the upload.
ARCHIVED_APP="$ARCHIVE/Products/Applications/Kindgate.app"
check_bundle "$ARCHIVED_APP" || exit 9
if [ "$IS_MAC" = 1 ]; then
  check_mac_bundle "$ARCHIVED_APP" || exit 9
  codesign -d --verbose=2 "$ARCHIVED_APP" 2>&1 | grep -q 'flags=.*runtime' || { echo "The archived app is signed without the hardened runtime."; exit 9; }
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
# Xcode packs the .ipa with /usr/bin/rsync (Apple's openrsync), which starts
# its other end by looking "rsync" up in PATH. With Homebrew's rsync 3.x first
# in PATH that end rejects the -E flag and the export stops with "Copy failed".
# The system tools go first for this one command.
PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH" \
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/build/ExportOptions.plist" \
  -exportPath "$EXPORT_DIR" -allowProvisioningUpdates \
  "${AUTH[@]}" | grep -E "error|EXPORT|Uploaded|upload"
[ "${PIPESTATUS[0]}" = 0 ] || { echo "EXPORT FAILED — see $LOG"; exit 8; }

echo
echo "== DONE =="
echo "Version $VERSION, build $BUILD"
if [ "$MODE" = upload ]; then
  echo "Uploaded to App Store Connect. Processing takes a few minutes; an"
  echo "external tester group then has to clear Beta App Review before strangers"
  echo "can install it."
else
  echo "Archive:  $ARCHIVE"
  echo "Exported: $EXPORT_DIR"
  if [ "$IS_MAC" = 1 ]; then
    echo "The .pkg in that folder is what the Mac App Store takes. This script does not upload"
    echo "it: use Transporter, or Xcode > Window > Organizer with the archive above."
  else
    echo "Re-run with --upload to send it to App Store Connect."
  fi
fi
