# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""Draws the glowing wave backgrounds of the Kyber new tab page.

One layout, in each Kyber theme's colors: soft bands sweeping across the top
left and the bottom of the page, each a wide blurred glow under a thin bright
line. Writes themes/kyber/waves-<theme>.svg. Run from anywhere:

    python3 tools/make_waves.py
"""

from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "themes/kyber"
THEMES = {
    "crystal": ("#00E5FF", "#B400FF"),
    "crimson": ("#FA0226", "#F994AE"),
    "azure": ("#31A2F2", "#CCD1D8"),
}
# (path, which gradient, glow width, glow opacity, line opacity)
BANDS = [
    ("M-120 430 C 260 250 560 470 940 250 S 1620 -60 2040 40", "a", 120, 0.50, 0.85),
    ("M-120 300 C 300 120 640 330 1020 110 S 1660 -120 2040 -60", "b", 70, 0.35, 0.60),
    ("M-120 1010 C 380 1110 820 800 1260 930 S 1780 1060 2040 700", "b", 130, 0.50, 0.85),
    ("M-120 1110 C 420 1170 900 900 1340 1020 S 1820 1120 2040 840", "a", 80, 0.35, 0.60),
    ("M1500 1120 C 1700 940 1860 860 2040 600", "a", 60, 0.45, 0.75),
]
HEADER = """<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->
"""


def svg(a, b):
    out = [
        HEADER,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">\n',
        "  <defs>\n",
    ]
    for gid, (c1, c2) in (("a", (a, b)), ("b", (b, a))):
        out.append(
            f'    <linearGradient id="{gid}" x1="0" x2="1" y1="0" y2="0">'
            f'<stop offset="0" stop-color="{c1}" stop-opacity="0"/>'
            f'<stop offset=".3" stop-color="{c1}"/>'
            f'<stop offset=".75" stop-color="{c2}"/>'
            f'<stop offset="1" stop-color="{c2}" stop-opacity="0"/></linearGradient>\n'
        )
    out.append('    <filter id="glow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="28"/></filter>\n')
    out.append('    <filter id="soft" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="1.5"/></filter>\n')
    out.append("  </defs>\n")
    out.append('  <g fill="none" stroke-linecap="round">\n')
    for d, g, width, glow, line in BANDS:
        out.append(f'    <path d="{d}" stroke="url(#{g})" stroke-width="{width}" opacity="{glow}" filter="url(#glow)"/>\n')
        out.append(f'    <path d="{d}" stroke="url(#{g})" stroke-width="2.5" opacity="{line}" filter="url(#soft)"/>\n')
    out.append("  </g>\n</svg>\n")
    return "".join(out)


def main():
    for name, (a, b) in THEMES.items():
        (OUT / f"waves-{name}.svg").write_text(svg(a, b))


if __name__ == "__main__":
    main()
