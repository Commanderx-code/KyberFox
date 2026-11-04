"""The Sora and Inter fonts bundled for the Kyber pages."""

import hashlib
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "overlay/browser/components/kyberfox/content/fonts"
FONTS_CSS = ROOT / "themes/kyber/fonts.css"
NOTICES = ROOT / "themes/NOTICES.md"
WOFF2 = {
    "sora-latin-600-normal.woff2",
    "sora-latin-700-normal.woff2",
    "inter-latin-400-normal.woff2",
    "inter-latin-500-normal.woff2",
    "inter-latin-600-normal.woff2",
}


def sums():
    lines = (FONTS / "SHA256SUMS").read_text().splitlines()
    return dict(reversed(line.split(maxsplit=1)) for line in lines if line.strip())


def test_fonts_match_sums():
    listed = sums()
    assert {n for n in listed if n.endswith(".woff2")} == WOFF2
    assert {p.name for p in FONTS.glob("*.woff2")} == WOFF2
    for name, digest in listed.items():
        assert hashlib.sha256((FONTS / name).read_bytes()).hexdigest() == digest, name


def test_licenses_are_ofl():
    for name in ("OFL-Sora.txt", "OFL-Inter.txt"):
        assert "SIL OPEN FONT LICENSE VERSION 1.1" in (FONTS / name).read_text().upper(), name


def test_notices_list_fonts():
    pins = tomllib.loads((ROOT / "pins.toml").read_text())["fonts"]
    notices = NOTICES.read_text()
    for family, key in (("Sora", "sora"), ("Inter", "inter")):
        assert re.search(rf"{family}\b.*{re.escape(pins[key])}", notices), family


def test_fonts_css_is_local():
    urls = re.findall(r"src:\s*url\(\s*['\"]?([^'\")]+)", FONTS_CSS.read_text())
    assert urls
    for url in urls:
        assert url.startswith("chrome://kyberfox/content/fonts/"), url
        assert url.rsplit("/", 1)[1] in WOFF2, url


def test_jar_packages_fonts():
    jar = (ROOT / "overlay/browser/components/kyberfox/jar.mn").read_text()
    assert "content/kyberfox/fonts/ (content/fonts/**)" in jar
