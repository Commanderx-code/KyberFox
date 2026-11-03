"""Drift guard: Kyber Fox's strict content-blocking feature list must follow
Firefox's. On a new profile Firefox picks the category by comparing the
feature prefs with each list, so a feature added upstream but missing from
settings/kyberfox.cfg silently turns a new profile into "custom".

The one intended difference is the cookie behavior (Kyber Fox blocks all
third-party cookies), so cookieBehavior* tokens are not compared by value."""
import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PREF = "browser.contentblocking.features.strict"
FIREFOX_JS = "browser/app/profile/firefox.js"
_CALL = r"""(?<![\w.])(?:pref|defaultPref|lockPref|sticky_pref)\(\s*["']%s["']\s*,\s*["']([^"']*)["']\s*\)"""
_COOKIE = re.compile(r"^cookieBehavior(PBM)?\d+$")


def _read_pref(path: Path, name: str) -> str | None:
    m = re.search(_CALL % re.escape(name), path.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def _normalize(value: str) -> list[str]:
    return [("cookieBehavior*" if _COOKIE.match(t) else t) for t in value.split(",")]


def check(tree: Path, cfg: Path) -> list[str]:
    """Return a list of problems; empty means the two lists agree."""
    tree_value = _read_pref(Path(tree) / FIREFOX_JS, PREF)
    cfg_value = _read_pref(Path(cfg), PREF)
    problems = []
    if tree_value is None:
        problems.append(f"{PREF} is not set in {Path(tree) / FIREFOX_JS}")
    if cfg_value is None:
        problems.append(f"{PREF} is not set in {cfg}")
    if tree_value is not None and cfg_value is not None:
        if _normalize(tree_value) != _normalize(cfg_value):
            problems.append(
                f"{PREF} differs (cookieBehavior values ignored):\n"
                f"  Firefox: {tree_value}\n  Kyber:   {cfg_value}"
            )
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("tree", type=Path)
    ap.add_argument("cfg", type=Path, nargs="?", default=REPO_ROOT / "settings" / "kyberfox.cfg")
    args = ap.parse_args(argv)
    problems = check(args.tree, args.cfg)
    for p in problems:
        print(p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
