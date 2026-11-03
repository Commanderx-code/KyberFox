#!/bin/sh
# Writes plain solid-circle placeholders for every image in the Kyber Fox
# branding directory, replacing the artwork copied from Firefox's unofficial
# branding. The final logo replaces these before release.
# Needs ImageMagick 7 (magick) and python3. Run from the repository root.
set -eu

dir=overlay/browser/branding/kyberfox
color="#5b4bdb"
private="#8a2be2"
backdrop="#1b1530"

# circle FILE WIDTH HEIGHT [COLOR [BACKGROUND]]
circle() {
  r=$(( ($2 < $3 ? $2 : $3) * 45 / 100 ))
  magick -size "$2x$3" "xc:${5:-none}" -fill "${4:-$color}" \
    -draw "circle $(( $2 / 2 )),$(( $3 / 2 )) $(( $2 / 2 + r )),$(( $3 / 2 ))" \
    -strip "$1"
}

# ico FILE COLOR SIZE...
ico() {
  out=$1 fill=$2
  shift 2
  frames=""
  for size in "$@"; do
    circle "$tmp/ico-$size.png" "$size" "$size" "$fill"
    frames="$frames $tmp/ico-$size.png"
  done
  # shellcheck disable=SC2086
  magick $frames "$out"
}

# icns FILE: a macOS icon with 128, 256, 512 and 1024 pixel PNG entries.
icns() {
  for size in 128 256 512 1024; do
    circle "PNG32:$tmp/icns-$size.png" "$size" "$size"
  done
  python3 -I - "$1" "$tmp" <<'PY'
import struct, sys
from pathlib import Path
out, tmp = Path(sys.argv[1]), Path(sys.argv[2])
entries = b""
for kind, size in ((b"ic07", 128), (b"ic08", 256), (b"ic09", 512), (b"ic10", 1024)):
    data = (tmp / f"icns-{size}.png").read_bytes()
    entries += kind + struct.pack(">I", len(data) + 8) + data
out.write_bytes(b"icns" + struct.pack(">I", len(entries) + 8) + entries)
PY
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for size in 16 22 24 32 48 64 128 256; do
  circle "PNG32:$dir/default$size.png" "$size" "$size"
done
circle "PNG32:$dir/VisualElements_150.png" 300 300
circle "PNG32:$dir/VisualElements_70.png" 142 142
circle "PNG32:$dir/PrivateBrowsing_150.png" 300 300 "$private"
circle "PNG32:$dir/PrivateBrowsing_70.png" 142 142 "$private"
circle "PNG32:$dir/background.png" 1440 880 "$color" "$backdrop"

for asset in Document44x44:44x44 LargeTile.scale-200:620x620 MedTile.scale-200:300x300 \
    SmallTile.scale-200:142x142 Square150x150Logo.scale-200:300x300 \
    Square44x44Logo.altform-lightunplated_targetsize-256:256x256 \
    Square44x44Logo.altform-unplated_targetsize-256:256x256 \
    Square44x44Logo.scale-200:88x88 Square44x44Logo.targetsize-256:256x256 \
    StoreLogo.scale-200:100x100 Wide310x150Logo.scale-200:620x300; do
  name=${asset%%:*} wh=${asset#*:}
  circle "PNG32:$dir/msix/Assets/$name.png" "${wh%x*}" "${wh#*x}"
done

ico "$dir/firefox.ico" "$color" 16 32 48 256
ico "$dir/firefox64.ico" "$color" 16 32 48 64
ico "$dir/document.ico" "$color" 16 32 48 256
ico "$dir/document_pdf.ico" "$color" 256
ico "$dir/newtab.ico" "$color" 16 32
ico "$dir/newwindow.ico" "$color" 16 32
ico "$dir/pbmode.ico" "$private" 16 32 48 256

icns "$dir/firefox.icns"
icns "$dir/document.icns"
icns "$dir/disk.icns"

# The Windows installer needs 24-bit BMP3 bitmaps on a white background.
circle "BMP3:$dir/wizHeader.bmp" 150 57 "$color" white
circle "BMP3:$dir/wizHeaderRTL.bmp" 150 57 "$color" white
circle "BMP3:$dir/wizWatermark.bmp" 164 314 "$color" "$backdrop"
circle "JPEG:$dir/stubinstaller/bgstub.jpg" 1344 822 "$color" "$backdrop"

content=$dir/content
circle "PNG32:$content/about.png" 300 236
circle "PNG32:$content/about-logo.png" 192 192
circle "PNG32:$content/about-logo@2x.png" 384 384
circle "PNG32:$content/about-logo-private.png" 192 192 "$private"
circle "PNG32:$content/about-logo-private@2x.png" 384 384 "$private"

svg_header='<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->'

for name in about-logo.svg document_pdf.svg; do
  cat > "$content/$name" <<SVG
$svg_header
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="230" fill="$color"/>
</svg>
SVG
done

# Wordmarks: the product name as text, in the same 372x99 box as Firefox's.
for name in about-wordmark.svg firefox-wordmark.svg; do
  cat > "$content/$name" <<SVG
$svg_header
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 372 99">
  <text x="186" y="70" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="600" fill="context-fill">Kyber Fox</text>
</svg>
SVG
done
