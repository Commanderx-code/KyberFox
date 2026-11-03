"""Write themes/status.json for a release that ships some skins disabled.

    python -m tools.set_disabled_skins "gx,one"            # rewrite themes/status.json
    python -m tools.set_disabled_skins "" --out out.json   # empty list

The ids must be known palettes or skins. An empty argument writes an empty list.
"""
import argparse
import json
import sys
from pathlib import Path

THEMES = Path(__file__).resolve().parent.parent / "themes"


def known_ids() -> set[str]:
    palettes = json.loads((THEMES / "palettes.json").read_text(encoding="utf-8"))
    skins = json.loads((THEMES / "skins" / "index.json").read_text(encoding="utf-8"))["skins"]
    return set(palettes) | set(skins)


def parse_ids(text: str) -> list[str]:
    ids = []
    for part in text.split(","):
        part = part.strip()
        if part and part not in ids:
            ids.append(part)
    unknown = sorted(set(ids) - known_ids())
    if unknown:
        raise ValueError(f"unknown theme or skin id: {', '.join(unknown)}")
    return ids


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("ids", help="comma-separated ids to disable; empty for none")
    p.add_argument("--out", type=Path, default=THEMES / "status.json")
    args = p.parse_args(argv)
    try:
        ids = parse_ids(args.ids)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    args.out.write_text(json.dumps({"disabled": ids}, indent=2) + "\n", encoding="utf-8")
    print(f"disabled: {', '.join(ids) or '(none)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
