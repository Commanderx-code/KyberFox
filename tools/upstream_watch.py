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

from tools.patchset import UnclassifiedPatch, classify, read_list
from tools.sources import LIBREWOLF_URL, Pins, load_pins

REPO_ROOT = Path(__file__).resolve().parent.parent
PINS = REPO_ROOT / "pins.toml"
REPORT = "upstream-watch-report.md"

DETAILS_URL = "https://product-details.mozilla.org/1.0/firefox_versions.json"
SUMS_URL = "https://archive.mozilla.org/pub/firefox/releases/{v}/SHA256SUMS"
LIBREWOLF_TAGS_URL = "https://codeberg.org/api/v1/repos/librewolf/source/tags?limit=50"
UBLOCK_LATEST_URL = "https://api.github.com/repos/gorhill/uBlock/releases/latest"

_TAG = re.compile(r"^(\d+(?:\.\d+)*)-(\d+)$")


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split("."))


def latest_firefox(details: dict) -> str:
    return details["LATEST_FIREFOX_VERSION"]


def needs_update(pins: Pins, latest: str) -> bool:
    return _version(latest) > _version(pins.firefox_version)


def is_security_release(old: str, new: str) -> bool:
    """A patch bump inside one major version: 159.0 -> 159.0.1, 159.0.1 -> 159.0.2."""
    a, b = _version(old), _version(new)
    return a[0] == b[0] and b > a and len(b) >= 3


def bump_pins(path: Path, version: str, sha256: str) -> None:
    """Rewrite the [firefox] version and sha256 values; every other byte stays."""
    text = Path(path).read_bytes().decode()
    head, sep, rest = text.partition("[firefox]")
    if not sep:
        raise ValueError(f"{path}: no [firefox] section")
    body, nxt, tail = rest.partition("\n[")
    body, n1 = re.subn(r'(?m)^(version\s*=\s*)"[^"]*"', lambda m: f'{m[1]}"{version}"', body)
    body, n2 = re.subn(r'(?m)^(sha256\s*=\s*)"[^"]*"', lambda m: f'{m[1]}"{sha256}"', body)
    if n1 != 1 or n2 != 1:
        raise ValueError(f"{path}: [firefox] needs exactly one version and one sha256")
    Path(path).write_bytes((head + sep + body + nxt + tail).encode())


def latest_librewolf(tags_json: list) -> str | None:
    """Newest <firefox version>-<n> tag, or None when no tag has that shape."""
    best = None
    for tag in tags_json:
        m = _TAG.match(tag.get("name", ""))
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
            return digest.strip()
    raise RuntimeError(f"no {want} line in SHA256SUMS for {version}")


def unclassified_for_ref(ref: str) -> list[str]:
    """Patch names in LibreWolf's patches.txt at ref that neither list classifies."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", ref,
                        LIBREWOLF_URL, tmp], check=True)
        upstream = read_list(Path(tmp) / "assets" / "patches.txt")
    keep = set(read_list(REPO_ROOT / "patches" / "librewolf-keep.txt"))
    drop = set(read_list(REPO_ROOT / "patches" / "librewolf-drop.txt"))
    try:
        classify(upstream, keep, drop)
    except UnclassifiedPatch as exc:
        return str(exc).split(": ", 1)[1].split(", ")
    return []


def _best_effort(fn, *args):
    """Side checks must not fail the watch when Codeberg or GitHub is down."""
    try:
        return fn(*args)
    except Exception as exc:  # noqa: BLE001
        print(f"warning: {fn.__name__}: {exc}", file=sys.stderr)
        return None


def gather(pins: Pins) -> dict:
    latest = latest_firefox(fetch_json(DETAILS_URL))
    tags = _best_effort(fetch_json, LIBREWOLF_TAGS_URL)
    release = _best_effort(fetch_json, UBLOCK_LATEST_URL)
    return {
        "firefox": {
            "pinned": pins.firefox_version,
            "latest": latest,
            "newer": needs_update(pins, latest),
            "security": needs_update(pins, latest)
            and is_security_release(pins.firefox_version, latest),
        },
        "librewolf": {"pinned_ref": pins.librewolf_ref,
                      "latest": latest_librewolf(tags) if tags else None},
        "ublock": {"pinned": pins.ublock_version,
                   "latest": latest_ublock(release)[0] if release else None},
    }


def _write_report(info: dict, failed: list[str], unclassified: list[str], out: Path) -> None:
    ff, lw, ub = info["firefox"], info["librewolf"], info["ublock"]
    lines = [f"Firefox {ff['pinned']} to {ff['latest']}.", ""]
    lines.append("Patches that failed to apply on the new tree:")
    lines += [f"- {n}" for n in failed] or ["- none"]
    lines += ["", "Pinned LibreWolf: " + lw["pinned_ref"]]
    if lw["latest"] and lw["latest"] != lw["pinned_ref"]:
        lines.append(f"Newer LibreWolf tag: {lw['latest']} (pin it with its commit by hand).")
        lines.append("Upstream patches not yet in the keep or drop list:")
        lines += [f"- {n}" for n in unclassified] or ["- none"]
    if ub["latest"] and ub["latest"] != ub["pinned"]:
        lines += ["", f"Newer uBlock Origin: {ub['latest']} (pinned {ub['pinned']}). "
                  "Bump by hand and run browser_shield.js."]
    out.write_text("\n".join(lines) + "\n")


def bump(pins_path: Path, report_dir: Path) -> dict:
    from tools import assemble as assemble_mod  # late: keeps --check light

    pins = load_pins(pins_path)
    info = gather(pins)
    if not info["firefox"]["newer"]:
        print("Firefox is up to date; nothing to bump.")
        return info
    latest = info["firefox"]["latest"]
    bump_pins(pins_path, latest, fetch_sha256(latest))
    lw = info["librewolf"]
    unclassified = []
    if lw["latest"] and lw["latest"] != pins.librewolf_ref:
        unclassified = _best_effort(unclassified_for_ref, lw["latest"]) or []
    with tempfile.TemporaryDirectory() as work:
        result = assemble_mod.assemble(load_pins(pins_path), Path(work), allow_failed=True)
        failed = list(result.failed)
    _write_report(info, failed, unclassified, report_dir / REPORT)
    return info


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--bump", action="store_true")
    args = ap.parse_args(argv)
    if args.check:
        print(json.dumps(gather(load_pins(PINS)), indent=2))
    else:
        bump(PINS, Path.cwd())
    return 0


if __name__ == "__main__":
    sys.exit(main())
