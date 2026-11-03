import dataclasses
import shutil
import subprocess

import pytest

from tests.conftest import git_init, pins_newer_firefox
from tools import sources
from tools.sources import LibreWolfMismatch, fetch_librewolf


def _head(path):
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=path, check=True,
                          capture_output=True, text=True).stdout.strip()


def test_stale_librewolf_checkout_is_refetched(tmp_path, fake_sources, monkeypatch):
    # Replace the seeded checkout with an older one at the same path.
    shutil.rmtree(fake_sources)
    git_init(fake_sources, {"old.txt": "old\n"})
    fresh = git_init(tmp_path / "probe", {"new.txt": "new\n"})
    pins = dataclasses.replace(pins_newer_firefox(), librewolf_commit=fresh)
    assert _head(fake_sources) != fresh
    calls = []

    def fake_clone(pins_, dest):
        calls.append(dest)
        git_init(dest, {"new.txt": "new\n"})

    monkeypatch.setattr(sources, "_clone_librewolf", fake_clone)
    path = fetch_librewolf(pins, tmp_path)
    assert len(calls) == 1
    assert (path / "new.txt").exists() and not (path / "old.txt").exists()
    assert _head(path) == fresh


def test_matching_librewolf_checkout_is_not_refetched(tmp_path, fake_sources, monkeypatch):
    monkeypatch.setattr(sources, "_clone_librewolf",
                        lambda *a: pytest.fail("must not fetch"))
    assert fetch_librewolf(pins_newer_firefox(), tmp_path) == fake_sources


def test_fetched_librewolf_commit_mismatch_raises(tmp_path, monkeypatch):
    def fake_clone(pins_, dest):
        git_init(dest, {"x.txt": "x\n"})

    monkeypatch.setattr(sources, "_clone_librewolf", fake_clone)
    with pytest.raises(LibreWolfMismatch, match="expected"):
        fetch_librewolf(pins_newer_firefox(), tmp_path)
    assert not (tmp_path / "librewolf").exists()
