# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""Draws the "KYBER FOX" wordmark as outlined paths from the bundled Sora Bold.

Writes branding/wordmark.svg ("KYBER" white, "FOX" with the Kyber Crystal
gradient) and themes/kyber/wordmark-mask.svg (every letter white, for a CSS
mask), and prints where "FOX" starts as a fraction of the width, which
themes/kyber/pages.css uses to color the two words.

Run it after changing the font or the spacing (it needs fontTools and brotli,
which the release tools do not):

    nix shell --impure --expr '(builtins.getFlake "nixpkgs").legacyPackages.x86_64-linux.python3.withPackages (p: [p.fonttools p.brotli])' \
        --command python3 tools/make_wordmark.py
"""

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "overlay/browser/components/kyberfox/content/fonts/sora-latin-700-normal.woff2"
WORDS = ("KYBER", "FOX")
SPACING = 0.09  # letter spacing, in em
GAP = 0.32  # space between the words, in em
HEIGHT = 100  # the wordmark's height in the SVG's units
CYAN, VIOLET = "#00E5FF", "#B400FF"
HEADER = """<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->
"""


def outline():
    """Returns ([(word, [path data])], width, height, fox_start) in SVG units."""
    font = TTFont(FONT)
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    cap = font["OS/2"].sCapHeight or 0.7 * upm
    scale = HEIGHT / cap
    x = 0.0
    words = []
    fox_start = 0.0
    for n, word in enumerate(WORDS):
        if n:
            x += GAP * upm
            fox_start = x
        paths = []
        for i, ch in enumerate(word):
            name = cmap[ord(ch)]
            pen = SVGPathPen(glyphs)
            # Font units are y-up; SVG is y-down with the baseline at HEIGHT.
            glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x * scale, HEIGHT)))
            paths.append(pen.getCommands())
            x += hmtx[name][0]
            if i < len(word) - 1:
                x += SPACING * upm
        words.append((word, paths))
    width = x * scale
    return words, width, HEIGHT, fox_start * scale / width


def svg(words, width, height, mask):
    w = f"{width:.1f}"
    out = [HEADER, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {height}" width="{w}" height="{height}">\n']
    if not mask:
        out.append(
            f'  <defs><linearGradient id="fox" gradientUnits="userSpaceOnUse" x1="{width * 0.6:.1f}" x2="{w}" y1="0" y2="0">'
            f'<stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{VIOLET}"/></linearGradient></defs>\n'
        )
    for word, paths in words:
        fill = "#FFFFFF" if mask or word == "KYBER" else "url(#fox)"
        out.append(f'  <g fill="{fill}">\n')
        out.extend(f'    <path d="{d}"/>\n' for d in paths)
        out.append("  </g>\n")
    out.append("</svg>\n")
    return "".join(out)


def main():
    words, width, height, fox_start = outline()
    (ROOT / "branding/wordmark.svg").write_text(svg(words, width, height, False))
    (ROOT / "themes/kyber/wordmark-mask.svg").write_text(svg(words, width, height, True))
    print(f"width {width:.1f} height {height} fox starts at {fox_start * 100:.1f}%")


if __name__ == "__main__":
    main()
