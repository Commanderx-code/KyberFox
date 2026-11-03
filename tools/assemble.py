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

from tools.patchset import apply_patch, classify, read_list, rebrand
from tools.sources import fetch_firefox, fetch_librewolf, load_pins

REPO_ROOT = Path(__file__).resolve().parent.parent

# Copied from settings/ into <tree>/kyberfox/, which patches/kyber/0001-register-component.patch
# adds to the build. LibreWolf's build uses lw/ for the same files.
SETTINGS_FILES = ("kyberfox.cfg", "policies.json", "local-settings.js")

# Removed from the tree, as LibreWolf's build does: the OpenAI backend of the ML component.
REMOVED_PATHS = (
    "toolkit/components/ml/content/backends/OpenAIPipeline.mjs",
    "toolkit/components/ml/vendor/openai",
)

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
           allow_failed: bool, touched: set[str]) -> None:
    patch_file = scratch / "current.patch"
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


def _finish_tree(tree: Path, pins, touched: set[str]) -> None:
    settings = tree / "kyberfox"
    settings.mkdir(exist_ok=True)
    for name in SETTINGS_FILES:
        shutil.copy2(REPO_ROOT / "settings" / name, settings / name)
    for rel in REMOVED_PATHS:
        path = tree / rel
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
    _follow_collection_pref(tree)
    _update_cargo_checksums(tree, touched)
    # Read by display-version.patch through MOZ_APP_VERSION_DISPLAY.
    (tree / "browser/config/version_display.txt").write_text(
        f"{pins.firefox_version}-{pins.kyber_build}\n"
    )


def assemble(pins, workdir: Path, allow_failed: bool = False) -> AssemblyResult:
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    tarball = fetch_firefox(pins, workdir)  # verifies the hash before anything else
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
               scratch, result, allow_failed, touched)

    overlay = REPO_ROOT / "overlay"
    if overlay.is_dir():
        shutil.copytree(overlay, tree, dirs_exist_ok=True)
    _finish_tree(tree, pins, touched)
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
