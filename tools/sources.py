"""Pinned upstream sources: pins file, download, hash check, LibreWolf checkout."""
import hashlib
import shutil
import subprocess
import tomllib
import urllib.request
from dataclasses import dataclass
from pathlib import Path

LIBREWOLF_URL = "https://codeberg.org/librewolf/source"
FIREFOX_URL = "https://archive.mozilla.org/pub/firefox/releases/{v}/source/firefox-{v}.source.tar.xz"


class HashMismatch(Exception):
    pass


@dataclass(frozen=True)
class Pins:
    firefox_version: str
    firefox_sha256: str
    librewolf_ref: str
    ublock_version: str
    ublock_sha256: str
    gx_commit: str
    one_commit: str


def load_pins(path: Path) -> Pins:
    data = tomllib.loads(Path(path).read_text())
    return Pins(
        firefox_version=data["firefox"]["version"],
        firefox_sha256=data["firefox"]["sha256"],
        librewolf_ref=data["librewolf"]["ref"],
        ublock_version=data["ublock"]["version"],
        ublock_sha256=data["ublock"]["sha256"],
        gx_commit=data["kyber"]["gx_commit"],
        one_commit=data["kyber"]["one_commit"],
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, dest: Path) -> None:
    """Download to a temp name, then rename, so a partial file is never kept."""
    part = dest.with_name(dest.name + ".part")
    with urllib.request.urlopen(url) as resp, open(part, "wb") as out:
        shutil.copyfileobj(resp, out)
    part.rename(dest)


def fetch_firefox(pins: Pins, workdir: Path) -> Path:
    """Return the verified Firefox tarball, downloading only if absent."""
    v = pins.firefox_version
    tarball = workdir / f"firefox-{v}.source.tar.xz"
    if not tarball.exists():
        download(FIREFOX_URL.format(v=v), tarball)
    actual = sha256_file(tarball)
    if actual != pins.firefox_sha256:
        raise HashMismatch(
            f"{tarball.name}: expected {pins.firefox_sha256}, got {actual}"
        )
    return tarball


def fetch_librewolf(pins: Pins, workdir: Path) -> Path:
    """Return the LibreWolf checkout at the pinned ref, cloning only if absent."""
    dest = workdir / "librewolf"
    if dest.exists():
        return dest
    tmp = workdir / "librewolf.part"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    for cmd in (
        ["git", "init", "-q"],
        ["git", "remote", "add", "origin", LIBREWOLF_URL],
        ["git", "fetch", "-q", "--depth", "1", "origin", pins.librewolf_ref],
        ["git", "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"],
    ):
        subprocess.run(cmd, cwd=tmp, check=True)
    tmp.rename(dest)
    return dest
