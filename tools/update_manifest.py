"""Render the static update.xml files that the Windows updater downloads.

The updater asks for one URL per channel and build target (see
patches/kyber/updater.patch) and reads one <update> with one complete patch.
One file is published per channel and target; when nothing newer exists the
file is the empty manifest.

    python -m tools.update_manifest --version 159.0.1 --display-version 159.0.1-1 \
        --build-id 20261110000000 --mar kyberfox-159.0.1-1.complete.mar \
        --url https://github.com/Commanderx-code/KyberFox/releases/download/v159.0.1-1/kyberfox-159.0.1-1.complete.mar \
        --out update/release/WINNT_x86_64-msvc-x64/update.xml
"""
import argparse
import hashlib
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

RELEASES_URL = "https://github.com/Commanderx-code/KyberFox/releases"


def _serialize(root: ET.Element) -> str:
    ET.indent(root)
    return ET.tostring(root, encoding="unicode") + "\n"


def render_update_xml(
    version: str,
    build_id: str,
    mar_url: str,
    sha512: str,
    size: int,
    *,
    display_version: str | None = None,
    details_url: str = RELEASES_URL,
) -> str:
    """One minor update with one complete patch.

    version is the Firefox version from application.ini (what the updater
    compares); display_version is the Kyber version shown to the user.
    """
    root = ET.Element("updates")
    update = ET.SubElement(root, "update", {
        "type": "minor",
        "displayVersion": display_version or version,
        "appVersion": version,
        "platformVersion": version,
        "buildID": build_id,
        "detailsURL": details_url,
    })
    ET.SubElement(update, "patch", {
        "type": "complete",
        "URL": mar_url,
        "hashFunction": "sha512",
        "hashValue": sha512,
        "size": str(size),
    })
    return _serialize(root)


def render_empty() -> str:
    """Served when nothing is newer than the installed build."""
    return _serialize(ET.Element("updates"))


def file_sha512_and_size(path: Path) -> tuple[str, int]:
    digest = hashlib.sha512()
    size = 0
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--out", required=True, type=Path, help="update.xml to write")
    p.add_argument("--empty", action="store_true", help="write the empty manifest")
    p.add_argument("--version", help="Firefox version (appVersion)")
    p.add_argument("--display-version", help="Kyber version shown to the user")
    p.add_argument("--build-id")
    p.add_argument("--mar", type=Path, help="the signed complete MAR; its hash and size are used")
    p.add_argument("--url", help="where the MAR is downloaded from")
    p.add_argument("--details-url", default=RELEASES_URL)
    args = p.parse_args(argv)

    if args.empty:
        text = render_empty()
    else:
        missing = [n for n in ("version", "build_id", "mar", "url") if not getattr(args, n)]
        if missing:
            p.error("missing: " + ", ".join("--" + n.replace("_", "-") for n in missing))
        sha512, size = file_sha512_and_size(args.mar)
        text = render_update_xml(
            args.version, args.build_id, args.url, sha512, size,
            display_version=args.display_version, details_url=args.details_url,
        )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
