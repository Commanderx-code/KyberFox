"""The three Kyber themes: skins that share the sheets in themes/kyber/."""

import json
import re
from pathlib import Path

from tests.test_palettes import REQUIRED as VARS

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "themes"
SKINS = THEMES / "skins"
JAR = ROOT / "overlay/browser/components/kyberfox/jar.mn"
KYBER = ("kyber-crystal", "kyber-crimson", "kyber-azure")
NAMES = {"kyber-crystal": "Kyber Crystal", "kyber-crimson": "Crimson", "kyber-azure": "Azure"}
SHARED = ["base.css", "kyber/fonts.css", "kyber/chrome.css", "kyber/pages.css", "kyber/settings.css"]


def manifest(i):
    return json.loads((SKINS / i / "skin.json").read_text(encoding="utf-8"))


def kyber_files():
    yield from (p for p in (THEMES / "kyber").rglob("*") if p.is_file())
    for i in KYBER:
        yield from (p for p in (SKINS / i).rglob("*") if p.is_file())


def test_kyber_skins_are_listed():
    ids = json.loads((SKINS / "index.json").read_text())["skins"]
    assert ids == ["gx", "one", *KYBER]


def test_kyber_skin_manifests():
    for i in KYBER:
        m = manifest(i)
        assert (m["id"], m["name"], m["kind"], m["scheme"]) == (i, NAMES[i], "skin", "dark")
        assert m["sheets"] == ["colors.css"]
        assert m["shared"] == SHARED
        assert set(m["vars"]) == VARS
        assert (SKINS / i / "LICENSE").read_text().startswith("Mozilla Public License")


def test_shared_sheets_exist():
    for rel in SHARED:
        assert (THEMES / rel).is_file(), rel


def test_kyber_files_have_no_remote_urls_or_star_wars_terms():
    for p in kyber_files():
        if p.suffix in (".css", ".svg", ".json"):
            text = p.read_text(encoding="utf-8")
            assert not re.search(r"url\(\s*['\"]?(https?:|//)", text), p
            assert not re.search(r"\b(jedi|sith|dark side|lightsaber)\b", text, re.I), p


def test_jar_packages_kyber_files():
    jar = JAR.read_text(encoding="utf-8")
    for i in KYBER:
        assert f"content/kyberfox/themes/skins/{i}/ (themes/skins/{i}/**)" in jar
    assert "content/kyberfox/themes/kyber/ (themes/kyber/**)" in jar


def test_colors_css_matches_manifest_vars():
    """The picker previews skin.json; the browser uses colors.css. They agree."""
    for i in KYBER:
        css = (SKINS / i / "colors.css").read_text(encoding="utf-8")
        found = dict(re.findall(r"(--kf-[a-z-]+):\s*([^;]+);", css))
        assert found == manifest(i)["vars"], i
        assert re.search(r"--kyber-glow-strength:\s*1;", css), i


BRANDING = ROOT / "overlay/browser/branding/kyberfox/content"
WORDMARKS = [
    ROOT / "branding/wordmark.svg",
    THEMES / "kyber/wordmark-mask.svg",
    BRANDING / "about-wordmark.svg",
    BRANDING / "firefox-wordmark.svg",
]
FOXES = [f"{kind}-{theme}.png" for kind in ("fox", "private") for theme in ("crystal", "crimson", "azure")]
WAVES = [THEMES / f"kyber/waves-{t}.svg" for t in ("crystal", "crimson", "azure")]


def test_wordmarks_are_outlines():
    for p in WORDMARKS:
        svg = p.read_text(encoding="utf-8")
        assert "viewBox=" in svg, p
        assert svg.count("<path") >= 8, p
        for tag in ("<text", "<image", "<script"):
            assert tag not in svg, (p, tag)


def test_theme_foxes_exist():
    import shutil
    import subprocess

    import pytest

    if not shutil.which("magick"):
        pytest.skip("ImageMagick is not installed")
    for name in FOXES:
        p = THEMES / "kyber/foxes" / name
        out = subprocess.run(["magick", "identify", "-format", "%w %h %A", str(p)],
                             capture_output=True, text=True, check=True).stdout.split()
        assert out[:2] == ["1024", "1024"], name
        assert out[2].lower() in ("blend", "true"), name


def test_waves_are_small_and_local():
    for p in WAVES:
        assert p.stat().st_size < 20_000, p
        code = re.sub(r"<!--.*?-->", "", p.read_text(), flags=re.S)
        code = re.sub(r'xmlns(:\w+)?="[^"]*"', "", code)
        assert not re.search(r"(https?:)?//[a-z]", code), p


def test_colors_css_points_at_existing_files():
    for i in KYBER:
        css = (SKINS / i / "colors.css").read_text(encoding="utf-8")
        urls = re.findall(r'url\("chrome://kyberfox/content/themes/([^"]+)"\)', css)
        assert len(urls) in (3, 4), i
        for rel in urls:
            assert (THEMES / rel).is_file(), (i, rel)


THEME = {"kyber-crystal": "crystal", "kyber-crimson": "crimson", "kyber-azure": "azure"}
GUARD = "overlay/browser/components/kyberfox/content/fox-guard.png"


def test_theme_cards_show_the_theme_fox():
    """The Settings theme card previews each Kyber theme with its own fox."""
    for i in KYBER:
        logo = manifest(i)["logo"]
        assert logo == f"kyber/foxes/fox-{THEME[i]}.png", i
        assert (THEMES / logo).is_file(), i


def test_fox_guard_follows_the_theme():
    """Crystal keeps the original Fox Guard; Crimson and Azure get recolors."""
    for i in KYBER:
        css = (SKINS / i / "colors.css").read_text(encoding="utf-8")
        found = re.search(r'--kyber-fox-guard:\s*url\("chrome://kyberfox/content/([^"]+)"\);', css)
        assert found, i
        rel = found.group(1)
        if i == "kyber-crystal":
            assert rel == "fox-guard.png"
        else:
            assert rel == f"themes/kyber/foxes/fox-guard-{THEME[i]}.png", i
            assert (THEMES / rel.removeprefix("themes/")).is_file(), i


def test_fox_guard_recolors_match_the_original_size():
    import shutil
    import subprocess

    import pytest

    if not shutil.which("magick"):
        pytest.skip("ImageMagick is not installed")
    for t in ("crimson", "azure"):
        p = THEMES / f"kyber/foxes/fox-guard-{t}.png"
        out = subprocess.run(["magick", "identify", "-format", "%w %h %A", str(p)],
                             capture_output=True, text=True, check=True).stdout.split()
        assert out[:2] == ["176", "176"], t
        assert out[2].lower() in ("blend", "true"), t
        assert p.stat().st_size < 80_000, t
    assert "fox-guard" in (ROOT / "tools/make-logos.sh").read_text()


def test_wordmarks_take_the_theme_colors():
    """The Settings and new tab wordmarks are the mask filled with the theme's
    colors, not the fixed Kyber Crystal gradient in firefox-wordmark.svg."""
    mask = 'url("chrome://kyberfox/content/themes/kyber/wordmark-mask.svg")'
    for sheet in ("settings.css", "pages.css"):
        css = (THEMES / "kyber" / sheet).read_text(encoding="utf-8")
        assert "firefox-wordmark.svg" not in css, sheet
        assert mask in css, sheet
        assert "var(--kyber-wordmark-a) 60%" in css, sheet
