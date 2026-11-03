#!/bin/sh
# Writes plain solid-circle placeholder logos into the Kyber Fox branding
# directory, replacing the logo and wordmark files copied from Firefox's
# unofficial branding. The final logo replaces these before release.
# Needs ImageMagick 7 (magick). Run from the repository root.
set -eu

dir=overlay/browser/branding/kyberfox/content
color="#5b4bdb"

circle() { # circle FILE WIDTH HEIGHT
  r=$(( ($2 < $3 ? $2 : $3) * 45 / 100 ))
  magick -size "$2x$3" xc:none -fill "$color" \
    -draw "circle $(( $2 / 2 )),$(( $3 / 2 )) $(( $2 / 2 + r )),$(( $3 / 2 ))" \
    -strip "PNG32:$1"
}

circle "$dir/about.png" 300 236
circle "$dir/about-logo.png" 192 192
circle "$dir/about-logo@2x.png" 384 384
circle "$dir/about-logo-private.png" 192 192
circle "$dir/about-logo-private@2x.png" 384 384

svg_header='<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->'

cat > "$dir/about-logo.svg" <<SVG
$svg_header
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="230" fill="$color"/>
</svg>
SVG

# Wordmarks: the product name as text, in the same 372x99 box as Firefox's.
for name in about-wordmark.svg firefox-wordmark.svg; do
  cat > "$dir/$name" <<SVG
$svg_header
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 372 99">
  <text x="186" y="70" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="600" fill="context-fill">Kyber Fox</text>
</svg>
SVG
done
