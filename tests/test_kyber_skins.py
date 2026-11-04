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
SHARED = ["base.css", "kyber/fonts.css", "kyber/chrome.css", "kyber/pages.css"]


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
