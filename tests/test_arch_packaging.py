import configparser
import hashlib
import re
import shutil
import subprocess
import tomllib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
ARCH = ROOT / "packaging/arch"
PKGBUILD = (ARCH / "PKGBUILD").read_text(encoding="utf-8")


def pins():
    with open(ROOT / "pins.toml", "rb") as f:
        return tomllib.load(f)


def var(name):
    return re.search(rf"^{name}=(\S+)$", PKGBUILD, re.M).group(1).strip("'\"")


def test_version_matches_pins():
    assert var("pkgver") == pins()["firefox"]["version"]
    assert var("pkgrel") == str(pins()["kyber"]["build"])


def test_basics():
    assert var("pkgname") == "kyberfox"
    assert "arch=('x86_64')" in PKGBUILD
    assert "license=('MPL-2.0')" in PKGBUILD
    for dep in ("gtk3", "dbus-glib", "libxt", "mime-types", "ttf-font"):
        assert f"'{dep}'" in PKGBUILD


def test_local_source_checksums():
    sums = re.findall(r"'([0-9a-f]{64})'", PKGBUILD)
    actual = [hashlib.sha256((ARCH / n).read_bytes()).hexdigest()
              for n in ("kyberfox.desktop", "LICENSE")]
    assert sums == actual
    assert "sha256sums=('SKIP'" in PKGBUILD


def test_desktop_file():
    cp = configparser.ConfigParser(interpolation=None, delimiters=("=",))
    cp.optionxform = str
    cp.read(ARCH / "kyberfox.desktop", encoding="utf-8")
    entry = cp["Desktop Entry"]
    assert entry["Name"] == "Kyber Fox"
    assert entry["Exec"] == "/usr/bin/kyberfox %u"
    assert entry["StartupWMClass"] == "kyberfox"
    assert entry["Icon"] == "kyberfox"
    assert entry["Categories"] == "Network;WebBrowser;"
    mime = entry["MimeType"].split(";")
    for m in ("text/html", "x-scheme-handler/http", "x-scheme-handler/https"):
        assert m in mime
    assert entry["Actions"] == "new-window;new-private-window;"
    assert "Desktop Action new-window" in cp
    assert "Desktop Action new-private-window" in cp


def test_publish_script_shellcheck():
    script = ARCH / "publish-repo.sh"
    assert script.stat().st_mode & 0o111
    if not shutil.which("shellcheck"):
        pytest.skip("shellcheck not installed")
    subprocess.run(["shellcheck", str(script)], check=True)
