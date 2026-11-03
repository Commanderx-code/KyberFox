import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "settings/recommended-addons.json"
REQUIRED = ("id", "slug", "name", "summary", "group")
GUID = re.compile(r"^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$")
EMAIL_STYLE = re.compile(r"^[A-Za-z0-9._@+-]*@[A-Za-z0-9.-]+$")
SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def data():
    return json.loads(LIST.read_text(encoding="utf-8"))


def test_entries_complete():
    d = data()
    assert d["verified"] == "2026-11-03"
    assert d["groups"] == ["Passwords", "Privacy", "Mail", "Video", "Appearance"]
    assert len(d["addons"]) == 18
    for a in d["addons"]:
        for key in REQUIRED:
            assert isinstance(a.get(key), str) and a[key], f"{a.get('slug')}: missing {key}"
        assert GUID.match(a["id"]) or EMAIL_STYLE.match(a["id"]), a["id"]
        assert SLUG.match(a["slug"]), a["slug"]
        assert a["group"] in d["groups"], a["slug"]
        assert set(a) <= set(REQUIRED) | {"note"}, a["slug"]


def test_slugs_and_ids_unique():
    addons = data()["addons"]
    assert len({a["slug"] for a in addons}) == len(addons)
    assert len({a["id"] for a in addons}) == len(addons)


def test_ublock_is_not_listed():
    """uBlock Origin is bundled; the page shows it as included, not as a choice."""
    assert all("ublock" not in a["slug"].lower() for a in data()["addons"])
