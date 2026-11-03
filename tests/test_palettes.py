import json
import re
from pathlib import Path

THEMES = Path(__file__).resolve().parent.parent / "themes"

REQUIRED = {
    "--kf-bg", "--kf-bg-toolbar", "--kf-bg-tab-active", "--kf-bg-urlbar",
    "--kf-fg", "--kf-fg-muted", "--kf-accent", "--kf-border", "--kf-radius",
    "--kf-font", "--kf-bg-image",
}
SEVEN = {"ember", "paper", "frost", "terminal", "catppuccin", "tokyo-night", "starry"}


def palettes():
    return json.loads((THEMES / "palettes.json").read_text(encoding="utf-8"))


def test_every_palette_defines_all_variables():
    for pid, p in palettes().items():
        assert set(p["vars"]) == REQUIRED, pid
        assert p["scheme"] in ("dark", "light"), pid


def test_color_themes_are_the_seven():
    colors = {pid for pid, p in palettes().items() if p["kind"] == "color"}
    assert colors == SEVEN


def test_status_lists_only_known_ids():
    status = json.loads((THEMES / "status.json").read_text(encoding="utf-8"))
    assert set(status["disabled"]) <= set(palettes())


def test_base_css_uses_only_declared_variables():
    css = (THEMES / "base.css").read_text(encoding="utf-8")
    assert set(re.findall(r"var\((--kf-[\w-]+)\)", css)) <= REQUIRED


def test_notices_cover_sourced_palettes():
    notices = (THEMES / "NOTICES.md").read_text(encoding="utf-8")
    for name in ("Catppuccin", "Tokyo Night", "starry-fox"):
        assert name in notices
