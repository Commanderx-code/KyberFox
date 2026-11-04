import configparser
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
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


def test_package_layout():
    package = PKGBUILD[PKGBUILD.index("package()"):]
    assert 'cp -a "$srcdir/kyberfox" "$pkgdir/opt/kyberfox"' in package
    assert re.search(r'ln -s /opt/kyberfox/kyberfox "\$pkgdir/usr/bin/kyberfox"', package)
    desktop = re.search(
        r'install -Dm644 "\$srcdir/kyberfox\.desktop" "\$pkgdir/usr/share/applications/kyberfox\.desktop"', package)
    license_ = re.search(
        r'install -Dm644 "\$srcdir/LICENSE" "\$pkgdir/usr/share/licenses/\$pkgname/LICENSE"', package)
    assert desktop and license_
    assert "/usr/share/icons/hicolor/${size}x${size}/apps/kyberfox.png" in package


def test_smoke_checks_what_the_package_installs():
    smoke = (ROOT / ".github/workflows/smoke-arch.yml").read_text(encoding="utf-8")
    for path in ("/usr/bin/kyberfox", "/opt/kyberfox/kyberfox-bin",
                 "/usr/share/applications/kyberfox.desktop",
                 "/usr/share/licenses/kyberfox/LICENSE"):
        assert path in smoke
    assert "Kyber Fox $ver-$rel" in smoke
    build_linux = (ROOT / ".github/workflows/build-linux.yml").read_text(encoding="utf-8")
    assert "uses: ./.github/workflows/smoke-arch.yml" in build_linux


def test_release_package_script_renames_the_tarball():
    script = (ARCH / "release-package.sh").read_text(encoding="utf-8")
    assert 'kyberfox-$ver-$rel.linux-x86_64.tar.xz' in script
    assert script.index("updpkgsums") < script.index("makepkg")
    assert "kyberfox-${pkgver}-${pkgrel}.linux-x86_64.tar.xz" in PKGBUILD


def _fake_package(path, version):
    info = f"pkgname = kyberfox\npkgver = {version}\narch = x86_64\nsize = 1\npkgdesc = t\n"
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / ".PKGINFO").write_text(info)
        subprocess.run(["bsdtar", "-c", "--zstd", "-f", str(path), "-C", d, ".PKGINFO"], check=True)


def _signing_env(tmp_path):
    """A scratch keyring with a fresh signing key; skips when the pacman tools are missing."""
    for tool in ("gpg", "repo-add", "vercmp", "bsdtar"):
        if not shutil.which(tool):
            pytest.skip(f"{tool} not installed")
    home = tmp_path / "gnupg"
    home.mkdir(mode=0o700)
    env = {**os.environ, "GNUPGHOME": str(home)}
    subprocess.run(["gpg", "--batch", "--passphrase", "", "--quick-generate-key",
                    "test <test@example.invalid>", "ed25519", "sign", "never"],
                   env=env, check=True, capture_output=True)
    listing = subprocess.run(["gpg", "--list-keys", "--with-colons"], env=env, check=True,
                             capture_output=True, text=True).stdout
    env["KYBERFOX_PACMAN_KEY_ID"] = next(
        line.split(":")[9] for line in listing.splitlines() if line.startswith("fpr"))
    return env


def test_publish_refuses_a_version_that_would_be_pruned(tmp_path):
    env = _signing_env(tmp_path)
    repo = tmp_path / "repo"

    def publish(version):
        pkg = tmp_path / f"kyberfox-{version}-x86_64.pkg.tar.zst"
        _fake_package(pkg, version)
        return subprocess.run([str(ARCH / "publish-repo.sh"), str(pkg), str(repo)],
                              env=env, capture_output=True, text=True)

    for version in ("2-1", "3-1", "1-1"):
        result = publish(version)
        assert (result.returncode == 0) == (version != "1-1"), result.stderr
    names = sorted(p.name for p in repo.glob("*.pkg.tar.zst"))
    assert names == ["kyberfox-2-1-x86_64.pkg.tar.zst", "kyberfox-3-1-x86_64.pkg.tar.zst"]
    assert "refusing" in publish("1-1").stderr


