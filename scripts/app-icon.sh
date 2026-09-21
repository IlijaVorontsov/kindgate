#!/bin/bash
# Render images/icon.svg into the Xcode app target's AppIcon set.
#
# The converter ships Apple's generic placeholder as the app icon, and that PNG
# carries an alpha channel. App Store Connect rejects any 1024x1024 marketing
# icon that does (ITMS-90717), so the upload fails long after the build passes.
# Both problems are fixed here: our own art, flattened onto an opaque canvas.
#
# Run:  bash scripts/app-icon.sh <path to AppIcon.appiconset>
set -o pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SET="$1"
[ -d "$SET" ] || { echo "app-icon: no such appiconset: $SET"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# iOS masks the icon itself, so the source rounded corners would be masked twice
# and leave a pale seam. Drop the radius and let the honey square run full bleed.
sed 's/ rx="114"//' "$SRC/images/icon.svg" > "$TMP/appicon.svg"

# QuickLook is the only SVG rasteriser guaranteed to be on a Mac with Xcode.
qlmanage -t -s 1024 -o "$TMP" "$TMP/appicon.svg" >/dev/null 2>&1
[ -f "$TMP/appicon.svg.png" ] || { echo "app-icon: QuickLook could not render icon.svg"; exit 1; }

cat > "$TMP/flatten.swift" <<'SWIFT'
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Redraw the rendered icon into a context with no alpha channel at all
// (noneSkipLast), which is what the App Store requires of the marketing icon.
let a = CommandLine.arguments
guard a.count == 4, let size = Int(a[3]),
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil),
      let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                          bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else { FileHandle.standardError.write("flatten: bad input\n".data(using: .utf8)!); exit(1) }
ctx.interpolationQuality = .high
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
ctx.draw(img, in: CGRect(x: 0, y: 0, width: size, height: size))
guard let out = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL,
                                                 UTType.png.identifier as CFString, 1, nil)
else { exit(1) }
CGImageDestinationAddImage(dest, out, nil)
exit(CGImageDestinationFinalize(dest) ? 0 : 1)
SWIFT

swift "$TMP/flatten.swift" "$TMP/appicon.svg.png" "$TMP/universal-icon-1024@1x.png" 1024 || {
  echo "app-icon: could not flatten the rendered icon"; exit 1; }

# Contents.json already points light, dark and tinted at this one filename.
cp "$TMP/universal-icon-1024@1x.png" "$SET/universal-icon-1024@1x.png"
echo "app icon: 1024x1024, alpha $(sips -g hasAlpha "$SET/universal-icon-1024@1x.png" | sed -n 's/.*hasAlpha: //p')"
