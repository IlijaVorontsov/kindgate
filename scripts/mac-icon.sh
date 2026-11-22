#!/bin/bash
# Render images/icon.svg into the Mac app target's AppIcon set, all ten sizes.
#
# The packager fills the Mac icon set with the extension's toolbar icon scaled
# up: the full-bleed square with nothing around it, which sits larger than every
# other icon in the Dock on macOS 15 and earlier. Those systems draw a bitmap
# icon exactly as given, so the Mac shape has to be in the picture itself:
#
#   canvas 1024 x 1024, transparent
#   the rounded square of icon.svg scaled to 824 x 824 and centred (100 px of
#   margin on every side); its corner radius, 114 of 512, comes out at 183 px
#   a soft shadow under it: 10 px down, 10 px blur, black at 30 %
#
# That is the grid of Apple's Mac icon template for macOS 11 to 15. macOS 26
# and later mask icons themselves, as iOS does, and re-shape a bitmap icon like
# this one; an Icon Composer file would give control there and is not made here.
# https://developer.apple.com/design/human-interface-guidelines/app-icons
#
# Unlike the iOS icon (scripts/app-icon.sh) these files keep their alpha
# channel: the margin and the corners must be transparent.
#
# Run:  bash scripts/mac-icon.sh <path to AppIcon.appiconset>
set -o pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SET="$1"
[ -d "$SET" ] || { echo "mac-icon: no such appiconset: $SET"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/render.swift" <<'SWIFT'
import AppKit

// Draws the SVG once per pixel size, straight from the vector, so the small
// sizes are not a blurred copy of the large one.
let a = CommandLine.arguments
guard a.count == 3, let svg = NSImage(contentsOf: URL(fileURLWithPath: a[1])), svg.isValid else {
    FileHandle.standardError.write("mac-icon: cannot read the SVG\n".data(using: .utf8)!); exit(1)
}
let sizes: [(name: String, px: Int)] = [
    ("16@1x", 16), ("16@2x", 32), ("32@1x", 32), ("32@2x", 64), ("128@1x", 128),
    ("128@2x", 256), ("256@1x", 256), ("256@2x", 512), ("512@1x", 512), ("512@2x", 1024),
]
for (name, px) in sizes {
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
          let ctx = NSGraphicsContext(bitmapImageRep: rep) else { exit(1) }
    rep.size = NSSize(width: px, height: px)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ctx
    ctx.imageInterpolation = .high
    let k = CGFloat(px) / 1024
    let shadow = NSShadow()
    shadow.shadowOffset = NSSize(width: 0, height: -10 * k)
    shadow.shadowBlurRadius = 10 * k
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.3)
    shadow.set()
    svg.draw(in: NSRect(x: 100 * k, y: 100 * k, width: 824 * k, height: 824 * k),
             from: .zero, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
    do { try png.write(to: URL(fileURLWithPath: a[2] + "/mac-icon-" + name + ".png")) } catch { exit(1) }
}
SWIFT

swift "$TMP/render.swift" "$SRC/images/icon.svg" "$TMP" || { echo "mac-icon: could not render icon.svg"; exit 1; }

# The file names are the ones the packager's Contents.json already lists.
n=0
for f in "$TMP"/mac-icon-*.png; do
  b=$(basename "$f")
  grep -q "\"$b\"" "$SET/Contents.json" || { echo "mac-icon: $b is not in $SET/Contents.json"; exit 1; }
  cp "$f" "$SET/$b" || exit 1
  n=$((n + 1))
done
[ "$n" = 10 ] || { echo "mac-icon: rendered $n of 10 sizes"; exit 1; }
echo "mac app icon: $n sizes, 1024 px alpha $(sips -g hasAlpha "$SET/mac-icon-512@2x.png" | sed -n 's/.*hasAlpha: //p')"
