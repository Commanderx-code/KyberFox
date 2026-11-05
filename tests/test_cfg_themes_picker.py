"""The Firefox themes picker in about:addons stays off in kyberfox.cfg."""

from pathlib import Path

CFG = Path(__file__).resolve().parent.parent / "settings/kyberfox.cfg"


def test_themes_picker_is_off():
    assert (
        'defaultPref("browser.aboutaddons.novaThemesPickerEnabled", false);'
        in CFG.read_text()
    )
