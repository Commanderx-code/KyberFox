import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "overlay/browser/components/kyberfox/KyberThemes.sys.mjs"
PALETTES = ROOT / "themes/palettes.json"


def fallback_ember():
    """The vars of the FALLBACK ember block in KyberThemes.sys.mjs."""
    text = MODULE.read_text(encoding="utf-8")
    block = re.search(r"const FALLBACK = \{.*?vars: \{(.*?)\n    \},", text, re.S)
    assert block, "FALLBACK block not found in KyberThemes.sys.mjs"
    pairs = re.findall(r'"(--kf-[\w-]+)":\s*"((?:[^"\\]|\\.)*)"', block.group(1))
    assert pairs, "FALLBACK has no variables"
    return dict(pairs)


def test_fallback_ember_matches_palettes_json():
    assert fallback_ember() == json.loads(PALETTES.read_text(encoding="utf-8"))["ember"]["vars"]
