import dataclasses
import json

import pytest

from tests.conftest import pins_newer_firefox
from tools import assemble as assemble_mod
from tools import upstream_watch as uw
from tools.assemble import AssemblyResult
from tools.sources import load_pins

PINS_TEXT = """\
# Pinned inputs.

[firefox]
version = "159.0"
sha256 = "aa"

[ublock]
version = "1.75.2"
sha256 = "aa"
"""


def _pins(version):
    return dataclasses.replace(pins_newer_firefox(), firefox_version=version)


def test_reads_latest_version():
    details = {"LATEST_FIREFOX_VERSION": "159.0.1", "FIREFOX_NIGHTLY": "162.0a1"}
    assert uw.latest_firefox(details) == "159.0.1"


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
    uw.bump_pins(path, "159.0.1", "bb")
    assert path.read_text() == PINS_TEXT.replace(
        'version = "159.0"\nsha256 = "aa"', 'version = "159.0.1"\nsha256 = "bb"')


def test_latest_librewolf_picks_highest_tag():
    tags = [{"name": n} for n in ("159.0-1", "159.0-10", "159.0-2", "158.0.2-9", "nightly")]
    assert uw.latest_librewolf(tags) == "159.0-10"
    assert uw.latest_librewolf([{"name": "x"}]) is None


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
    monkeypatch.setattr(uw, "fetch_sha256", lambda v: "cc")
    monkeypatch.setattr(uw, "unclassified_for_ref", lambda ref: ["patches/new.patch"])
    calls = []

    def fake_assemble(pins_, workdir, allow_failed=False):
        calls.append((pins_.firefox_version, pins_.firefox_sha256, allow_failed))
        return AssemblyResult(tree=workdir / "tree", failed=["patches/a.patch", "patches/b.patch"])

    monkeypatch.setattr(assemble_mod, "assemble", fake_assemble)
    uw.bump(pins, tmp_path)
    assert calls == [("159.0.1", "cc", True)]
    assert load_pins_firefox(pins) == ("159.0.1", "cc")
    report = (tmp_path / uw.REPORT).read_text()
    assert "- patches/a.patch" in report and "- patches/b.patch" in report
    assert "- patches/new.patch" in report
    assert "159.0.1-1" in report and "1.76.0" in report


def test_bump_does_nothing_when_up_to_date(tmp_path, monkeypatch):
    pins = tmp_path / "pins.toml"
    pins.write_text(PINS_TEXT + '\n[librewolf]\nref = "r"\ncommit = "c"\n'
                    '\n[kyber]\nbuild = 1\ngx_commit = "g"\none_commit = "o"\n')
    _stub_network(monkeypatch, latest="159.0")
    monkeypatch.setattr(assemble_mod, "assemble", lambda *a, **k: pytest.fail("no assembly"))
    uw.bump(pins, tmp_path)
    assert not (tmp_path / uw.REPORT).exists()


def load_pins_firefox(path):
    p = load_pins(path)
    return p.firefox_version, p.firefox_sha256
