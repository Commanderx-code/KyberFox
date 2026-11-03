"""Upstream watch: notice new Firefox, LibreWolf and uBlock Origin releases.

--check prints what is pinned and what is newest. --bump rewrites the two
Firefox values in pins.toml, assembles the tree with failed patches allowed,
and writes upstream-watch-report.md. The workflow opens the pull request.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from tools.patchset import read_list
from tools.sources import LIBREWOLF_URL, HashMismatch, LibreWolfMismatch, Pins, load_pins

REPO_ROOT = Path(__file__).resolve().parent.parent
PINS = REPO_ROOT / "pins.toml"
REPORT = "upstream-watch-report.md"

DETAILS_URL = "https://product-details.mozilla.org/1.0/firefox_versions.json"
SUMS_URL = "https://archive.mozilla.org/pub/firefox/releases/{v}/SHA256SUMS"
LIBREWOLF_TAGS_URL = "https://codeberg.org/api/v1/repos/librewolf/source/tags?limit=50"
UBLOCK_LATEST_URL = "https://api.github.com/repos/gorhill/uBlock/releases/latest"

_VERSION = re.compile(r"[0-9]+\.[0-9]+(\.[0-9]+)?")
_TAG = re.compile(r"([0-9]+(?:\.[0-9]+)*)-([0-9]+)")
_SHA256 = re.compile(r"[0-9a-f]{64}")


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split("."))


def check_version(text) -> str:
    """Return text if it is a plain ASCII Firefox version, else raise."""
    if not isinstance(text, str) or not _VERSION.fullmatch(text):
        raise ValueError(f"not a Firefox version: {text!r}")
    return text


def latest_firefox(details: dict) -> str:
    return check_version(details["LATEST_FIREFOX_VERSION"])


def needs_update(pins: Pins, latest: str) -> bool:
    return _version(latest) > _version(pins.firefox_version)


def is_security_release(old: str, new: str) -> bool:
    """A patch bump inside one major version: 159.0 -> 159.0.1, 159.0.1 -> 159.0.2."""
    a, b = _version(old), _version(new)
    return a[0] == b[0] and b > a and len(b) >= 3


def bump_pins(path: Path, version: str, sha256: str) -> None:
    """Rewrite the [firefox] version and sha256 values; every other byte stays."""
    check_version(version)
    if not _SHA256.fullmatch(sha256):
        raise ValueError(f"not a SHA-256 digest: {sha256!r}")
    text = Path(path).read_bytes().decode()
    headers = list(re.finditer(r"(?m)^\[firefox\][ \t]*\r?$", text))
    if len(headers) != 1:
        raise ValueError(f"{path}: expected one [firefox] table, found {len(headers)}")
    start = headers[0].end()
    nxt = re.search(r"(?m)^\[", text[start:])
    end = start + nxt.start() if nxt else len(text)
    body = text[start:end]
    for key, value in (("version", version), ("sha256", sha256)):
        body, n = re.subn(rf'(?m)^({key}[ \t]*=[ \t]*)"[^"\r\n]*"',
                          lambda m: f'{m[1]}"{value}"', body)
        if n != 1:
            raise ValueError(f"{path}: [firefox] needs exactly one {key}, found {n}")
    Path(path).write_bytes((text[:start] + body + text[end:]).encode())


def verify_branch_diff(diff: str) -> None:
    """Accept only a diff that changes the two [firefox] values and nothing else."""
    old, new = [], []
    for line in diff.splitlines():
        if line.startswith(("--- ", "+++ ")) or not line.startswith(("-", "+")):
            continue
        (old if line[0] == "-" else new).append(line[1:])
    pat = (r'version\s*=\s*"[0-9]+\.[0-9]+(\.[0-9]+)?"', r'sha256\s*=\s*"[0-9a-f]{64}"')
    for side in (old, new):
        if len(side) != 2 or not all(re.fullmatch(p, l) for p, l in zip(pat, side)):
            raise ValueError("branch changes more than the two [firefox] values")


def latest_librewolf(tags_json: list) -> str | None:
    """Newest <firefox version>-<n> tag, or None when no tag has that shape."""
    best = None
    for tag in tags_json:
        m = _TAG.fullmatch(tag.get("name", ""))
        if m:
            key = (_version(m[1]), int(m[2]))
            if best is None or key > best[0]:
                best = (key, tag["name"])
    return best[1] if best else None


def latest_ublock(release_json: dict) -> tuple[str, str | None]:
    """(version, sha256 of the signed Firefox XPI or None) from a GitHub release."""
    version = release_json["tag_name"].lstrip("v")
    want = f"uBlock0_{version}.firefox.signed.xpi"
    for asset in release_json.get("assets", []):
        if asset.get("name") == want:
            digest = asset.get("digest") or ""
            return version, digest.removeprefix("sha256:") or None
    return version, None


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "kyber-fox-upstream-watch"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def fetch_json(url: str):
    return json.loads(_get(url))


def fetch_sha256(version: str) -> str:
    """SHA-256 of the source tarball, from the SHA256SUMS next to the release."""
    want = f"source/firefox-{version}.source.tar.xz"
    for line in _get(SUMS_URL.format(v=version)).decode().splitlines():
        digest, _, name = line.partition("  ")
        if name.strip() == want:
            digest = digest.strip()
            if not _SHA256.fullmatch(digest):
                raise RuntimeError(f"bad digest for {want}: {digest!r}")
            return digest
    raise RuntimeError(f"no {want} line in SHA256SUMS for {version}")


def unclassified_for_ref(ref: str) -> list[str]:
    """Patch names in LibreWolf's patches.txt at ref that neither list classifies."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", ref,
                        LIBREWOLF_URL, tmp], check=True)
        upstream = read_list(Path(tmp) / "assets" / "patches.txt")
    keep = set(read_list(REPO_ROOT / "patches" / "librewolf-keep.txt"))
    drop = set(read_list(REPO_ROOT / "patches" / "librewolf-drop.txt"))
    return [p for p in upstream if p not in keep and p not in drop]


