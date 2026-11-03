import dataclasses
import json
from pathlib import Path

import pytest

from tests.conftest import pins_newer_firefox
from tools import assemble as assemble_mod
from tools import upstream_watch as uw
from tools.assemble import AssemblyResult
from tools.sources import HashMismatch, load_pins

FIXTURES = Path(__file__).parent / "fixtures"
REAL_PINS = Path(__file__).resolve().parent.parent / "pins.toml"

PINS_TEXT = """\
# Pinned inputs.

[firefox]
version = "159.0"
sha256 = "aa"

[ublock]
version = "1.75.2"
sha256 = "aa"
"""


def load_pins_firefox(path):
    p = load_pins(path)
    return p.firefox_version, p.firefox_sha256


def _pins(version):
    return dataclasses.replace(pins_newer_firefox(), firefox_version=version)


def test_reads_latest_version():
    details = json.loads((FIXTURES / "firefox_versions.json").read_text())
    assert uw.latest_firefox(details) == "159.0"


@pytest.mark.parametrize("bad", ["159.0 ", "159.0\n", "\u0661\u0665\u0669.0", "1_59.0",
                                 "159", "159.0.1.2", "159.0b1", "", None])
def test_bad_version_is_rejected(bad):
    with pytest.raises(ValueError):
        uw.latest_firefox({"LATEST_FIREFOX_VERSION": bad})


def test_two_digit_minor_is_newer():
    assert uw.needs_update(_pins("159.9"), "159.10")
    assert not uw.needs_update(_pins("159.10"), "159.9")


def test_no_update_when_equal():
    assert not uw.needs_update(_pins("159.0"), "159.0")
    assert not uw.needs_update(_pins("159.0.1"), "159.0")
    assert not uw.needs_update(_pins("160.0"), "159.9")


def test_point_release_flagged():
    assert uw.needs_update(_pins("159.0"), "159.0.1")
    assert uw.is_security_release("159.0", "159.0.1")
    assert uw.is_security_release("159.0.1", "159.0.2")


def test_major_bump_is_not_security():
    assert uw.needs_update(_pins("159.0"), "160.0")
    assert not uw.is_security_release("159.0", "160.0")
    assert not uw.is_security_release("159.0", "160.0.1")


def test_bump_rewrites_version_and_hash_only(tmp_path):
    path = tmp_path / "pins.toml"
    path.write_text(PINS_TEXT)
    uw.bump_pins(path, "159.0.1", "bb" * 32)
    assert path.read_text() == PINS_TEXT.replace(
        'version = "159.0"\nsha256 = "aa"', f'version = "159.0.1"\nsha256 = "{"bb" * 32}"')


H = "b" * 64


def test_bump_real_pins_file_changes_two_values(tmp_path):
    path = tmp_path / "pins.toml"
    path.write_bytes(REAL_PINS.read_bytes())
    uw.bump_pins(path, "159.0.1", H)
    old, new = REAL_PINS.read_text().splitlines(), path.read_text().splitlines()
    changed = [(a, b) for a, b in zip(old, new) if a != b]
    assert len(old) == len(new) and len(changed) == 2
    assert changed[0][1] == 'version = "159.0.1"' and changed[1][1] == f'sha256 = "{H}"'


def test_bump_keeps_crlf_and_skips_comment_mention(tmp_path):
    path = tmp_path / "pins.toml"
    text = ('# see [firefox] below\r\n[firefox]\r\nversion = "159.0"\r\n'
            'sha256 = "aa"\r\n[ublock]\r\nversion = "1"\r\n')
    path.write_bytes(text.encode())
    uw.bump_pins(path, "160.0", H)
    assert path.read_bytes().decode() == text.replace('"159.0"', '"160.0"').replace('"aa"', f'"{H}"')


