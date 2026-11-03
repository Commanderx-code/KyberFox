"""Checks on the repository's top-level documents."""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BANNED = ("Claude", "ChatGPT", "Copilot", "AI-generated")


def test_license_is_mpl_2():
    first = (REPO / "LICENSE").read_text(encoding="utf-8").splitlines()[0]
    assert first == "Mozilla Public License Version 2.0"


def test_readme_links_install_doc():
    assert "](docs/install.md)" in (REPO / "README.md").read_text(encoding="utf-8")


def test_docs_name_no_ai_tool():
    files = sorted((REPO / "docs").rglob("*.md")) + [REPO / "README.md", REPO / "SECURITY.md"]
    bad = [f"{f.relative_to(REPO)}: {w}" for f in files
           for w in BANNED if w in f.read_text(encoding="utf-8")]
    assert not bad, bad
