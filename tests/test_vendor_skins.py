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
        'user_pref("layout.css.corner-shape.enabled", true);\n'
        'user_pref("browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar", false);\n'
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
        ".g { font-family: 'g'; } .h { font-family: \"g\", serif; }\n"
        ".r { background: url('../icons/Case.SVG'); }\n"
        "@-moz-document url(chrome://browser/content/places/places.xhtml) { .d { color: red } }\n"
    ),
    "chrome/components/uc.css": ".uc { color: blue }\n",
    "chrome/icons/a.svg": "<svg/>",
    "chrome/icons/opera-logo.svg": "<svg/>",
    "chrome/icons/unused.svg": "<svg/>",
    "chrome/icons/f.ttf": "Copyright (c) 2021 Opera Norway AS",
    "chrome/icons/case.svg": "<svg/>",
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
    base = "chrome://kyberfox/content/themes/skins/gx/"
    assert f'url("{base}icons/a.svg")' in css
    assert f'url("{base}icons/sub/c.svg#mask")' in css


def test_vendor_copies_only_referenced_assets(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    names = {p.relative_to(dest).as_posix() for p in all_files(dest)}
    assert names == {
        "LICENSE", "skin.json", "userChrome.css", "icons/a.svg", "icons/case.svg",
        "icons/sub/c.svg",
    } | ({"colors.css"} if (V.EXTRAS_DIR / "gx" / "colors.css").is_file() else set())


def test_vendor_converts_user_js_to_manifest(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    m = json.loads((dest / "skin.json").read_text())
    assert m["id"] == "gx" and m["kind"] == "skin" and m["scheme"] == "dark"
    assert m["prefs"] == {
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
    assert ids == ["gx", "one", "kyber-crystal", "kyber-crimson", "kyber-azure"]
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
            base = f"chrome://kyberfox/content/themes/skins/{i}/"



def test_committed_skins_have_no_dangling_urls():
    for i in ("gx", "one"):
        base = f"chrome://kyberfox/content/themes/skins/{i}/"
        code = re.sub(r"/\*.*?\*/", "", (SKINS / i / "userChrome.css").read_text(), flags=re.S)
        urls = re.findall(r'url\("' + re.escape(base) + r'([^"#?)]+)', code)
        assert urls
        for rel in urls:
            cur = SKINS / i
            for part in Path(rel).parts:
                assert part in [c.name for c in cur.iterdir()], (i, rel)
                cur = cur / part


def test_pins_are_real_commits():
    from tools.sources import load_pins
    pins = load_pins(Path(__file__).resolve().parent.parent / "pins.toml")
    for c in (pins.gx_commit, pins.one_commit):
        assert re.fullmatch(r"[0-9a-f]{40}", c)
    for i, c in (("gx", pins.gx_commit), ("one", pins.one_commit)):
        assert c in (SKINS / i / "userChrome.css").read_text()


def test_vendor_never_copies_fonts_and_falls_back(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    assert not [p for p in all_files(dest) if p.suffix.lower() in (".ttf", ".otf", ".woff", ".woff2")]
    css = (dest / "userChrome.css").read_text()
    assert "@font-face" not in css and ".ttf" not in css
    assert ".g { font-family: sans-serif; }" in css
    assert '.h { font-family: sans-serif, serif; }' in css


def test_vendor_matches_asset_names_ignoring_case(upstream, tmp_path):
    dest = run(upstream, tmp_path)
    css = (dest / "userChrome.css").read_text()
    assert 'url("chrome://kyberfox/content/themes/skins/gx/icons/case.svg")' in css


def vendor_with(tmp_path, **replace):
    files = dict(FILES)
    files.update(replace)
    repo = tmp_path / "up"
    commit = git_init(repo, files)
    V.vendor(str(repo), commit, tmp_path / "out" / "gx")


@pytest.mark.parametrize("css", [
    '@import "x.css";',
    "@import url(x.css) screen;",
    '@namespace url("http://www.w3.org/1999/xhtml");',
    '@charset "utf-8";',
    '.a { content: "https://example.com/x"; }',
    ".a { content: '//example.com/x'; }",
    ".a { background: image-set(\"https://example.com/x.png\" 1x); }",
])
def test_vendor_rejects_leftover_imports_and_remote_strings(tmp_path, css):
    with pytest.raises(V.VendorError):
        vendor_with(tmp_path, **{"chrome/components/root.css": css + "\n"})


def test_vendor_rejects_non_integer_numbers_in_prefs(tmp_path):
    with pytest.raises(V.VendorError):
        vendor_with(tmp_path, **{"user.js": 'user_pref("a.b", 1.5);\n'})


def test_committed_skins_ship_no_opera_bytes_and_no_fonts():
    for p in SKINS.rglob("*"):
        if not p.is_file():
            continue
        assert p.suffix.lower() not in (".ttf", ".otf", ".woff", ".woff2"), p
        data = p.read_bytes().lower()
        for enc in ("ascii", "utf-16-le", "utf-16-be"):
            assert "opera".encode(enc) not in data, (p, enc)


def test_vendor_replaces_urls_to_missing_files_with_none(tmp_path):
    vendor_with(tmp_path, **{
        "chrome/components/root.css": ".a { background: url('../icons/nope.svg'); }\n"
                                       ".b { background: url('../icons/a.svg'); }\n"})
    css = (tmp_path / "out" / "gx" / "userChrome.css").read_text()
    assert ".a { background: none; }" in css
    assert "nope" not in css


def _repo_with_symlink(tmp_path, target):
    import os
    import subprocess
    repo = tmp_path / "up"
    git_init(repo, FILES)
    os.symlink(target, repo / "chrome" / "icons" / "link.svg")
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid"}
    for cmd in (["add", "-A"], ["commit", "-q", "-m", "link"]):
        subprocess.run(["git", *cmd], cwd=repo, env=env, check=True)
    out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, check=True,
                         capture_output=True, text=True)
    return str(repo), out.stdout.strip()


@pytest.mark.parametrize("target", ["a.svg", "/etc/hostname"])
def test_vendor_rejects_symlinks_in_the_checkout(tmp_path, target):
    repo, commit = _repo_with_symlink(tmp_path, target)
    with pytest.raises(V.VendorError, match="symlink"):
        V.vendor(repo, commit, tmp_path / "out" / "gx")
