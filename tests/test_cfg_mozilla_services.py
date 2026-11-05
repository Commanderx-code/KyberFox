"""Mozilla's own services (VPN, Relay, Monitor, stories, promos) stay off and
locked in kyberfox.cfg, and their Remote Settings lists are not fetched."""

import re
from pathlib import Path

CFG = Path(__file__).resolve().parent.parent / "settings/kyberfox.cfg"

LOCKED = {
    "browser.ipProtection.enabled": "false",
    "browser.ipProtection.blockIPProtectionCallouts": "true",
    "browser.vpn_promo.enabled": "false",
    "browser.contentblocking.report.hide_vpn_banner": "true",
    "signon.firefoxRelay.feature": '"disabled"',
    "browser.promo.relay.enabled": "false",
    "browser.contentblocking.report.monitor.enabled": "false",
    "browser.preferences.moreFromMozilla": "false",
    "browser.newtabpage.activity-stream.discoverystream.promoCard.visible": "false",
    "browser.newtabpage.activity-stream.feeds.system.topstories": "false",
    "browser.newtabpage.activity-stream.feeds.section.topstories": "false",
}

DROPPED_COLLECTIONS = {
    "main/vpn-serverlist",
    "main/fxrelay-denylist",
    "main/fxrelay-allowlist",
    "main/ml-model-allow-deny-list",
    # The password manager and Monitor are locked off.
    "main/password-rules",
    "main/password-recipes",
    "main/fxmonitor-breaches",
}

KEPT_COLLECTIONS = {
    "security-state/*",
    "blocklists/addons",
    "blocklists/addons-bloomfilters",
    "main/tracking-protection-lists",
    "main/translations-models-v2",
    "main/translations-wasm-v2",
}


def cfg():
    return CFG.read_text(encoding="utf-8")


def calls(name):
    """Every (function, value) that sets the pref, in file order."""
    return re.findall(r'\b(\w*[pP]ref)\(\s*"%s",\s*([^)]*?)\s*\)' % re.escape(name), cfg())


def allowed_collections():
    m = re.search(
        r'defaultPref\(\s*"kyberfox\.services\.settings\.allowedCollections",\s*"([^"]*)"',
        cfg(),
    )
    assert m, "allowedCollections is set"
    return set(m.group(1).split(","))


def test_mozilla_services_are_locked_off():
    wrong = {}
    for name, value in LOCKED.items():
        found = calls(name)
        # Locked to the expected value, and no other line sets a different one.
        if ("lockPref", value) not in found or {v for _, v in found} != {value}:
            wrong[name] = found
    assert wrong == {}


def test_service_lists_are_not_fetched():
    assert DROPPED_COLLECTIONS & allowed_collections() == set()


def test_security_and_translation_lists_stay():
    assert KEPT_COLLECTIONS - allowed_collections() == set()
