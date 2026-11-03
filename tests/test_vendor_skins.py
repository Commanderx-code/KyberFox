import json
import re
from pathlib import Path

import pytest

from tests.conftest import git_init
from tools import vendor_skins as V

SKINS = Path(__file__).resolve().parent.parent / "themes" / "skins"

MPL = "/* Source file made available under Mozilla Public License v. 2.0 */\n"

FILES = {
    "LICENSE": "Mozilla Public License Version 2.0\n",
    "user.js": (
        '/* Default rules */\n'
        'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);\n'
        'user_pref("svg.context-properties.content.enabled", true);\n'
        'user_pref("browser.tabs.delayHidingAudioPlayingIconMS", 0);\n'
        '// user_pref("not.used", true);\n'
        'user_pref("some.string", "a b");\n'
    ),
    "chrome/userChrome.css": (
        MPL + "@import url('components/root.css');\n"
        "/* @import url('components/commented.css'); */\n"
        "@import url('components/tabs.css');\n"
    ),
    "chrome/userContent.css": "@import url('components/uc.css');\n",
    "chrome/components/root.css": (
        MPL + ":root { --opera4: #16f0c1; --accent: var(--opera4); }\n"
        "/* Opera GX look */\n"
        ".a { background: url('../icons/a.svg'); }\n"
        ".b { background: url('../icons/opera-logo.svg'); }\n"
        ".w { --wall: url('../newtab/wall.png'); }\n"
    ),
    "chrome/components/tabs.css": (
        MPL + '@font-face { font-family: g; src: url("../icons/f.ttf"); }\n'
        ".c { background: url('../icons/sub/c.svg#mask'); }\n"
        "@-moz-document url(chrome://browser/content/places/places.xhtml) { .d { color: red } }\n"
    ),
    "chrome/components/uc.css": ".uc { color: blue }\n",
    "chrome/icons/a.svg": "<svg/>",
    "chrome/icons/opera-logo.svg": "<svg/>",
    "chrome/icons/unused.svg": "<svg/>",
    "chrome/icons/f.ttf": "font",
    "chrome/icons/sub/c.svg": "<svg/>",
    "chrome/newtab/wall.png": "png",
    "README.md": "# Opera GX Skin\n",
}


@pytest.fixture
def upstream(tmp_path):
    repo = tmp_path / "upstream"
    return str(repo), git_init(repo, FILES)


def run(upstream, tmp_path, name="gx"):
    repo, commit = upstream
    dest = tmp_path / "out" / name
    V.vendor(repo, commit, dest)
    return dest


def all_files(root):
    return [p for p in root.rglob("*") if p.is_file()]


