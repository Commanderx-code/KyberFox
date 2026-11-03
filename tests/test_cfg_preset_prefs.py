import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "overlay/browser/components/kyberfox/KyberPrivacyPresets.sys.mjs"
CFG = ROOT / "settings/kyberfox.cfg"

# Seeded once as a user value under the categorySeeded guard, on purpose.
SEEDED = {"browser.contentblocking.category"}


def preset_prefs():
    """Every pref in the Standard and Strict tables of KyberPrivacyPresets."""
    return set(re.findall(r'^\s*"([\w.]+)":', MODULE.read_text(encoding="utf-8"), re.M))


def test_preset_table_is_found():
    assert "privacy.resistFingerprinting" in preset_prefs()
    assert "webgl.disabled" in preset_prefs()


def test_preset_prefs_are_only_defaults():
    """A pref() or lockPref() line writes a user value (or locks it) on every start,
    which undoes a preset after a restart. Only defaultPref() is allowed."""
    cfg = CFG.read_text(encoding="utf-8")
    bad = []
    for name in sorted(preset_prefs() - SEEDED):
        for call in re.findall(r'\b(\w*[pP]ref)\(\s*"%s"' % re.escape(name), cfg):
            if call != "defaultPref":
                bad.append(f"{call}({name})")
    assert bad == []
