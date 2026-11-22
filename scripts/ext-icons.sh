#!/bin/bash
# Render images/icon.svg into the extension's own icons (images/icon-<n>.png),
# which manifest.json names under "icons" and "action.default_icon".
#
# These keep their rounded corners on a TRANSPARENT background: Safari draws
# the toolbar icon as-is, so any opaque corner shows as a white square around
# it. (The App Store marketing icon is the opposite case, flattened and opaque;
# that is scripts/app-icon.sh, which writes only into the Xcode app target.)
#
# Uses AppKit's own SVG support, so it needs nothing beyond the Command Line
# Tools. Run after changing icon.svg, then commit the PNGs:
#   bash scripts/ext-icons.sh
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/render.swift" <<'SWIFT'
import AppKit

// Draw the SVG into an RGBA bitmap that starts fully transparent.
let a = CommandLine.arguments
guard a.count >= 4, let svg = NSImage(contentsOfFile: a[1]) else {
  FileHandle.standardError.write("ext-icons: cannot read \(a.count > 1 ? a[1] : "svg")\n".data(using: .utf8)!); exit(1)
}
let outDir = a[2]
for s in a.dropFirst(3) {
  guard let n = Int(s),
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: n, pixelsHigh: n,
                                   bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                   colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
  else { exit(1) }
  rep.size = NSSize(width: n, height: n)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  NSColor.clear.set()
  NSRect(x: 0, y: 0, width: n, height: n).fill(using: .copy)
  svg.draw(in: NSRect(x: 0, y: 0, width: n, height: n))
  NSGraphicsContext.restoreGraphicsState()
  // The corner pixel must be fully transparent, or the toolbar shows a square.
  let corner = rep.colorAt(x: 0, y: 0)?.alphaComponent ?? 1
  guard corner == 0, let png = rep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("ext-icons: \(n)px corner alpha \(corner)\n".data(using: .utf8)!); exit(1)
  }
  try! png.write(to: URL(fileURLWithPath: "\(outDir)/icon-\(n).png"))
  print("icon-\(n).png  corner alpha 0")
}
SWIFT

swift "$TMP/render.swift" "$SRC/images/icon.svg" "$SRC/images" 16 32 48 96 128 256 512