@pytest.mark.parametrize("text", [
    '[firefox]\nversion = "159.0"\n',
    '[firefox]\nversion = "159.0"\nsha256 = "a"\nsha256 = "b"\n',
    '[ublock]\nversion = "1"\n',
    '[firefox]\nversion = "1"\nsha256 = "a"\n[firefox]\nversion = "2"\n',
])
def test_bump_fails_on_missing_or_duplicate_key(tmp_path, text):
    path = tmp_path / "pins.toml"
    path.write_text(text)
    with pytest.raises(ValueError):
        uw.bump_pins(path, "160.0", H)
    assert path.read_text() == text


def _sums(monkeypatch, text):
    monkeypatch.setattr(uw, "_get", lambda url: text.encode())


def test_fetch_sha256_finds_source_tarball(monkeypatch):
    _sums(monkeypatch, f"{'1' * 64}  source/firefox-159.0.source.tar.xz.asc\n"
                       f"{'2' * 64}  firefox-159.0.source.tar.xz\n"
                       f"{H}  source/firefox-159.0.source.tar.xz\n")
    assert uw.fetch_sha256("159.0") == H


def test_fetch_sha256_missing_line(monkeypatch):
    _sums(monkeypatch, f"{H}  source/firefox-159.0.1.source.tar.xz\n")
    with pytest.raises(RuntimeError, match="no source/firefox-159.0"):
        uw.fetch_sha256("159.0")


def test_fetch_sha256_rejects_bad_digest(monkeypatch):
    _sums(monkeypatch, 'ab"  source/firefox-159.0.source.tar.xz\n')
    with pytest.raises(RuntimeError, match="bad digest"):
        uw.fetch_sha256("159.0")


def test_latest_librewolf_picks_highest_tag():
    tags = [{"name": n} for n in ("159.0-1", "159.0-10", "159.0-2", "158.0.2-9", "nightly")]
    assert uw.latest_librewolf(tags) == "159.0-10"
    assert uw.latest_librewolf([{"name": "x"}]) is None
    assert uw.latest_librewolf([{"name": "159.0-1\n"}, {"name": "\u0661\u0665\u0669.0-1"}]) is None


def test_latest_ublock_reads_digest():
    rel = {"tag_name": "1.76.0", "assets": [
        {"name": "uBlock0_1.76.0.chromium.zip", "digest": "sha256:00"},
        {"name": "uBlock0_1.76.0.firefox.signed.xpi", "digest": "sha256:ab"}]}
    assert uw.latest_ublock(rel) == ("1.76.0", "ab")


def _stub_network(monkeypatch, latest="159.0.1"):
    def fake_json(url):
        if url == uw.DETAILS_URL:
            return {"LATEST_FIREFOX_VERSION": latest}
        if url == uw.LIBREWOLF_TAGS_URL:
            return [{"name": "159.0-1"}, {"name": "159.0.1-1"}]
        return {"tag_name": "1.76.0", "assets": []}

    monkeypatch.setattr(uw, "fetch_json", fake_json)


def test_cli_check_prints_json(tmp_path, monkeypatch, capsys):
    pins = tmp_path / "pins.toml"
    pins.write_text(PINS_TEXT + '\n[librewolf]\nref = "159.0-1"\ncommit = "c"\n'
                    '\n[kyber]\nbuild = 1\ngx_commit = "g"\none_commit = "o"\n')
    monkeypatch.setattr(uw, "PINS", pins)
    _stub_network(monkeypatch)
    assert uw.main(["--check"]) == 0
    assert json.loads(capsys.readouterr().out) == {
        "firefox": {"pinned": "159.0", "latest": "159.0.1", "newer": True, "security": True},
        "librewolf": {"pinned_ref": "159.0-1", "latest": "159.0.1-1"},
        "ublock": {"pinned": "1.75.2", "latest": "1.76.0"},
    }


