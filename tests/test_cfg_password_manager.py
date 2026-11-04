"""Firefox's password manager and form autofill are off and locked: Kyber Fox
leaves passwords to an add-on such as Bitwarden."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = ROOT / "settings/kyberfox.cfg"
POLICIES = ROOT / "settings/policies.json"

LOCKED = {
    "signon.rememberSignons": "false",
    "signon.autofillForms": "false",
    "signon.generation.enabled": "false",
    "signon.management.page.breach-alerts.enabled": "false",
    "extensions.formautofill.addresses.enabled": "false",
    "extensions.formautofill.creditCards.enabled": "false",
    "extensions.formautofill.addresses.supported": '"off"',
    "extensions.formautofill.creditCards.supported": '"off"',
    "browser.contextual-password-manager.enabled": "false",
    "browser.contentblocking.report.lockwise.enabled": "false",
}


def calls(name):
    text = CFG.read_text(encoding="utf-8")
    return re.findall(r'\b(\w*[pP]ref)\(\s*"%s",\s*([^)]*?)\s*\)' % re.escape(name), text)


def test_password_and_autofill_prefs_are_locked_off():
    for name, value in LOCKED.items():
        assert calls(name) == [("lockPref", value)], name


def test_policy_turns_the_password_manager_off():
    policies = json.loads(POLICIES.read_text(encoding="utf-8"))["policies"]
    assert policies["PasswordManagerEnabled"] is False
    assert policies["OfferToSaveLogins"] is False
    assert policies["AutofillAddressEnabled"] is False
    assert policies["AutofillCreditCardEnabled"] is False