def test_vendor_keeps_license(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    assert (dest / "LICENSE").read_text() == FILES["LICENSE"]
    css = (dest / "userChrome.css").read_text()
    assert css.count("Mozilla Public License v. 2.0") == 3  # all three upstream headers


def test_vendor_strips_opera_branding(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    for p in all_files(dest):
        assert "opera" not in p.name.lower(), p
        assert "opera" not in p.read_text(errors="ignore").lower(), p
    assert not (dest / "icons" / "opera-logo.svg").exists()
    css = (dest / "userChrome.css").read_text()
    assert "--vivid4" in css
    assert "background: none" in css  # the rule that used the opera asset


def test_vendor_flattens_and_scopes_to_chrome_documents(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    css = (dest / "userChrome.css").read_text()
    assert "@import url('components" not in css.replace("/* @import url('components/commented.css'); */", "")
    assert "uc.css" not in css and ".uc" not in css
    body = css[css.index("@-moz-document"):]
    assert body.startswith('@-moz-document url-prefix("chrome://") {')
    assert body.rstrip().endswith("}")
    assert 'url("icons/a.svg")' in css
    assert 'url("icons/sub/c.svg#mask")' in css


def test_vendor_copies_only_referenced_assets(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    names = {p.relative_to(dest).as_posix() for p in all_files(dest)}
    assert names == {
        "LICENSE", "skin.json", "userChrome.css", "icons/a.svg", "icons/f.ttf",
        "icons/sub/c.svg",
    } | ({"colors.css"} if (V.EXTRAS_DIR / "gx" / "colors.css").is_file() else set())


def test_vendor_converts_user_js_to_manifest(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    m = json.loads((dest / "skin.json").read_text())
    assert m["id"] == "gx" and m["kind"] == "skin" and m["scheme"] == "dark"
    assert m["prefs"] == {
        "svg.context-properties.content.enabled": True,
        "browser.tabs.delayHidingAudioPlayingIconMS": 0,
        "some.string": "a b",
    }
    assert m["sheets"][-1] == "userChrome.css"


def test_vendor_twice_gives_identical_output(upstream, tmp_path):
    a = run(upstream, tmp_path)
    first = {p.relative_to(a): p.read_bytes() for p in all_files(a)}
    b = run(upstream, tmp_path)
    assert first == {p.relative_to(b): p.read_bytes() for p in all_files(b)}


def test_vendor_rejects_wrong_commit(upstream, tmp_path):
    repo, commit = upstream
    with pytest.raises(Exception):
        V.vendor(repo, "0" * 40, tmp_path / "out" / "gx")


def test_vendor_rejects_remote_urls(tmp_path):
    files = dict(FILES)
    files["chrome/components/root.css"] = ".a { background: url(https://example.com/x.png); }\n"
    repo = tmp_path / "up"
    commit = git_init(repo, files)
    with pytest.raises(V.VendorError):
        V.vendor(str(repo), commit, tmp_path / "out" / "gx")


def test_vendor_rejects_unbalanced_braces(tmp_path):
    files = dict(FILES)
    files["chrome/components/root.css"] = ".a { color: red } } body { color: red"
    repo = tmp_path / "up"
    commit = git_init(repo, files)
    with pytest.raises(V.VendorError):
        V.vendor(str(repo), commit, tmp_path / "out" / "gx")


def test_committed_skins_have_no_opera_and_a_license():
    ids = json.loads((SKINS / "index.json").read_text())["skins"]
    assert ids == ["gx", "one"]
    for i in ids:
        assert (SKINS / i / "LICENSE").read_text().startswith("Mozilla Public License")
        for p in all_files(SKINS / i):
            assert "opera" not in p.name.lower(), p
            if p.suffix in (".css", ".json", ".svg"):
                assert "opera" not in p.read_text(errors="ignore").lower(), p


def test_committed_skins_have_no_remote_urls_and_scoped_sheets():
    for i in ("gx", "one"):
        m = json.loads((SKINS / i / "skin.json").read_text())
        assert "toolkit.legacyUserProfileCustomizations.stylesheets" not in m["prefs"]
        for sheet in m["sheets"]:
            css = (SKINS / i / sheet).read_text()
            code = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
            assert not re.search(r"url\(\s*['\"]?(https?:|//)", code), (i, sheet)
            assert code.lstrip().startswith('@-moz-document url-prefix("chrome://")'), (i, sheet)
            for rel in re.findall(r'url\("(icons/[^"#?)]+)', code):
                assert (SKINS / i / rel).is_file() or rel.startswith(("icons/black", "icons/logo_chat", "icons/convert-range", "icons/tab-bottom-corner-right-australis-clipped")), (i, rel)


def test_pins_are_real_commits():
    from tools.sources import load_pins
    pins = load_pins(Path(__file__).resolve().parent.parent / "pins.toml")
    for c in (pins.gx_commit, pins.one_commit):
        assert re.fullmatch(r"[0-9a-f]{40}", c)
    for i, c in (("gx", pins.gx_commit), ("one", pins.one_commit)):
        assert c in (SKINS / i / "userChrome.css").read_text()
