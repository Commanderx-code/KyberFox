#!/bin/sh
# Writes every image in the Kyber Fox branding directory from the logo in
# branding/. logo.png is the large original; logo-<size>.png are the owner's
# own renders at those sizes and are used as they are, so small icons stay
# sharp. Other sizes are scaled down from logo.png. branding/private-browsing/ holds
# the private browsing logo in the same layout. branding/private-window/logo.png
# is the mask: the app icon of private windows in the taskbar.
# Needs ImageMagick 7 (magick) and python3. Run from the repository root.
set -eu

src=branding
dir=overlay/browser/branding/kyberfox
backdrop="#1b1530"

# square FILE SIZE [SOURCE]: the logo filling a SIZE x SIZE transparent
# square. SOURCE is the logo directory, branding/ by default.
square() {
  from=${3:-$src}
  if [ -f "$from/logo-$2.png" ]; then
    magick "$from/logo-$2.png" -strip "$1"
  else
    magick "$from/logo.png" -resize "$2x$2" -strip "$1"
  fi
}

# banner FILE WIDTH HEIGHT [BACKGROUND]: the logo centered on a WIDTH x HEIGHT
# canvas, at 80% of the shorter side.
banner() {
  h=$(( ($2 < $3 ? $2 : $3) * 80 / 100 ))
  magick -size "$2x$3" "xc:${4:-none}" \( "$src/logo.png" -resize "${h}x${h}" \) \
    -gravity center -compose over -composite -strip "$1"
}

# ico FILE SOURCE SIZE...
ico() {
  out=$1 from=$2
  shift 2
  frames=""
  for size in "$@"; do
    square "PNG32:$tmp/ico-$size.png" "$size" "$from"
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
  # Linux private windows (window class kyberfox-private): the mask.
  square "PNG32:$dir/kyberfox-private$size.png" "$size" "$src/private-window"
done
square "PNG32:$dir/VisualElements_150.png" 300
square "PNG32:$dir/VisualElements_70.png" 142
square "PNG32:$dir/PrivateBrowsing_150.png" 300 "$src/private-window"
square "PNG32:$dir/PrivateBrowsing_70.png" 142 "$src/private-window"
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

ico "$dir/firefox.ico" "$src" 16 32 48 256
ico "$dir/firefox64.ico" "$src" 16 32 48 64
ico "$dir/document.ico" "$src" 16 32 48 256
ico "$dir/document_pdf.ico" "$src" 256
ico "$dir/newtab.ico" "$src" 16 32
ico "$dir/newwindow.ico" "$src" 16 32
ico "$dir/pbmode.ico" "$src/private-window" 16 32 48 256

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
square "PNG32:$content/about-logo-private.png" 192 "$src/private-browsing"
square "PNG32:$content/about-logo-private@2x.png" 384 "$src/private-browsing"
square "PNG32:$content/icon-private16.png" 16 "$src/private-browsing"
square "PNG32:$content/icon-private32.png" 32 "$src/private-browsing"

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

# Wordmarks: the outlined "KYBER FOX" from branding/wordmark.svg (drawn by
# tools/make_wordmark.py). Firefox sets the fill of these to the page's text
# color, so "KYBER" takes it (white on dark pages, dark on light ones) and
# "FOX" keeps its gradient.
for name in about-wordmark.svg firefox-wordmark.svg; do
  sed 's/fill="#FFFFFF"/fill="context-fill"/' "$src/wordmark.svg" > "$content/$name"
done

# Theme foxes for the Kyber new tab and private pages (themes/kyber/foxes/).
# Crimson and Azure map the logo's brightness onto a ramp of the theme's
# colors and keep its transparency, so the shading survives.
foxes=themes/kyber/foxes
mkdir -p "$foxes"

# clean_alpha SRC OUT: drops the faint speckles around the edge (alpha < 8%).
clean_alpha() {
  magick "$1" -channel A -fx 'a < 0.08 ? 0 : a' +channel "$2"
}

# gradient_map SRC OUT C1 C2 C3 C4: the ramp C1 -> C2 -> C3 -> C4, dark to light.
gradient_map() {
  magick -size 256x1 "gradient:$3-$4" \( -size 256x1 "gradient:$4-$5" \) \
    \( -size 256x1 "gradient:$5-$6" \) +append -resize 256x1! "$tmp/ramp.png"
  magick "$1" \( +clone -alpha extract \) \
    \( -clone 0 -alpha off -colorspace gray -sigmoidal-contrast 3,50% "$tmp/ramp.png" -clut \) \
    -delete 0 +swap -compose copy-opacity -composite "$2"
}

magick "$src/logo.png" -resize 1024x1024 "$tmp/fox.png"
clean_alpha "$src/private-browsing/logo.png" "$tmp/private-full.png"
magick "$tmp/private-full.png" -resize 1024x1024 "$tmp/private.png"
for kind in fox private; do
  magick "$tmp/$kind.png" -strip "PNG32:$foxes/$kind-crystal.png"
  gradient_map "$tmp/$kind.png" "$tmp/$kind-crimson.png" "#120006" "#7A0012" "#FF1A3C" "#FFD6DE"
  magick "$tmp/$kind-crimson.png" -strip "PNG32:$foxes/$kind-crimson.png"
  gradient_map "$tmp/$kind.png" "$tmp/$kind-azure.png" "#020B2A" "#0B3FD6" "#3AA0F5" "#EEF3FA"
  magick "$tmp/$kind-azure.png" -strip "PNG32:$foxes/$kind-azure.png"
done

# Fox Guard, the Kyber Shields panel artwork, recolored the same way. Kyber
# Crystal uses the original in overlay/.
guard=overlay/browser/components/kyberfox/content/fox-guard.png
gradient_map "$guard" "$tmp/guard-crimson.png" "#120006" "#7A0012" "#FF1A3C" "#FFD6DE"
magick "$tmp/guard-crimson.png" -strip "PNG32:$foxes/fox-guard-crimson.png"
gradient_map "$guard" "$tmp/guard-azure.png" "#020B2A" "#0B3FD6" "#3AA0F5" "#EEF3FA"
magick "$tmp/guard-azure.png" -strip "PNG32:$foxes/fox-guard-azure.png"
