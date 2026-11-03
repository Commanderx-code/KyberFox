from pathlib import Path

import pytest

from tests.conftest import FAKE_XPI, FAKE_XPI_NAME, pins_newer_firefox, pins_with_wrong_hash
from tools.assemble import assemble
from tools.sources import HashMismatch, fetch_ublock, load_pins


def test_hash_mismatch_stops_before_extract(tmp_path, fake_tarball):
    with pytest.raises(HashMismatch):
        assemble(pins_with_wrong_hash(), tmp_path)
    assert not (tmp_path / "tree").exists()


def test_failed_patch_is_reported_with_newer_firefox(tmp_path, fake_sources):
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert result.failed == ["patches/stale.patch"]
    assert (result.tree / "kept.txt").read_text() == "patched\n"


def test_failed_patch_raises_by_default(tmp_path, fake_sources):
    with pytest.raises(RuntimeError, match="patches/stale.patch"):
        assemble(pins_newer_firefox(), tmp_path)


def test_failed_patch_leaves_no_partial_changes(tmp_path, fake_sources):
    (fake_sources / "patches" / "stale.patch").write_text(
        "--- a/kept.txt\n+++ b/kept.txt\n@@ -1 +1 @@\n-patched\n+later\n"
        "--- a/new.txt\n+++ b/new.txt\n@@ -1 +1 @@\n-nope\n+nope2\n"
    )
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert result.failed == ["patches/stale.patch"]
    assert (result.tree / "kept.txt").read_text() == "patched\n"
    assert not list(result.tree.rglob("*.rej")) and not list(result.tree.rglob("*.orig"))


def test_patch_text_is_rebranded_before_applying(tmp_path, fake_sources):
    (fake_sources / "patches" / "good.patch").write_text(
        "--- a/kept.txt\n+++ b/kept.txt\n@@ -1 +1 @@\n-original\n+LibreWolf\n"
    )
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert (result.tree / "kept.txt").read_text() == "Kyber Fox\n"


def test_overlay_is_copied(tmp_path, fake_sources):
    from tools import assemble as mod

    (mod.REPO_ROOT / "overlay" / "sub").mkdir(parents=True)
    (mod.REPO_ROOT / "overlay" / "sub" / "new.txt").write_text("hi\n")
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert (result.tree / "sub" / "new.txt").read_text() == "hi\n"


def test_kyber_series_is_applied(tmp_path, fake_sources):
    from tools import assemble as mod

    kyber = mod.REPO_ROOT / "patches" / "kyber"
    (kyber / "one.patch").write_text(
        "--- a/kept.txt\n+++ b/kept.txt\n@@ -1 +1 @@\n-patched\n+kyber\n"
    )
    (kyber / "series.txt").write_text("# comment\none.patch\n")
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert (result.tree / "kept.txt").read_text() == "kyber\n"


REAL_ROOT = Path(__file__).resolve().parent.parent
LICENSE_HTML = "browser/base/content/overrides/app-license.html"


def test_kyber_patches_are_not_rebranded(tmp_path, fake_sources):
    from tools import assemble as mod

    kyber = mod.REPO_ROOT / "patches" / "kyber"
    (kyber / "one.patch").write_text(
        "--- a/kept.txt\n+++ b/kept.txt\n@@ -1 +1 @@\n-patched\n+patches from LibreWolf\n"
    )
    (kyber / "series.txt").write_text("one.patch\n")
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert (result.tree / "kept.txt").read_text() == "patches from LibreWolf\n"


def test_license_credit_keeps_librewolf(tmp_path, fake_sources):
    """The real license-notices.patch, applied to the upstream about:license
    text it was made against, still credits LibreWolf."""
    from tools import assemble as mod

    real = (REAL_ROOT / "patches" / "kyber" / "license-notices.patch").read_text()
    hunk = real.split("\n@@ ", 1)[1].split("\n", 1)[1]
    upstream = [line[1:] for line in hunk.splitlines() if line[:1] in (" ", "-")]
    # A LibreWolf patch puts the upstream text into the fake tree.
    (fake_sources / "patches" / "good.patch").write_text(
        f"--- /dev/null\n+++ b/{LICENSE_HTML}\n@@ -0,0 +1,{len(upstream)} @@\n"
        + "".join(f"+{line}\n" for line in upstream)
    )
    kyber = mod.REPO_ROOT / "patches" / "kyber"
    (kyber / "license-notices.patch").write_text(real)
    (kyber / "series.txt").write_text("license-notices.patch\n")
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert result.failed == ["patches/stale.patch"]
    html = (result.tree / LICENSE_HTML).read_text()
    assert 'patches from <a href="https://librewolf.net/">LibreWolf</a>' in html
    assert "Kyber Fox is not made or endorsed by Mozilla." in html


def test_load_pins(tmp_path):
    p = tmp_path / "pins.toml"
    p.write_text(
        '[firefox]\nversion = "1.0"\nsha256 = "aa"\n'
        '[librewolf]\nref = "r"\ncommit = "c"\n'
        '[ublock]\nversion = "2"\nsha256 = "bb"\n'
        '[kyber]\ngx_commit = "g"\none_commit = "o"\nbuild = 4\n'
    )
    pins = load_pins(p)
    assert pins.kyber_build == 4
    assert (pins.firefox_version, pins.librewolf_ref, pins.ublock_sha256) == ("1.0", "r", "bb")
    assert pins.librewolf_commit == "c"
    assert (pins.gx_commit, pins.one_commit) == ("g", "o")



