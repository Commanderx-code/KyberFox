import json
from pathlib import Path

POLICIES = Path(__file__).resolve().parent.parent / "settings/policies.json"


def engines():
    return json.loads(POLICIES.read_text(encoding="utf-8"))["policies"]["SearchEngines"]


def test_added_engines():
    assert [e["Name"] for e in engines()["Add"]] == ["Startpage", "Brave Search", "Ecosia"]


def test_default_engines():
    assert engines()["Default"] == "DuckDuckGo"
    assert engines()["DefaultPrivate"] == "DuckDuckGo"


def test_removed_engines():
    assert engines()["Remove"] == ["Bing", "eBay", "Perplexity", "Reddit", "Wikipedia (en)", "YouTube"]


def test_ecosia():
    ecosia = next(e for e in engines()["Add"] if e["Name"] == "Ecosia")
    assert ecosia["URLTemplate"] == "https://www.ecosia.org/search?q={searchTerms}"
    assert ecosia["Method"] == "GET"
    assert ecosia["Alias"] == "@ecosia"
    assert "SuggestURLTemplate" not in ecosia