# Stands in for gh: a Release is a directory of assets, and every call is logged.
FAKE_GH = r"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE_GH_LOG"
[[ $1 == release ]] || exit 2
sub=$2
shift 2
case $sub in
  view)
    [[ -d $FAKE_GH_REMOTE ]] || exit 1
    if [[ " $* " == *" --json "* ]]; then find "$FAKE_GH_REMOTE" -type f -printf '%f\n'; fi ;;
  create) mkdir -p "$FAKE_GH_REMOTE" ;;
  download)
    while (($#)); do [[ $1 == --dir ]] && dir=$2; shift; done
    cp "$FAKE_GH_REMOTE"/* "$dir"/ ;;
  upload) for a in "$@"; do if [[ -f $a ]]; then cp "$a" "$FAKE_GH_REMOTE"/; fi; done ;;
  delete-asset) rm -f -- "$FAKE_GH_REMOTE/$2" ;;
  *) exit 2 ;;
esac
"""


def test_publish_to_release_keeps_two_versions_and_uploads_packages_first(tmp_path):
    env = _signing_env(tmp_path)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "gh").write_text(FAKE_GH, encoding="utf-8")
    (bin_dir / "gh").chmod(0o755)
    remote, log = tmp_path / "remote", tmp_path / "gh.log"
    env.update(PATH=f"{bin_dir}:{env['PATH']}", FAKE_GH_REMOTE=str(remote), FAKE_GH_LOG=str(log),
               GITHUB_REPOSITORY="owner/name", KYBERFOX_LOCAL_SIGN="1")
    env.pop("KYBERFOX_REPO_RELEASE", None)

    def publish(version):
        pkg = tmp_path / "in" / f"kyberfox-{version}-x86_64.pkg.tar.zst"
        pkg.parent.mkdir(exist_ok=True)
        _fake_package(pkg, version)
        log.write_text("", encoding="utf-8")
        result = subprocess.run([str(ARCH / "publish-to-release.sh"), str(pkg), str(tmp_path / "work")],
                                env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        return log.read_text(encoding="utf-8").splitlines()

    first = publish("2-1")
    assert any(line.startswith("release create arch-repo ") and "--prerelease" in line for line in first)
    publish("3-1")
    calls = publish("4-1")
    assert not any(line.startswith("release create") for line in calls)
    names = sorted(p.name for p in remote.iterdir())
    assert names == sorted([
        "kyberfox-3-1-x86_64.pkg.tar.zst", "kyberfox-3-1-x86_64.pkg.tar.zst.sig",
        "kyberfox-4-1-x86_64.pkg.tar.zst", "kyberfox-4-1-x86_64.pkg.tar.zst.sig",
        *(f"kyberfox.{ext}{suffix}" for ext in ("db", "files")
          for suffix in ("", ".sig", ".tar.gz", ".tar.gz.sig")),
    ])
    assert all(not (remote / n).is_symlink() for n in names)
    uploads = [line for line in calls if line.startswith("release upload")]
    assert len(uploads) == 2
    assert "kyberfox-4-1-x86_64.pkg.tar.zst" in uploads[0] and "kyberfox.db" not in uploads[0]
    assert "kyberfox.db" in uploads[1] and ".pkg.tar.zst" not in uploads[1]
    # The pruned version is removed only after the new database is up.
    deletes = [i for i, line in enumerate(calls) if line.startswith("release delete-asset")]
    assert sorted(calls[i].split()[3] for i in deletes) == [
        "kyberfox-2-1-x86_64.pkg.tar.zst", "kyberfox-2-1-x86_64.pkg.tar.zst.sig"]
    assert min(deletes) > calls.index(uploads[1])
    # The database lists only the newest version.
    listing = subprocess.run(["bsdtar", "-tf", str(remote / "kyberfox.db")], check=True,
                             capture_output=True, text=True).stdout
    assert "kyberfox-4-1/" in listing and "kyberfox-3-1/" not in listing


def test_install_docs_point_pacman_at_the_release_repo():
    server = "Server = https://github.com/Commanderx-code/KyberFox/releases/download/arch-repo"
    for doc in (ROOT / "docs/install.md", ARCH / "README.md"):
        text = doc.read_text(encoding="utf-8")
        assert server in text, doc
        assert "github.io/KyberFox/arch" not in text, doc


def test_publish_script_shellcheck():
    script = ARCH / "publish-repo.sh"
    assert script.stat().st_mode & 0o111
    if not shutil.which("shellcheck"):
        pytest.skip("shellcheck not installed")
    others = [ARCH / n for n in ("release-package.sh", "sign-and-publish.sh", "publish-to-release.sh")]
    assert all(p.stat().st_mode & 0o111 for p in others)
    subprocess.run(["shellcheck", str(script), *map(str, others)], check=True)