def test_already_applied_patch_is_reported_failed(tmp_path, fake_sources):
    # The second patch repeats the first, so its change is already in the tree.
    # It must fail instead of being silently reversed.
    from tests.conftest import GOOD_PATCH

    (fake_sources / "patches" / "stale.patch").write_text(GOOD_PATCH)
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert result.failed == ["patches/stale.patch"]
    assert (result.tree / "kept.txt").read_text() == "patched\n"


def test_patch_icons_are_copied_into_the_tree(tmp_path, fake_sources):
    # LibreWolf patches reference icons its build copies from assets/icons.
    icons = fake_sources / "assets" / "icons"
    icons.mkdir(parents=True)
    (icons / "jit.svg").write_text("<svg/>\n")
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert (result.tree / "browser/themes/shared/icons/jit.svg").read_text() == "<svg/>\n"


def test_settings_are_copied_into_the_kyberfox_dir(tmp_path, fake_sources):
    from tests.conftest import SETTINGS_FILES

    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    for name in SETTINGS_FILES:
        assert (result.tree / "kyberfox" / name).read_text() == f"// {name}\n"


def test_openai_backend_is_removed(tmp_path, fake_sources):
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    ml = result.tree / "toolkit/components/ml"
    assert not (ml / "content/backends/OpenAIPipeline.mjs").exists()
    assert not (ml / "vendor/openai").exists()


def test_all_pings_follow_the_collection_pref(tmp_path, fake_sources):
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    text = (result.tree / "toolkit/components/glean/pings.yaml").read_text()
    assert "follows_collection_enabled: false" not in text
    assert text.count("follows_collection_enabled: true") == 2


def test_cargo_checksum_follows_a_patched_vendored_crate(tmp_path, fake_sources):
    import hashlib
    import json

    (fake_sources / "patches" / "good.patch").write_text(
        "--- a/third_party/rust/glean-core/src/lib.rs\n"
        "+++ b/third_party/rust/glean-core/src/lib.rs\n"
        "@@ -1 +1 @@\n-pub fn glean() {}\n+pub fn glean() { return; }\n"
    )
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    crate = result.tree / "third_party/rust/glean-core"
    sums = json.loads((crate / ".cargo-checksum.json").read_text())
    want = hashlib.sha256((crate / "src/lib.rs").read_bytes()).hexdigest()
    assert sums == {"files": {"src/lib.rs": want, "Cargo.toml": "00"}, "package": "pkg"}


def test_display_version_carries_the_build_counter(tmp_path, fake_sources):
    from dataclasses import replace

    result = assemble(replace(pins_newer_firefox(), kyber_build=3), tmp_path,
                      allow_failed=True)
    assert (result.tree / "browser/config/version_display.txt").read_text() == "999.0-3\n"


def test_static_pref_sections_are_put_in_order(tmp_path, fake_sources):
    from tests.test_staticprefs import HEAD, section
    from tools import assemble as mod

    prefs = mod.REPO_ROOT / "overlay" / "modules/libpref/init/StaticPrefList.yaml"
    prefs.parent.mkdir(parents=True)
    prefs.write_text(HEAD + section("layout") + section("kyberfox"))
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    out = (result.tree / "modules/libpref/init/StaticPrefList.yaml").read_text()
    assert out == HEAD + section("kyberfox") + section("layout")


def test_ublock_xpi_is_staged_in_the_kyberfox_dir(tmp_path, fake_sources):
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    staged = result.tree / "kyberfox" / "uBlock0@raymondhill.net.xpi"
    assert staged.read_bytes() == FAKE_XPI


def test_ublock_hash_mismatch_fails(tmp_path, fake_sources):
    (tmp_path / FAKE_XPI_NAME).write_bytes(b"tampered")
    with pytest.raises(HashMismatch):
        assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert not (tmp_path / "tree").exists()


def test_ublock_bad_download_is_deleted_so_a_rerun_refetches(tmp_path, fake_sources, monkeypatch):
    from tools import sources

    (tmp_path / FAKE_XPI_NAME).write_bytes(b"tampered")
    with pytest.raises(HashMismatch):
        fetch_ublock(pins_newer_firefox(), tmp_path)
    assert not (tmp_path / FAKE_XPI_NAME).exists()

    urls = []
    monkeypatch.setattr(sources, "download",
                        lambda url, dest: (urls.append(url), dest.write_bytes(FAKE_XPI)))
    assert fetch_ublock(pins_newer_firefox(), tmp_path).read_bytes() == FAKE_XPI
    assert urls == ["https://github.com/gorhill/uBlock/releases/download/0/"
                    "uBlock0_0.firefox.signed.xpi"]


def test_ublock_verified_file_is_not_downloaded_again(tmp_path, fake_sources, monkeypatch):
    from tools import sources

    (tmp_path / FAKE_XPI_NAME).write_bytes(FAKE_XPI)
    monkeypatch.setattr(sources, "download", lambda *a: pytest.fail("downloaded"))
    fetch_ublock(pins_newer_firefox(), tmp_path)


def test_missing_recommended_addons_raises(tmp_path, fake_sources):
    import pytest
    from tools import assemble as mod

    (mod.REPO_ROOT / "settings" / "recommended-addons.json").unlink()
    with pytest.raises(FileNotFoundError):
        mod.copy_recommended_addons(tmp_path)
