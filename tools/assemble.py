"""Assemble a Kyber Fox source tree: Firefox + LibreWolf subset + Kyber patches + overlay."""
import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from tools.patchset import apply_patch, classify, read_list, rebrand
from tools.sources import fetch_firefox, fetch_librewolf, load_pins

REPO_ROOT = Path(__file__).resolve().parent.parent


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
           allow_failed: bool) -> None:
    patch_file = scratch / "current.patch"
    patch_file.write_text(rebrand(text))
    if not apply_patch(tree, patch_file):
        if not allow_failed:
            raise RuntimeError(f"patch failed: {name}")
        result.failed.append(name)


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

    for name in wanted:
        _apply(tree, name, (lw / name).read_text(), scratch, result, allow_failed)

    # LibreWolf's build copies these icons into the tree; patched jar.inc.mn files list them.
    icons = lw / "assets" / "icons"
    if icons.is_dir():
        shutil.copytree(icons, tree / "browser/themes/shared/icons", dirs_exist_ok=True)

    kyber_dir = patch_dir / "kyber"
    for name in read_list(kyber_dir / "series.txt"):
        _apply(tree, f"patches/kyber/{name}", (kyber_dir / name).read_text(),
               scratch, result, allow_failed)

    overlay = REPO_ROOT / "overlay"
    if overlay.is_dir():
        shutil.copytree(overlay, tree, dirs_exist_ok=True)
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
