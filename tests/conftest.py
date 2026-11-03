"""Offline fixtures: a tiny fake Firefox tarball and fake LibreWolf checkout."""
import hashlib
import io
import os
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools import assemble as assemble_mod  # noqa: E402
from tools.sources import Pins  # noqa: E402

FAKE_VERSION = "999.0"


def _build_tarball() -> bytes:
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w:xz") as tar:
        data = b"original\n"
        info = tarfile.TarInfo(f"firefox-{FAKE_VERSION}/kept.txt")
        info.size = len(data)
        info.mtime = 0
        tar.addfile(info, io.BytesIO(data))
    return raw.getvalue()


_TARBALL = _build_tarball()
FAKE_SHA = hashlib.sha256(_TARBALL).hexdigest()


# Commit of the fake LibreWolf checkout; set by the fake_sources fixture.
STATE = {"commit": "0" * 40}


def git_init(path, files: dict[str, str], message: str = "seed") -> str:
    """Make path a real git repo with one commit holding files; return its SHA."""
    env = {
        "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
        "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid",
        "PATH": os.environ["PATH"], "HOME": str(path),
    }
    path.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (path / name).parent.mkdir(parents=True, exist_ok=True)
        (path / name).write_text(text)
    for cmd in (["init", "-q"], ["add", "-A"], ["commit", "-q", "-m", message]):
        subprocess.run(["git", *cmd], cwd=path, env=env, check=True)
    out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=path, env=env,
                         check=True, capture_output=True, text=True)
    return out.stdout.strip()


def _pins(sha: str) -> Pins:
    return Pins(
        firefox_version=FAKE_VERSION,
        firefox_sha256=sha,
        librewolf_ref="test-ref",
        librewolf_commit=STATE["commit"],
        ublock_version="0",
        ublock_sha256="0" * 64,
        gx_commit="0" * 40,
        one_commit="0" * 40,
    )


def pins_with_wrong_hash() -> Pins:
    return _pins("0" * 64)


def pins_newer_firefox() -> Pins:
    return _pins(FAKE_SHA)


@pytest.fixture
def fake_tarball(tmp_path):
    path = tmp_path / f"firefox-{FAKE_VERSION}.source.tar.xz"
    path.write_bytes(_TARBALL)
    return path


GOOD_PATCH = """\
--- a/kept.txt
+++ b/kept.txt
@@ -1 +1 @@
-original
+patched
"""

STALE_PATCH = """\
--- a/kept.txt
+++ b/kept.txt
@@ -1 +1 @@
-something else entirely
+stale
"""


@pytest.fixture
def fake_sources(tmp_path, tmp_path_factory, fake_tarball, monkeypatch):
    """Seed tmp_path (the workdir) with a fake LibreWolf checkout and point
    the tools at a fake repo holding the keep list."""
    lw = tmp_path / "librewolf"
    STATE["commit"] = git_init(lw, {
        "patches/good.patch": GOOD_PATCH,
        "patches/stale.patch": STALE_PATCH,
        "assets/patches.txt": "patches/good.patch\npatches/stale.patch\n",
    })
    repo = tmp_path_factory.mktemp("repo")
    (repo / "patches" / "kyber").mkdir(parents=True)
    (repo / "patches" / "librewolf-keep.txt").write_text(
        "patches/good.patch\npatches/stale.patch\n"
    )
    (repo / "patches" / "librewolf-drop.txt").write_text("")
    (repo / "patches" / "kyber" / "series.txt").write_text("")
    monkeypatch.setattr(assemble_mod, "REPO_ROOT", repo)
    return lw
