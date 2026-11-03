"""Patch list handling, rebranding and patch application."""
import re
import subprocess
from pathlib import Path


class UnclassifiedPatch(Exception):
    pass


def read_list(path: Path) -> list[str]:
    """Read a list file: one entry per line, '#' starts a comment."""
    entries = []
    for line in Path(path).read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            entries.append(line)
    return entries


def classify(upstream: list[str], keep: set[str], drop: set[str]) -> list[str]:
    unknown = [p for p in upstream if p not in keep and p not in drop]
    if unknown:
        raise UnclassifiedPatch(
            "unclassified upstream patches (add to keep or drop list): "
            + ", ".join(unknown)
        )
    return [p for p in upstream if p in keep]


# URLs and bare host paths such as codeberg.org/librewolf/source stay as is.
_URL = re.compile(
    r"https?://\S+|\b(?:[\w-]+\.)+(?:org|com|dev|net|io)\b(?:/\S*)?"
)
_BRAND = [("LibreWolf", "Kyber Fox"), ("librewolf", "kyberfox"), ("LIBREWOLF", "KYBERFOX")]


def _rebrand_plain(text: str) -> str:
    for old, new in _BRAND:
        text = text.replace(old, new)
    return text


def rebrand(text: str) -> str:
    out, pos = [], 0
    for m in _URL.finditer(text):
        out.append(_rebrand_plain(text[pos:m.start()]))
        out.append(m.group())
        pos = m.end()
    out.append(_rebrand_plain(text[pos:]))
    return "".join(out)


def apply_patch(tree: Path, patch_file: Path) -> bool:
    """Apply a patch file to tree. A failed patch leaves the tree unchanged."""
    base = ["patch", "-p1", "--no-backup-if-mismatch", "--batch", "-s", "-r", "-", "-i", str(patch_file)]
    dry = subprocess.run(base + ["--dry-run"], cwd=tree, capture_output=True, text=True)
    if dry.returncode != 0:
        return False
    subprocess.run(base, cwd=tree, check=True, capture_output=True)
    return True
