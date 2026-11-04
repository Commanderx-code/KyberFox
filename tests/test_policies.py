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


# The logos are embedded, so showing them contacts no server. Startpage and
# Ecosia are Firefox's own icons (services/settings/dumps/main/search-config-icons);
# Brave's is the SVG favicon of search.brave.com. To change one, replace the file
# and paste the new data: URL (base64 of the file) into policies.json.
ICONS = {"Startpage": "startpage", "Brave Search": "brave", "Ecosia": "ecosia"}


def test_added_engines_carry_their_logo():
    import base64
    for engine in engines()["Add"]:
        svg = (POLICIES.parent / "search-icons" / f"{ICONS[engine['Name']]}.svg").read_bytes()
        assert b"<script" not in svg and b"http" not in svg.replace(b"http://www.w3.org/2000/svg", b"")
        assert engine["IconURL"] == "data:image/svg+xml;base64," + base64.b64encode(svg).decode(), engine["Name"]
