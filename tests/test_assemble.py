import pytest

from tests.conftest import pins_newer_firefox, pins_with_wrong_hash
from tools.assemble import assemble
from tools.sources import HashMismatch, load_pins


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
