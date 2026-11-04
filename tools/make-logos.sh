#!/bin/sh
# Writes every image in the Kyber Fox branding directory from the logo in
# branding/. logo.png is the large original; logo-<size>.png are the owner's
# own renders at those sizes and are used as they are, so small icons stay
# sharp. Other sizes are scaled down from logo.png.
# Needs ImageMagick 7 (magick) and python3. Run from the repository root.
set -eu

src=branding
dir=overlay/browser/branding/kyberfox
backdrop="#1b1530"

# square FILE SIZE: the logo filling a SIZE x SIZE transparent square.
square() {
  if [ -f "$src/logo-$2.png" ]; then
    magick "$src/logo-$2.png" -strip "$1"
  else
    magick "$src/logo.png" -resize "$2x$2" -strip "$1"
  fi
}

# banner FILE WIDTH HEIGHT [BACKGROUND]: the logo centered on a WIDTH x HEIGHT
# canvas, at 80% of the shorter side.
banner() {
  h=$(( ($2 < $3 ? $2 : $3) * 80 / 100 ))
  magick -size "$2x$3" "xc:${4:-none}" \( "$src/logo.png" -resize "${h}x${h}" \) \
    -gravity center -compose over -composite -strip "$1"
}

# ico FILE SIZE...
ico() {
  out=$1
  shift
  frames=""
  for size in "$@"; do
    square "PNG32:$tmp/ico-$size.png" "$size"
    frames="$frames $tmp/ico-$size.png"
  done
  # shellcheck disable=SC2086
  magick $frames "$out"
}

# icns FILE: a macOS icon with 128, 256, 512 and 1024 pixel PNG entries.
icns() {
  for size in 128 256 512 1024; do
    square "PNG32:$tmp/icns-$size.png" "$size"
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
  square "PNG32:$dir/default$size.png" "$size"
done
for name in VisualElements PrivateBrowsing; do
  square "PNG32:$dir/${name}_150.png" 300
  square "PNG32:$dir/${name}_70.png" 142
done
banner "PNG32:$dir/background.png" 1440 880 "$backdrop"

for asset in Document44x44:44x44 LargeTile.scale-200:620x620 MedTile.scale-200:300x300 \
    SmallTile.scale-200:142x142 Square150x150Logo.scale-200:300x300 \
    Square44x44Logo.altform-lightunplated_targetsize-256:256x256 \
    Square44x44Logo.altform-unplated_targetsize-256:256x256 \
    Square44x44Logo.scale-200:88x88 Square44x44Logo.targetsize-256:256x256 \
    StoreLogo.scale-200:100x100 Wide310x150Logo.scale-200:620x300; do
  name=${asset%%:*} wh=${asset#*:} w=${wh%x*} h=${wh#*x}
  if [ "$w" = "$h" ]; then
    square "PNG32:$dir/msix/Assets/$name.png" "$w"
  else
    banner "PNG32:$dir/msix/Assets/$name.png" "$w" "$h"
  fi
done

ico "$dir/firefox.ico" 16 32 48 256
ico "$dir/firefox64.ico" 16 32 48 64
ico "$dir/document.ico" 16 32 48 256
ico "$dir/document_pdf.ico" 256
ico "$dir/newtab.ico" 16 32
ico "$dir/newwindow.ico" 16 32
ico "$dir/pbmode.ico" 16 32 48 256

icns "$dir/firefox.icns"
icns "$dir/document.icns"
icns "$dir/disk.icns"

# The Windows installer needs 24-bit BMP3 bitmaps without transparency.
banner "BMP3:$dir/wizHeader.bmp" 150 57 white
banner "BMP3:$dir/wizHeaderRTL.bmp" 150 57 white
banner "BMP3:$dir/wizWatermark.bmp" 164 314 "$backdrop"
banner "JPEG:$dir/stubinstaller/bgstub.jpg" 1344 822 "$backdrop"

content=$dir/content
banner "PNG32:$content/about.png" 300 236
square "PNG32:$content/about-logo.png" 192
square "PNG32:$content/about-logo@2x.png" 384
square "PNG32:$content/about-logo-private.png" 192
square "PNG32:$content/about-logo-private@2x.png" 384

svg_header='<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->'

# The SVG logos wrap the 512 pixel render, since the logo has no vector form.
logo_b64=$(base64 -w0 "$src/logo-512.png")
for name in about-logo.svg document_pdf.svg; do
  cat > "$content/$name" <<SVG
$svg_header
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <image width="512" height="512" href="data:image/png;base64,$logo_b64"/>
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
