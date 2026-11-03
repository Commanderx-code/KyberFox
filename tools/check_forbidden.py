"""Release guard: fail when telemetry, studies, ads, crash reporting, AI or
LibreWolf hosts appear in the assembled tree. Rules live in rules/forbidden.toml."""
import argparse
import os
import re
import sys
import tomllib
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RULES = REPO_ROOT / "rules" / "forbidden.toml"

_PREF_CALL = r"""(?<![\w.])(?:pref|defaultPref|lockPref|sticky_pref|user_pref)\(\s*["']{name}["']\s*,\s*(?:{value})(?!\w)"""
_PREF_YAML = r"^-\s+name:\s+{name}[ \t]*\n(?:[ \t]+[^\n]*\n)*?[ \t]+value:[ \t]*(?:{value})(?!\w)"


@dataclass(frozen=True)
class Rule:
    id: str
    regex: re.Pattern
    needle: str = ""
    allow: tuple[str, ...] = ()


@dataclass(frozen=True)
class Finding:
    rule: str
    path: str
    line: int


@dataclass(frozen=True)
class Scope:
    roots: tuple[str, ...] = (".",)
    files: tuple[str, ...] = ()
    skip_dirs: tuple[str, ...] = ()


def _rule(entry: dict) -> Rule:
    if "pref" in entry:
        pref = entry["pref"]
        name = re.escape(pref).replace(r"\*", r"[\w.-]*")
        value = entry.get("value", "true")
        regex = re.compile(
            _PREF_CALL.format(name=name, value=value) + "|"
            + _PREF_YAML.format(name=name, value=value),
            re.M,
        )
        needle = pref.split("*", 1)[0]
    else:
        regex = re.compile(entry["pattern"], re.M)
        needle = ""
    return Rule(entry["id"], regex, needle, tuple(entry.get("allow", ())))


def load_rules(path: Path = DEFAULT_RULES) -> list[Rule]:
    data = tomllib.loads(Path(path).read_text())
    return [_rule(entry) for entry in data["rule"]]


def load_scope(path: Path = DEFAULT_RULES) -> Scope:
    data = tomllib.loads(Path(path).read_text())["scan"]
    return Scope(tuple(data["roots"]), tuple(data["files"]), tuple(data["skip_dirs"]))


def _wanted(rel: str, globs: tuple[str, ...]) -> bool:
    if not globs:
        return True
    name = rel.rsplit("/", 1)[-1]
    return any(fnmatch(rel if "/" in g else name, g) for g in globs)


def _files(tree: Path, scope: Scope):
    for root in scope.roots:
        base = tree / root
        if not base.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(
                d for d in dirnames if not any(fnmatch(d, s) for s in scope.skip_dirs)
            )
            for filename in sorted(filenames):
                path = Path(dirpath) / filename
                rel = path.relative_to(tree).as_posix()
                if _wanted(rel, scope.files):
                    yield path, rel


def scan(tree: Path, rules: list[Rule], scope: Scope = Scope()) -> list[Finding]:
    tree = Path(tree)
    findings = []
    for path, rel in _files(tree, scope):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for rule in rules:
            if rule.needle and rule.needle not in text:
                continue
            if any(fnmatch(rel, a) for a in rule.allow):
                continue
            for m in rule.regex.finditer(text):
                findings.append(Finding(rule.id, rel, text.count("\n", 0, m.start()) + 1))
    return findings


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("trees", nargs="+", type=Path, help="assembled tree or repo root")
    ap.add_argument("--rules", type=Path, default=DEFAULT_RULES)
    args = ap.parse_args(argv)
    rules, scope = load_rules(args.rules), load_scope(args.rules)
    findings = []
    for tree in args.trees:
        for f in scan(tree, rules, scope):
            findings.append(f)
            print(f"{tree / f.path}:{f.line}: {f.rule}")
    if findings:
        print(f"{len(findings)} forbidden item(s) found", file=sys.stderr)
        return 1
    print("no forbidden code found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
