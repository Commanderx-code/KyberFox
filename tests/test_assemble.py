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
        '[librewolf]\nref = "r"\n'
        '[ublock]\nversion = "2"\nsha256 = "bb"\n'
        '[kyber]\ngx_commit = "g"\none_commit = "o"\n'
    )
    pins = load_pins(p)
    assert (pins.firefox_version, pins.librewolf_ref, pins.ublock_sha256) == ("1.0", "r", "bb")
    assert (pins.gx_commit, pins.one_commit) == ("g", "o")
