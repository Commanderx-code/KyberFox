"""The DNS over HTTPS providers offered in Settings, and the fallback resolver,
in kyberfox.cfg."""

import json
import re
from pathlib import Path

CFG = Path(__file__).resolve().parent.parent / "settings/kyberfox.cfg"

PROVIDERS = [
    ("Quad9 (No Filtering)", "https://dns10.quad9.net/dns-query"),
    ("Quad9 (Malware blocking)", "https://dns.quad9.net/dns-query"),
    ("LibreDNS (No Filtering)", "https://doh.libredns.gr/dns-query"),
    ("LibreDNS (Adblocking)", "https://doh.libredns.gr/noads"),
    # Firefox's own endpoints, covered by Mozilla's resolver policy.
    ("Cloudflare (No Filtering)", "https://mozilla.cloudflare-dns.com/dns-query"),
    ("NextDNS (No Filtering)", "https://firefox.dns.nextdns.io/"),
]


def pref(name):
    match = re.search(
        r'defaultPref\(\s*"' + re.escape(name) + r'",\s*(`[^`]*`|"[^"]*")\s*\)',
        CFG.read_text(),
    )
    assert match, f"{name} is not set"
    return match.group(1)[1:-1]


def test_provider_list():
    providers = json.loads(pref("doh-rollout.provider-list"))
    assert [(p["UIName"], p["uri"]) for p in providers] == PROVIDERS


def test_fallback_is_the_default_resolver():
    assert pref("network.trr.default_provider_uri") == pref("network.trr.uri")
    assert pref("network.trr.uri") == "https://dns10.quad9.net/dns-query"


def test_dropped_providers_are_gone():
    text = CFG.read_text().lower()
    assert "dns4all" not in text
    assert "wikimedia-dns" not in text
