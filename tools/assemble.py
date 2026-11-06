"""Assemble a Kyber Fox source tree: Firefox + LibreWolf subset + Kyber patches + overlay."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from tools.brand_installer_stub import brand
from tools.patchset import apply_patch, classify, read_list, rebrand
from tools.sources import fetch_firefox, fetch_librewolf, fetch_ublock, load_pins
from tools.staticprefs import move_section_into_order

REPO_ROOT = Path(__file__).resolve().parent.parent

# Copied from settings/ into <tree>/kyberfox/, which patches/kyber/0001-register-component.patch
# adds to the build. LibreWolf's build uses lw/ for the same files.
SETTINGS_FILES = ("kyberfox.cfg", "policies.json", "local-settings.js")

# Firefox installs add-ons from distribution/extensions/<id>.xpi on first run.
# The file is staged in <tree>/kyberfox/ next to the settings and packaged from there.
UBLOCK_ID = "uBlock0@raymondhill.net"

# Removed from the tree, as LibreWolf's build does: the OpenAI backend of the ML component.
REMOVED_PATHS = (
    "toolkit/components/ml/content/backends/OpenAIPipeline.mjs",
    "toolkit/components/ml/vendor/openai",
)

# The 7-Zip stub that the Windows installer starts from, and the icon it gets
# in place of Firefox's setup icon. ARM64 builds use another stub, which is
# left alone: Kyber Fox builds x86_64 only.
INSTALLER_STUB = "other-licenses/7zstub/firefox/7zSD.Win32.sfx"
INSTALLER_ICON = "browser/branding/kyberfox/firefox.ico"

_PATCHED_FILE = re.compile(r"^\+\+\+ b/(\S+)", re.M)
_VENDORED_CRATE = re.compile(r"^(third_party/rust/[^/]+)/(.+)$")


@dataclass
class AssemblyResult:
    tree: Path
    failed: list[str] = field(default_factory=list)


def _extract(tarball: Path, tree: Path) -> None:
    shutil.rmtree(tree, ignore_errors=True)
    tree.mkdir(parents=True)
    subprocess.run(
        ["tar", "-xJf", str(tarball), "--strip-components=1", "-C", str(tree)],
        check=True,
    )


def _apply(tree: Path, name: str, text: str, scratch: Path, result: AssemblyResult,
           allow_failed: bool, touched: set[str], brand: bool = True) -> None:
    """Apply one patch. LibreWolf's patches are rebranded first (brand=True);
    Kyber's own patches are written in Kyber terms and applied as they are, so
    a credit that names LibreWolf (about:license) keeps the name."""
    patch_file = scratch / "current.patch"
    if brand:
        text = rebrand(text)
    patch_file.write_text(text)
    if not apply_patch(tree, patch_file):
        if not allow_failed:
            raise RuntimeError(f"patch failed: {name}")
        result.failed.append(name)
        return
    touched.update(_PATCHED_FILE.findall(text))


def _update_cargo_checksums(tree: Path, touched: set[str]) -> None:
    """Cargo refuses vendored crates whose files no longer match .cargo-checksum.json."""
    for path in sorted(touched):
        m = _VENDORED_CRATE.match(path)
        if not m:
            continue
        crate, rel = tree / m.group(1), m.group(2)
        sums_file = crate / ".cargo-checksum.json"
        if not sums_file.is_file():
            continue
        sums = json.loads(sums_file.read_text())
        target = crate / rel
        if target.is_file():
            sums["files"][rel] = hashlib.sha256(target.read_bytes()).hexdigest()
        else:
            sums["files"].pop(rel, None)
        sums_file.write_text(json.dumps(sums, separators=(",", ":")))


def _follow_collection_pref(tree: Path) -> None:
    """Make every Glean ping obey the data-collection pref, which is off."""
    for yaml in tree.rglob("pings.yaml"):
        text = yaml.read_text()
        if "follows_collection_enabled: false" in text:
            yaml.write_text(text.replace("follows_collection_enabled: false",
                                         "follows_collection_enabled: true"))


# LibreWolf's brandings.ftl lists only its renamed terms. Applying it means
# replacing those terms in the upstream file in place and keeping the rest.
BRANDINGS_L10N = "toolkit/toolkit/branding/brandings.ftl"
# Terms LibreWolf leaves with a Mozilla name; Settings search shows this one.
KYBER_BRAND_TERMS = "-firefoxlabs-brand-name = Labs\n"

_TERM_START = re.compile(r"^(-[A-Za-z0-9_-]+)[ \t]*=", re.MULTILINE)


def _term_blocks(text: str) -> dict[str, tuple[int, int]]:
    """Map each term id to the (start, end) span of its definition: the
    "-id = value" line and any indented continuation lines after it."""
    spans: dict[str, tuple[int, int]] = {}
    for m in _TERM_START.finditer(text):
        end = text.find("\n", m.start())
        end = len(text) if end == -1 else end + 1
        while end < len(text) and text[end] in " \t" and text[end:].strip():
            nl = text.find("\n", end)
            end = len(text) if nl == -1 else nl + 1
        spans[m.group(1)] = (m.start(), end)
    return spans


def _merge_terms(target: Path, source_text: str) -> None:
    """Replace, in place, every term of source_text in the upstream file target."""
    if not target.is_file():
        raise RuntimeError(f"cannot merge terms into {target}: it does not exist")
    upstream = target.read_text(encoding="utf-8")
    for term, (start, end) in sorted(_term_blocks(source_text).items(),
                                     key=lambda kv: kv[1][0]):
        current = _term_blocks(upstream).get(term)
        if current is None:
            raise RuntimeError(f"term {term} is not defined in upstream {target}")
        block = source_text[start:end]
        if not block.endswith("\n"):
            block += "\n"
        upstream = upstream[: current[0]] + block + upstream[current[1]:]
    target.write_text(upstream, encoding="utf-8")


def copy_themes(tree: Path) -> None:
    """Copies themes/ (palettes, base.css, notices) into the Kyber component, after the overlay."""
    themes = REPO_ROOT / "themes"
    if themes.is_dir():
        shutil.copytree(themes, tree / "browser/components/kyberfox/themes", dirs_exist_ok=True)


def copy_recommended_addons(tree: Path) -> None:
    """Copies settings/recommended-addons.json into the Kyber component, for the welcome page."""
    src = REPO_ROOT / "settings" / "recommended-addons.json"
    if not src.is_file():
        raise FileNotFoundError(f"{src} is missing; the welcome page needs it")
    dest = tree / "browser/components/kyberfox"
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest / "recommended-addons.json")


def apply_librewolf_l10n(tree: Path, librewolf: Path) -> list[Path]:
    """Apply LibreWolf's en-US strings, as scripts/librewolf-patches.py does.

    l10n/en-US/<app>/<rest> goes to <app>/locales/en-US/<rest>. A file named
    *.inc.<ext> is appended to the existing target with ".inc" dropped; a
    missing target is an error (LibreWolf only warns). brandings.ftl replaces
    its terms in the upstream file one by one. Any other file is written whole.
    Content is rebranded. Other locales are skipped: release 1 ships en-US only.
    """
    l10n = librewolf / "l10n" / "en-US"
    written: list[Path] = []
    if not l10n.is_dir():
        return written
    for source in sorted(l10n.rglob("*")):
        if source.is_dir() or source.name.endswith(".md"):
            continue
        rel = source.relative_to(l10n)
        app, *rest = rel.parts
        target = tree / app / "locales" / "en-US" / Path(*rest)
        text = rebrand(source.read_text(encoding="utf-8"))
        if rel.as_posix() == BRANDINGS_L10N:
            _merge_terms(target, text)
        elif ".inc" in target.name:
            target = target.with_name(target.name.replace(".inc", ""))
            if not target.is_file():
                raise RuntimeError(f"{source} appends to {target}, which does not exist")
            with open(target, "a", encoding="utf-8") as f:
                f.write("\n\n" + text)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        written.append(target)
        if rel.as_posix() == BRANDINGS_L10N:
            present = _term_blocks(target.read_text(encoding="utf-8"))
            ours = "".join(l + "\n" for l in KYBER_BRAND_TERMS.splitlines()
                           if l.split("=")[0].strip() in present)
            if ours:
                _merge_terms(target, ours)
    return written


def brand_installer(tree: Path) -> None:
    """Puts the Kyber Fox icon on the Windows installer's 7-Zip stub."""
    stub = tree / INSTALLER_STUB
    if stub.is_file():
        stub.write_bytes(brand(stub.read_bytes(), (tree / INSTALLER_ICON).read_bytes()))


