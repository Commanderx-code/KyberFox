"""Vendor the GX-style and One-style skins into themes/skins/<id>/.

The upstream userChrome.css is a list of @import lines. A user sheet
registered through nsIStyleSheetService applies to every document, and an
@import cannot sit inside @-moz-document, so the tool flattens the import
tree into one userChrome.css and wraps it in a rule that limits it to
chrome:// documents (the browser window and its dialogs). Image, icon and
font files the CSS refers to are copied; nothing else is.

Run `python -m tools.vendor_skins [gx|one|all]` to rewrite the committed
output from the commits pinned in pins.toml. A rerun on the same pins gives
no diff.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from tools.sources import load_pins

REPO_ROOT = Path(__file__).resolve().parent.parent
SKINS_DIR = REPO_ROOT / "themes" / "skins"
EXTRAS_DIR = Path(__file__).resolve().parent / "skin_extras"

CHROME_BASE = "chrome://kyberfox/content/themes/skins/"
SCOPE = '@-moz-document url-prefix("chrome://")'
# Directories whose images only serve about: pages (userContent.css side,
# not shipped in release 1). References to them become `none`.
SKIPPED_ASSET_DIRS = {"newtab"}
# Prefs that only make Firefox read userChrome.css; sheets are registered directly.
DROPPED_PREFS = {
    "toolkit.legacyUserProfileCustomizations.stylesheets",
    # Web-exposed; chrome:// images already get SVG context paint.
    "svg.context-properties.content.enabled",
    # Nightly-only CSS feature, exposed to web content on release. Corners degrade.
    "layout.css.corner-shape.enabled",
    # Only upstream's unshipped new-tab CSS needs it.
    "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar",
}
# Fonts are never copied: the ones upstream ships are not MPL.
FONT_SUFFIXES = (".ttf", ".otf", ".woff", ".woff2")


class SkinMismatch(Exception):
    pass


class VendorError(Exception):
    pass


@dataclass(frozen=True)
class SkinInfo:
    id: str
    name: str
    repo: str
    pin_key: str
    scheme: str
    vars: dict
    # Prefs added to the converted user.js. They switch off upstream's own
    # light and dark color defaults, which follow the OS and not color-scheme.
    extra_prefs: dict = field(default_factory=dict)


# vars feed the picker preview card (same keys as palettes.json).
SKINS = {
    "gx": SkinInfo(
        "gx", "GX-style", "https://github.com/Godiesc/firefox-gx", "gx_commit", "dark",
        {
            "--kf-bg": "#0d0d14", "--kf-bg-toolbar": "#16161f",
            "--kf-bg-tab-active": "#1f1f2b", "--kf-bg-urlbar": "#1f1f2b",
            "--kf-fg": "#f2f2f7", "--kf-fg-muted": "#a9a9ba",
            "--kf-accent": "#fa1e4e", "--kf-border": "#2c2c3a",
            "--kf-radius": "0px", "--kf-font": "inherit", "--kf-bg-image": "none",
        },
    ),
    "one": SkinInfo(
        "one", "One-style", "https://github.com/Godiesc/firefox-one", "one_commit", "dark",
        {
            "--kf-bg": "#09080d", "--kf-bg-toolbar": "#120f19",
            "--kf-bg-tab-active": "#1d1927", "--kf-bg-urlbar": "#1d1927",
            "--kf-fg": "#f4f2f7", "--kf-fg-muted": "#aaa4b8",
            "--kf-accent": "#4c4cff", "--kf-border": "#2a2536",
            "--kf-radius": "8px", "--kf-font": "inherit", "--kf-bg-image": "none",
        },
        {"firefoxone.without-default-colors": True},
    ),
}

_COMMENT_OR_IMPORT = re.compile(
    r"/\*.*?\*/|@import\s+url\(\s*(['\"]?)(?P<path>[^'\")]+)\1\s*\)\s*;", re.S)
_COMMENT_OR_URL = re.compile(
    r"/\*.*?\*/|@import\s+url\([^)]*\)\s*;|url\(\s*(?P<q>['\"]?)(?P<path>[^'\")]*)(?P=q)\s*\)", re.S)
_OPERA_VAR = re.compile(r"--opera(\d)")
_OPERA = re.compile(r"opera[-_ ]?", re.I)
_REMOTE = ("http:", "https:", "//", "ftp:", "file:")
_KEEP = ("chrome:", "data:", "resource:", "about:", "moz-icon:", "#", "var(")


@dataclass
class _State:
    root: Path
    assets: set = field(default_factory=set)
    edits: list = field(default_factory=list)
    dropped_families: set = field(default_factory=set)
    # Absolute chrome:// base of the skin. Relative url()s inside custom
    # properties resolve against the sheet that uses the property, which can
    # be a Firefox one (a missing-resource crash), so every url() is absolute.
    base: str = ""


def _git(args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def _clone(repo: str, commit: str, dest: Path) -> None:
    """Fetch exactly commit into the empty dir dest and check it out."""
    _git(["init", "-q"], dest)
    _git(["remote", "add", "origin", repo], dest)
    _git(["fetch", "-q", "--depth", "1", "origin", commit], dest)
    out = subprocess.run(["git", "rev-parse", "FETCH_HEAD^{commit}"], cwd=dest,
                         check=True, capture_output=True, text=True)
    fetched = out.stdout.strip()
    if fetched != commit:
        raise SkinMismatch(f"{repo}: expected commit {commit}, got {fetched}")
    _git(["-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"], dest)


def _resolve_ci(base: Path, raw: str):
    """base/raw, matching each part case-insensitively when the exact path is
    missing (upstream is developed on Windows). Returns (path, was_exact)."""
    exact = (base / raw).resolve()
    if exact.exists():
        return exact, True
    cur = base.resolve()
    for part in Path(raw).parts:
        if part == "..":
            cur = cur.parent
            continue
        if part == ".":
            continue
        match = next((c for c in cur.iterdir() if c.name.lower() == part.lower()), None) \
            if cur.is_dir() else None
        if match is None:
            return exact, True
        cur = match
    return cur.resolve(), False


_FONT_FACE = re.compile(r"@font-face\s*\{[^{}]*\}", re.S)
_FAMILY = re.compile(r"font-family\s*:\s*(['\"]?)([^;'\"}]+)\1", re.I)


def _drop_fonts(text: str, st: "_State") -> str:
    """Remove @font-face rules that load a font file; remember their families."""
    def sub(m):
        rule = m.group(0)
        if not re.search(r"url\([^)]*\.(ttf|otf|woff2?)\b", rule, re.I):
            return rule
        fam = _FAMILY.search(rule)
        if fam:
            st.dropped_families.add(fam.group(2).strip())
        st.edits.append(f"@font-face for {fam.group(2).strip() if fam else '?'} removed "
                        "(its font file is not MPL); the family falls back to sans-serif")
        return "/* font removed */"
    return _FONT_FACE.sub(sub, text)


def _rewrite_urls(text: str, file: Path, st: _State) -> str:
    """Make url() paths relative to the chrome root and note the files used."""
    def sub(m):
        if m.group(0).startswith(("/*", "@import")):
            return m.group(0)
        raw = m.group("path").strip()
        low = raw.lower()
        if low.startswith(_REMOTE):
            raise VendorError(f"{file}: remote url({raw}) is not allowed")
        if not raw or low.startswith(_KEEP):
            return m.group(0)
        raw, sep, frag = re.match(r"([^#?]*)([#?]?)(.*)", raw, re.S).groups()
        target, exact = _resolve_ci(file.parent, raw)
        try:
            rel = target.relative_to(st.root.resolve())
        except ValueError:
            raise VendorError(f"{file}: url({raw}) leaves the chrome folder")
        if rel.parts[0] in SKIPPED_ASSET_DIRS or "opera" in str(rel).lower():
            st.edits.append(f"url({rel.as_posix()}) replaced by none")
            return "none"
        if not target.is_file():
            # A missing chrome:// file crashes the browser under automation.
            st.edits.append(f"url({rel.as_posix()}) in {file.name} replaced by none "
                            "(the file is missing upstream)")
            return "none"
        if rel.suffix.lower() in FONT_SUFFIXES:
            raise VendorError(f"{file}: url({raw}) loads a font file")
        if not exact:
            st.edits.append(f"url({raw}) in {file.name} matched {rel.as_posix()} "
                            "ignoring case")
        st.assets.add(rel)
        return f'url("{st.base}{rel.as_posix()}{sep}{frag}")'
    return _COMMENT_OR_URL.sub(sub, text)


def _inline(file: Path, st: _State, seen: tuple = ()) -> str:
    file = file.resolve()
    if file in seen:
        raise VendorError(f"{file}: @import cycle")
    text = _drop_fonts(file.read_text(encoding="utf-8"), st)
    text = _rewrite_urls(text, file, st)

    def sub(m):
        if m.group(0).startswith("/*"):
            return m.group(0)
        target, _ = _resolve_ci(file.parent, m.group("path"))
        if st.root.resolve() not in target.parents or not target.is_file():
            raise VendorError(f"{file}: bad @import {m.group('path')}")
        return f"/* ---- {target.relative_to(st.root.resolve()).as_posix()} ---- */\n" \
               + _inline(target, st, seen + (file,))
    return _COMMENT_OR_IMPORT.sub(sub, text)


def _strip_opera(css: str, st: _State) -> str:
    """Remove the brand name from names and comments."""
    renamed = _OPERA_VAR.sub(r"--vivid\1", css)
    if renamed != css:
        st.edits.append("custom properties --operaN renamed --vividN")

    def comment(m):
        return _OPERA.sub("", m.group(0)) if m.group(0).startswith("/*") else m.group(0)
    renamed = _COMMENT_OR_URL.sub(comment, renamed)
    if re.search("opera", renamed, re.I):
        raise VendorError("an Opera reference remains outside comments")
    return renamed


def _use_fallback_font(css: str, st: _State) -> str:
    for fam in st.dropped_families:
        css = re.sub(r"(font-family\s*:\s*)(['\"])" + re.escape(fam) + r"\2",
                     r"\1sans-serif", css)
    return css


def _check_clean(css: str) -> None:
    """Nothing may remain that would load more, or break out of the scope."""
    code = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    m = re.search(r"@(import|namespace|charset)\b", code, re.I)
    if m:
        raise VendorError(f"@{m.group(1)} remains after flattening")
    m = re.search(r"""["'](?:https?:)?//[^"'\s]""", code, re.I)
    if m:
        raise VendorError(f"remote URL in a string: {code[m.start():m.start() + 40]!r}")
    if re.search(r"url\(\s*['\"]?[^)]*\.(ttf|otf|woff2?)\b", code, re.I):
        raise VendorError("a font file is still referenced")


def _check_no_symlinks(src: Path) -> None:
    """A link in the checkout could lead the copy outside chrome/."""
    for p in src.rglob("*"):
        if ".git" in p.relative_to(src).parts:
            continue
        if p.is_symlink():
            raise VendorError(f"{p.relative_to(src)}: symlinks are not allowed")


def _check_no_dangling(css: str, dest: Path, base: str) -> None:
    """Every url() into the skin must name a file that exists (exact case)."""
    code = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for m in re.finditer(r"url\(\s*[\"']?" + re.escape(base) + r"([^\"')#?]+)", code):
        rel = Path(m.group(1))
        cur = dest
        for part in rel.parts:
            if part not in (c.name for c in cur.iterdir()):
                raise VendorError(f"url({base}{rel}) names a missing file")
            cur = cur / part


def _check_braces(css: str) -> None:
    """The wrapper only holds if the sheet's braces balance."""
    bare = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    bare = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', bare)
    depth = 0
    for ch in bare:
        depth += (ch == "{") - (ch == "}")
        if depth < 0:
            raise VendorError("unbalanced } in upstream CSS")
    if depth:
        raise VendorError("unbalanced { in upstream CSS")


def _parse_user_js(text: str) -> dict:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    prefs = {}
    for m in re.finditer(r'^\s*user_pref\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)\s*;', text, re.M):
        name, raw = m.groups()
        if name in DROPPED_PREFS:
            continue
        value = json.loads(raw)
        if isinstance(value, float):
            raise VendorError(f"{name}: non-integer number {raw}")
        prefs[name] = value
    return prefs


def _vendor(repo: str, commit: str, dest: Path) -> list:
    """Do the work; return the list of edits for NOTICES.md."""
    dest = Path(dest)
    info = SKINS.get(dest.name) or SkinInfo(dest.name, dest.name, repo, "", "dark", {})
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "src"
        src.mkdir()
        _clone(repo, commit, src)
        _check_no_symlinks(src)
        chrome = src / "chrome"
        if not (chrome / "userChrome.css").is_file():
            raise VendorError(f"{repo}: no chrome/userChrome.css")
        st = _State(root=chrome, base=f"{CHROME_BASE}{dest.name}/")
        body = _inline(chrome / "userChrome.css", st)
        body = _strip_opera(body, st)
        body = _use_fallback_font(body, st)
        _check_clean(body)
        _check_braces(body)
        css = (f"/* Vendored at upstream commit {commit} (MPL-2.0, see LICENSE and\n"
               f"   themes/NOTICES.md). The import tree is flattened and limited to\n"
               f"   chrome:// documents. */\n"
               f"{SCOPE} {{\n{body}\n}}\n")
        prefs = {}
        user_js = src / "user.js"
        if user_js.is_file():
            prefs = _parse_user_js(user_js.read_text(encoding="utf-8"))
        shutil.rmtree(dest, ignore_errors=True)
        dest.mkdir(parents=True)
        shutil.copy2(src / "LICENSE", dest / "LICENSE")
        (dest / "userChrome.css").write_text(css, encoding="utf-8")
        for rel in sorted(st.assets):
            if rel.suffix.lower() in FONT_SUFFIXES:
                raise VendorError(f"{rel}: font files are not copied")
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(chrome / rel, out)
    _check_no_dangling(css, dest, f"{CHROME_BASE}{dest.name}/")
    sheets = ["userChrome.css"]
    colors = EXTRAS_DIR / dest.name / "colors.css"
    if colors.is_file():
        shutil.copy2(colors, dest / "colors.css")
        sheets.insert(0, "colors.css")
    prefs.update(info.extra_prefs)
    manifest = {"id": info.id, "name": info.name, "kind": "skin", "scheme": info.scheme,
                "sheets": sheets, "prefs": prefs, "vars": info.vars}
    (dest / "skin.json").write_text(_dump(manifest))
    return st.edits


def vendor(repo: str, commit: str, dest: Path) -> None:
    """Write the skin from repo at commit into dest (themes/skins/<id>)."""
    _vendor(repo, commit, dest)


def _dump(data) -> str:
    """json.dumps with short arrays of scalars on one line, as Prettier writes them."""
    text = json.dumps(data, indent=2)
    return re.sub(r"\[\s*((?:\"[^\"\n]*\",?\s*)+)\]",
                  lambda m: "[" + ", ".join(re.findall(r'"[^"\n]*"', m.group(1))) + "]", text) + "\n"


def write_index(skins_dir: Path = SKINS_DIR) -> None:
    ids = sorted(p.parent.name for p in skins_dir.glob("*/skin.json"))
    (skins_dir / "index.json").write_text(_dump({"skins": ids}))


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    which = argv[0] if argv else "all"
    ids = list(SKINS) if which == "all" else [which]
    if any(i not in SKINS for i in ids):
        print(f"unknown skin {which!r}; use gx, one or all", file=sys.stderr)
        return 2
    pins = load_pins(REPO_ROOT / "pins.toml")
    for i in ids:
        info = SKINS[i]
        commit = getattr(pins, info.pin_key)
        edits = _vendor(info.repo, commit, SKINS_DIR / i)
        print(f"{i}: {commit}")
        for e in edits:
            print(f"  {e}")
    write_index()
    return 0


if __name__ == "__main__":
    sys.exit(main())
