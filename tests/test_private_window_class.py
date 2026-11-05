"""Private windows on Linux: their own window class and the private logo."""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BRANDING = ROOT / "overlay/browser/branding/kyberfox"
SIZES = (16, 22, 24, 32, 48, 64, 128, 256)


def test_patch_is_in_the_series():
    series = (ROOT / "patches/kyber/series.txt").read_text().split()
    assert "private-window-class.patch" in series
    patch = (ROOT / "patches/kyber/private-window-class.patch").read_text()
    assert "browser/base/content/browser-init.js" in patch
    assert "KyberPrivateWindow" in patch


def test_module_is_registered():
    build = (ROOT / "overlay/browser/components/kyberfox/moz.build").read_text()
    assert '"KyberPrivateWindow.sys.mjs"' in build


def test_private_icons_ship_on_linux():
    build = (BRANDING / "moz.build").read_text()
    for size in SIZES:
        assert f'"kyberfox-private{size}.png"' in build, size
    assert re.search(r'MOZ_WIDGET_TOOLKIT"\] == "gtk"', build)
    assert "kyberfox-private$size.png" in (ROOT / "tools/make-logos.sh").read_text()


def test_private_icons_are_square_pngs():
    if not shutil.which("magick"):
        pytest.skip("ImageMagick is not installed")
    for size in SIZES:
        p = BRANDING / f"kyberfox-private{size}.png"
        out = subprocess.run(["magick", "identify", "-format", "%w %h", str(p)],
                             capture_output=True, text=True, check=True).stdout
        assert out == f"{size} {size}", p


def test_private_icons_are_in_the_package_manifest():
    """Firefox's package-manifest.in names each icon; unlisted files are left
    out of the tarball, so the patch lists them too."""
    patch = (ROOT / "patches/kyber/private-window-class.patch").read_text()
    assert "browser/installer/package-manifest.in" in patch
    for size in SIZES:
        assert f"+@RESPATH@/browser/chrome/icons/default/kyberfox-private{size}.png" in patch, size


MASK = ROOT / "branding/private-window/logo.png"


def test_private_window_icons_are_the_mask():
    """The taskbar icon of a private window is the mask artwork in
    branding/private-window/, on Linux and on Windows."""
    script = (ROOT / "tools/make-logos.sh").read_text()
    assert 'square "PNG32:$dir/kyberfox-private$size.png" "$size" "$src/private-window"' in script
    assert 'ico "$dir/pbmode.ico" "$src/private-window"' in script
    if not shutil.which("magick"):
        pytest.skip("ImageMagick is not installed")
    for size in (32, 128, 256):
        icon = BRANDING / f"kyberfox-private{size}.png"
        out = subprocess.run(
            ["magick", str(MASK), "-resize", f"{size}x{size}", "-background", "black", "-flatten",
             "(", str(icon), "-background", "black", "-flatten", ")",
             "-compose", "difference", "-composite", "-colorspace", "gray",
             "-format", "%[fx:mean]", "info:"],
            capture_output=True, text=True, check=True).stdout
        # The mask scores about 0.0004; the masked fox it replaced about 0.1.
        assert float(out) < 0.01, (size, out)