def test_bump_runs_assembly_with_allow_failed(tmp_path, monkeypatch):
    pins = tmp_path / "pins.toml"
    pins.write_text(PINS_TEXT + '\n[librewolf]\nref = "159.0-1"\ncommit = "c"\n'
                    '\n[kyber]\nbuild = 1\ngx_commit = "g"\none_commit = "o"\n')
    _stub_network(monkeypatch)
    monkeypatch.setattr(uw, "fetch_sha256", lambda v: "cc" * 32)
    monkeypatch.setattr(uw, "unclassified_for_ref", lambda ref: ["patches/new.patch"])
    calls = []

    def fake_assemble(pins_, workdir, allow_failed=False):
        calls.append((pins_.firefox_version, pins_.firefox_sha256, allow_failed))
        return AssemblyResult(tree=workdir / "tree", failed=["patches/a.patch", "patches/b.patch"])

    monkeypatch.setattr(assemble_mod, "assemble", fake_assemble)
    uw.bump(pins, tmp_path, "159.0.1")
    assert calls == [("159.0.1", "cc" * 32, True)]
    assert load_pins_firefox(pins) == ("159.0.1", "cc" * 32)
    report = (tmp_path / uw.REPORT).read_text()
    assert "- patches/a.patch" in report and "- patches/b.patch" in report
    assert "- patches/new.patch" in report
    assert "159.0.1-1" in report and "1.76.0" in report


def _bump_setup(tmp_path, monkeypatch):
    pins = tmp_path / "pins.toml"
    pins.write_text(PINS_TEXT + '\n[librewolf]\nref = "159.0-1"\ncommit = "c"\n'
                    '\n[kyber]\nbuild = 1\ngx_commit = "g"\none_commit = "o"\n')
    _stub_network(monkeypatch)
    monkeypatch.setattr(uw, "fetch_sha256", lambda v: "cc" * 32)
    monkeypatch.setattr(uw, "unclassified_for_ref", lambda ref: [])
    return pins


def test_bump_refuses_version_that_is_not_newer(tmp_path, monkeypatch):
    pins = _bump_setup(tmp_path, monkeypatch)
    monkeypatch.setattr(assemble_mod, "assemble", lambda *a, **k: pytest.fail("no assembly"))
    with pytest.raises(SystemExit):
        uw.bump(pins, tmp_path, "159.0")
    with pytest.raises(ValueError):
        uw.bump(pins, tmp_path, "159.0\n")
    assert not (tmp_path / uw.REPORT).exists()


def test_bump_reports_assembly_error(tmp_path, monkeypatch):
    pins = _bump_setup(tmp_path, monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("terms block moved")

    monkeypatch.setattr(assemble_mod, "assemble", boom)
    uw.bump(pins, tmp_path, "159.0.1")
    assert "Assembly stopped: RuntimeError: terms block moved" in (tmp_path / uw.REPORT).read_text()


def test_bump_keeps_hash_mismatch_fatal(tmp_path, monkeypatch):
    pins = _bump_setup(tmp_path, monkeypatch)

    def bad(*a, **k):
        raise HashMismatch("x")

    monkeypatch.setattr(assemble_mod, "assemble", bad)
    with pytest.raises(HashMismatch):
        uw.bump(pins, tmp_path, "159.0.1")


def test_side_checks_survive_odd_json(monkeypatch):
    def fake_json(url):
        if url == uw.DETAILS_URL:
            return {"LATEST_FIREFOX_VERSION": "159.0"}
        return {"unexpected": True} if url == uw.UBLOCK_LATEST_URL else {"tags": []}

    monkeypatch.setattr(uw, "fetch_json", fake_json)
    info = uw.gather(_pins("159.0"))
    assert info["librewolf"]["latest"] is None and info["ublock"]["latest"] is None


def test_unclassified_for_ref_lists_names_directly(tmp_path, monkeypatch):
    def fake_run(cmd, check):
        dest = Path(cmd[-1])
        (dest / "assets").mkdir()
        (dest / "assets" / "patches.txt").write_text("a.patch\nnew.patch\n")

    monkeypatch.setattr(uw.subprocess, "run", fake_run)
    monkeypatch.setattr(uw, "REPO_ROOT", tmp_path)
    (tmp_path / "patches").mkdir()
    (tmp_path / "patches" / "librewolf-keep.txt").write_text("a.patch\n")
    (tmp_path / "patches" / "librewolf-drop.txt").write_text("")
    assert uw.unclassified_for_ref("159.0-2") == ["new.patch"]
