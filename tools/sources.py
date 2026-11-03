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
UBLOCK_URL = ("https://github.com/gorhill/uBlock/releases/download/{v}/"
              "uBlock0_{v}.firefox.signed.xpi")


class HashMismatch(Exception):
    pass


class LibreWolfMismatch(Exception):
    pass


@dataclass(frozen=True)
class Pins:
    firefox_version: str
    firefox_sha256: str
    librewolf_ref: str
    librewolf_commit: str
    ublock_version: str
    ublock_sha256: str
    gx_commit: str
    one_commit: str
    kyber_build: int


def load_pins(path: Path) -> Pins:
    data = tomllib.loads(Path(path).read_text())
    return Pins(
        firefox_version=data["firefox"]["version"],
        firefox_sha256=data["firefox"]["sha256"],
        librewolf_ref=data["librewolf"]["ref"],
        librewolf_commit=data["librewolf"]["commit"],
        ublock_version=data["ublock"]["version"],
        ublock_sha256=data["ublock"]["sha256"],
        gx_commit=data["kyber"]["gx_commit"],
        one_commit=data["kyber"]["one_commit"],
        kyber_build=int(data["kyber"]["build"]),
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


def fetch_ublock(pins: Pins, workdir: Path) -> Path:
    """Return the verified signed uBlock Origin XPI, downloading only if absent.

    A file that fails the hash is deleted, so a rerun fetches it again.
    """
    v = pins.ublock_version
    xpi = workdir / f"uBlock0_{v}.firefox.signed.xpi"
    if not xpi.exists():
        download(UBLOCK_URL.format(v=v), xpi)
    actual = sha256_file(xpi)
    if actual != pins.ublock_sha256:
        xpi.unlink()
        raise HashMismatch(f"{xpi.name}: expected {pins.ublock_sha256}, got {actual}")
    return xpi


def _head(checkout: Path) -> str:
    out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=checkout, check=True,
                         capture_output=True, text=True)
    return out.stdout.strip()


def _clone_librewolf(pins: Pins, dest: Path) -> None:
    """Fetch the pinned ref into the empty directory dest."""
    for cmd in (
        ["git", "init", "-q"],
        ["git", "remote", "add", "origin", LIBREWOLF_URL],
        ["git", "fetch", "-q", "--depth", "1", "origin", pins.librewolf_ref],
    ):
        subprocess.run(cmd, cwd=dest, check=True)
    # Check the fetched commit before it is checked out, so a moved tag
    # never reaches the work tree.
    out = subprocess.run(["git", "rev-parse", "FETCH_HEAD^{commit}"], cwd=dest,
                         check=True, capture_output=True, text=True)
    fetched = out.stdout.strip()
    if fetched != pins.librewolf_commit:
        raise LibreWolfMismatch(
            f"LibreWolf {pins.librewolf_ref}: expected commit "
            f"{pins.librewolf_commit}, got {fetched}"
        )
    subprocess.run(["git", "-c", "advice.detachedHead=false", "checkout", "-q",
                    "FETCH_HEAD"], cwd=dest, check=True)


def fetch_librewolf(pins: Pins, workdir: Path) -> Path:
    """Return the LibreWolf checkout at the pinned commit.

    An existing checkout at another commit is replaced. A fresh fetch that
    does not land on the pinned commit raises LibreWolfMismatch.
    """
    dest = workdir / "librewolf"
    if dest.exists():
        if _head(dest) == pins.librewolf_commit:
            return dest
        shutil.rmtree(dest)
    tmp = workdir / "librewolf.part"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    try:
        _clone_librewolf(pins, tmp)
        actual = _head(tmp)
        if actual != pins.librewolf_commit:
            raise LibreWolfMismatch(
                f"LibreWolf {pins.librewolf_ref}: expected commit "
                f"{pins.librewolf_commit}, got {actual}"
            )
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    tmp.rename(dest)
    return dest