def _finish_tree(tree: Path, pins, touched: set[str], ublock: Path) -> None:
    settings = tree / "kyberfox"
    settings.mkdir(exist_ok=True)
    for name in SETTINGS_FILES:
        shutil.copy2(REPO_ROOT / "settings" / name, settings / name)
    shutil.copy2(ublock, settings / f"{UBLOCK_ID}.xpi")
    for rel in REMOVED_PATHS:
        path = tree / rel
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
    _follow_collection_pref(tree)
    brand_installer(tree)
    _update_cargo_checksums(tree, touched)
    prefs = tree / "modules/libpref/init/StaticPrefList.yaml"
    if prefs.is_file():
        move_section_into_order(prefs)
    # Read by display-version.patch through MOZ_APP_VERSION_DISPLAY.
    (tree / "browser/config/version_display.txt").write_text(
        f"{pins.firefox_version}-{pins.kyber_build}\n"
    )


def assemble(pins, workdir: Path, allow_failed: bool = False) -> AssemblyResult:
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    tarball = fetch_firefox(pins, workdir)  # verifies the hash before anything else
    ublock = fetch_ublock(pins, workdir)
    lw = fetch_librewolf(pins, workdir)

    patch_dir = REPO_ROOT / "patches"
    upstream = read_list(lw / "assets" / "patches.txt")
    keep = set(read_list(patch_dir / "librewolf-keep.txt"))
    drop = set(read_list(patch_dir / "librewolf-drop.txt"))
    wanted = classify(upstream, keep, drop)

    tree = workdir / "tree"
    _extract(tarball, tree)
    result = AssemblyResult(tree=tree)
    scratch = workdir / "scratch"
    shutil.rmtree(scratch, ignore_errors=True)
    scratch.mkdir()

    touched: set[str] = set()
    for name in wanted:
        _apply(tree, name, (lw / name).read_text(), scratch, result, allow_failed, touched)

    # LibreWolf's build copies these icons into the tree; patched jar.inc.mn files list them.
    icons = lw / "assets" / "icons"
    if icons.is_dir():
        shutil.copytree(icons, tree / "browser/themes/shared/icons", dirs_exist_ok=True)

    kyber_dir = patch_dir / "kyber"
    for name in read_list(kyber_dir / "series.txt"):
        _apply(tree, f"patches/kyber/{name}", (kyber_dir / name).read_text(),
               scratch, result, allow_failed, touched, brand=False)

    apply_librewolf_l10n(tree, lw)  # before the overlay, so overlay files win

    overlay = REPO_ROOT / "overlay"
    if overlay.is_dir():
        shutil.copytree(overlay, tree, dirs_exist_ok=True)
    copy_themes(tree)
    copy_recommended_addons(tree)
    _finish_tree(tree, pins, touched, ublock)
    shutil.rmtree(scratch, ignore_errors=True)
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workdir", type=Path, default=REPO_ROOT / "work")
    ap.add_argument("--allow-failed", action="store_true")
    args = ap.parse_args(argv)
    result = assemble(load_pins(REPO_ROOT / "pins.toml"), args.workdir, args.allow_failed)
    for name in result.failed:
        print(f"FAILED: {name}", file=sys.stderr)
    print(f"tree: {result.tree}")
    return 1 if result.failed else 0


if __name__ == "__main__":
    sys.exit(main())