def _best_effort(fn, *args):
    """Side checks must not fail the watch when Codeberg or GitHub is down."""
    try:
        return fn(*args)
    except Exception as exc:  # noqa: BLE001
        print(f"warning: {fn.__name__}: {exc}", file=sys.stderr)
        return None


def gather(pins: Pins) -> dict:
    latest = latest_firefox(fetch_json(DETAILS_URL))
    return _info(pins, latest)


def _info(pins: Pins, latest: str) -> dict:
    newer = needs_update(pins, latest)
    tags = _best_effort(fetch_json, LIBREWOLF_TAGS_URL)
    release = _best_effort(fetch_json, UBLOCK_LATEST_URL)
    lw_latest = _best_effort(latest_librewolf, tags) if tags else None
    ub_latest = _best_effort(latest_ublock, release) if release else None
    return {
        "firefox": {
            "pinned": pins.firefox_version,
            "latest": latest,
            "newer": newer,
            "security": newer and is_security_release(pins.firefox_version, latest),
        },
        "librewolf": {"pinned_ref": pins.librewolf_ref, "latest": lw_latest},
        "ublock": {"pinned": pins.ublock_version,
                   "latest": ub_latest[0] if ub_latest else None},
    }


def _write_report(info: dict, failed: list[str], unclassified: list[str],
                  error: str | None, out: Path) -> None:
    ff, lw, ub = info["firefox"], info["librewolf"], info["ublock"]
    lines = [f"Firefox {ff['pinned']} to {ff['latest']}.", ""]
    if error:
        lines += [f"Assembly stopped: {error}", "",
                  "No tree was built, so the failed patch list is unknown.", ""]
    else:
        lines.append("Patches that failed to apply on the new tree:")
        lines += [f"- {n}" for n in failed] or ["- none"]
        lines.append("")
    lines.append("Pinned LibreWolf: " + lw["pinned_ref"])
    if lw["latest"] and lw["latest"] != lw["pinned_ref"]:
        lines.append(f"Newer LibreWolf tag: {lw['latest']} (pin it with its commit by hand).")
        lines.append("Upstream patches not yet in the keep or drop list:")
        lines += [f"- {n}" for n in unclassified] or ["- none"]
    if ub["latest"] and ub["latest"] != ub["pinned"]:
        lines += ["", f"Newer uBlock Origin: {ub['latest']} (pinned {ub['pinned']}). "
                  "Bump by hand and run browser_shield.js."]
    out.write_text("\n".join(lines) + "\n")


def bump(pins_path: Path, report_dir: Path, version: str) -> dict:
    """Pin version, assemble, and write the report. version comes from --check."""
    from tools import assemble as assemble_mod  # late: keeps --check light

    check_version(version)
    pins = load_pins(pins_path)
    if not needs_update(pins, version):
        raise SystemExit(f"{version} is not newer than the pinned {pins.firefox_version}")
    info = _info(pins, version)
    bump_pins(pins_path, version, fetch_sha256(version))
    lw = info["librewolf"]
    unclassified = []
    if lw["latest"] and lw["latest"] != pins.librewolf_ref:
        unclassified = _best_effort(unclassified_for_ref, lw["latest"]) or []
    failed, error = [], None
    try:
        with tempfile.TemporaryDirectory() as work:
            result = assemble_mod.assemble(load_pins(pins_path), Path(work), allow_failed=True)
            failed = list(result.failed)
    except (HashMismatch, LibreWolfMismatch):
        raise  # an integrity failure is never a report line
    except Exception as exc:  # noqa: BLE001 - a new tree can break assembly in many ways
        error = f"{type(exc).__name__}: {exc}"
    _write_report(info, failed, unclassified, error, report_dir / REPORT)
    return info


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--bump", metavar="VERSION",
                      help="Firefox version from --check's firefox.latest")
    mode.add_argument("--verify-branch-diff", action="store_true",
                      help="read a pins.toml diff on stdin; fail unless only the Firefox values changed")
    args = ap.parse_args(argv)
    if args.verify_branch_diff:
        try:
            verify_branch_diff(sys.stdin.read())
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 1
        return 0
    if args.check:
        print(json.dumps(gather(load_pins(PINS)), indent=2))
    else:
        bump(PINS, Path.cwd(), args.bump)
    return 0


if __name__ == "__main__":
    sys.exit(main())
