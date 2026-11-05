# Privacy defaults

This page lists the privacy and security defaults where Kyber Fox differs from
stock Firefox, why it differs, what it can break, and how each one is checked.
The values live in [settings/kyberfox.cfg](../settings/kyberfox.cfg) (prefs) and
[settings/policies.json](../settings/policies.json) (enterprise policies). Most
of the starting point is LibreWolf's settings; the cfg file marks Kyber Fox's
own changes with "Kyber Fox:".

The Stock Firefox column is the Firefox 159 default, read from
`StaticPrefList.yaml`, `all.js` and `firefox.js` in the Firefox source.

The Verified column says how a default is checked:

- **test**: an automated test reads the value in a built browser (`test_defaults.js`, `browser_defaults.js` or `browser_privacy_presets.js` under `overlay/browser/components/kyberfox/test/`), run by the front-end tests workflow
- **audit**: confirmed by the recorded network audit in [network-audit.md](network-audit.md)
- **cfg only**: set in the cfg file, with no test that reads it yet

Most values are `defaultPref`, so the user can change them in Settings or
`about:config`. Locked values (`lockPref`) are marked; those are the telemetry
and account switches, which Kyber Fox removes rather than hides.

## Privacy presets

The top of Settings, Privacy and security, offers two presets. Standard is what
a new profile gets. Strict adds the options that cost some convenience or break
some sites. Changing any single option shows the preset as Custom.

Under the presets, a "What Strict changes" list names each option Strict turns
on, says what it does and what it can break, and shows whether it is on now.
The list follows the actual settings, so it stays right under Custom.

| Setting | Standard | Strict | What Strict costs |
|---|---|---|---|
| Enhanced Tracking Protection (`browser.contentblocking.category`) | strict | strict | |
| Third-party cookies (`network.cookie.cookieBehavior`) | 1, all blocked | 1, all blocked | |
| Fingerprinting protection (`privacy.fingerprintingProtection`) | on | on | |
| Resist fingerprinting (`privacy.resistFingerprinting`) | off | on | Sites see the time zone as UTC, a fixed window size and generic fonts; some sites break or look wrong |
| Letterboxing | off | on | Gray margins around pages |
| Clear cookies, site data and cache on exit | off | on | Logged out of every site after each restart; history and downloads are kept |
| WebGL (`webgl.disabled`) | on | off | Maps, games and 3D viewers stop working |
| WebRTC uses only the default network route (`media.peerconnection.ice.default_address_only`) | off | on | Some video calls fail to connect directly and fall back to relays, or fail |
| HTTPS-Only mode | on | on | |

Both presets are tested by `browser_privacy_presets.js`, which also checks that
a preset survives a restart. `tests/test_cfg_preset_prefs.py` makes sure the cfg
file never forces a preset value back on startup.

## Other defaults

| Area | Kyber Fox default | Stock Firefox | Why | Compatibility cost | Verified |
|---|---|---|---|---|---|
| Ads and trackers | Bundled uBlock Origin, on, also in private windows (once per profile; can be turned off in Add-ons and themes); per-site shield | No ad blocker | Blocking out of the box was a release 1 goal | A blocked script can break a site; the shield turns blocking off per site | test |
| Third-party cookies | All blocked (`cookieBehavior` 1) | Partitioned (5) | Stronger than partitioning | Some embedded logins and payment widgets fail; turn the shield down for the site | test |
| HTTPS-Only (`dom.security.https_only_mode`) | On, including local addresses (`upgrade_local`) | HTTPS-First | No silent plain-HTTP loads | An HTTP-only homelab service shows an error page with a "Continue to HTTP site" button; lasting exceptions are added under Settings, HTTPS-Only Mode, Manage Exceptions | test |
| Telemetry, health report, studies (Normandy, Shield studies) | Off and locked | On | Project goal | None | test (telemetry); cfg only (studies) |
| Crash reporting | Removed at build time | On | Project goal | No crash reports reach anyone | `check_forbidden` |
| AI features (chatbot, link previews, smart tab groups, PDF alt text, smart window) | Blocked | Available | Project goal | None; on-device translation stays available | test |
| Mozilla account and Firefox Sync | Off and locked (`identity.fxaccounts.enabled`) | On | Sync will be the project's own | No sync until word-code sync ships | test |
| Web push (`dom.push.enabled`) | Off | On | It keeps a connection to Mozilla's push servers | Sites cannot send push notifications | test |
| Sponsored content, stories, highlights, weather on the new tab | Off | On | Project goal | None | test |
| Mozilla's own services: the built-in VPN, Firefox Relay, the Firefox Monitor card, "More from Mozilla" in Settings, the new tab promo card | Off and locked; their Remote Settings lists are not downloaded (PR #14) | Offered | Project goal | None | test |
| Search suggestions (`browser.search.suggest.enabled`) | Off | On | Every keystroke would go to the search engine | No suggestions while typing; turn it on in Settings, Search | cfg only |
| Firefox's password manager and form autofill (`signon.rememberSignons`, `extensions.formautofill.*`) | Off and locked; the Passwords and autofill page in Settings, the main menu entry, the toolbar button, the login items in the context menu and the address bar action are removed, and `about:logins` is blocked by policy | On | Passwords belong in an add-on; a password manager add-on is offered on the welcome page | The browser never saves or fills passwords, addresses or cards; passwords saved before this change stay in the profile but cannot be viewed | test |
| Malware and phishing protection | On, local lists only; remote download checks off | On, with remote download checks | Keeps protection without sending file details to Google | Unknown or rare downloads are not checked against Google's servers | test (malware); cfg only (remote checks) |
| Certificate revocation | CRLite (`security.pki.crlite_mode` 2); OCSP off (`security.OCSP.enabled` 0) | CRLite and OCSP both on | OCSP sends every visited site to the certificate authority; CRLite checks revocation locally from lists Mozilla publishes | A certificate revoked too recently to be in the lists may still be accepted | test (CRLite filters) |
| Operating system root certificates (`security.enterprise_roots.enabled`) | Not trusted | Trusted | Only Mozilla's root store | A homelab or company CA installed in the OS is not trusted; import it under Settings, Certificates | cfg only |
| Location (`geo.provider.network.url`) | BeaconDB, OS location services off | Google location service | Avoids Google; sites still ask before getting a location | Less accurate locations | cfg only |
| DNS over HTTPS (`network.trr.mode`) | Off (5); when turned on, Settings offers Quad9 (the default), LibreDNS, Cloudflare and NextDNS | Mode 0, so Firefox's regional rollout can turn it on | Uses the system resolver, so homelab DNS keeps working | DNS queries are not encrypted unless the system does it | cfg only |
| DRM, Widevine (`media.eme.enabled`) | Off until the user turns it on | On on Windows; off until asked on Linux | Widevine is closed-source and downloaded from Google | Netflix, Disney+ and Spotify need one click to enable; see [streaming.md](streaming.md) | test |
| Global Privacy Control | On | Off | Asks sites not to sell data | None known | cfg only |
| Referrer trimming across sites (`XOriginTrimmingPolicy` 2) | Origin only | No trimming (0); the default referrer policy still limits most requests | Less data leaks to other sites | Rare: a site that checks the full referrer | cfg only |
| Startup | Restore the previous session | Home page | Owner's choice | None | test |
| Search engine | DuckDuckGo; Brave Search, Startpage, Ecosia and Google offered; Bing hidden; Wikipedia removed | Google | Privacy-respecting default, user's pick on the welcome page | None | test |
| Add-on blocklist | On | On | It is a security list | One request to Mozilla's Remote Settings | test |
| Safe Browsing (`browser.safebrowsing.*`) | On: Google's malware, phishing and unwanted-software lists are downloaded and checked locally; only a hash prefix of a matching URL is sent to confirm a hit; remote download checks off | On, remote download checks on | Warns about known malware and phishing sites without sending each visited URL | Lists download only in builds that carry the Safe Browsing key; a rare false warning can be clicked through | audit |
| System add-on updates (`extensions.systemAddon.update.enabled`) | Off and locked | On | The check to `aus5.mozilla.org` sends the OS version, and Kyber Fox updates its built-in add-ons with its own releases | None | cfg only |

## Connections that stay

Kyber Fox keeps some connections to Mozilla because they protect the user:
certificate revocation lists, the add-on blocklist and Remote Settings
security data, which also carries Firefox's tracker lists. Safe Browsing
downloads Google's malware and phishing lists from
`safebrowsing.googleapis.com`. uBlock Origin fetches its filter lists from its own hosts. The
full list, with what each host is for, is [network-audit.md](network-audit.md).

## Not decided yet

- Mirroring the security lists on project hosting instead of Mozilla's: more
  private, but users' security would then depend on a project server. To be
  revisited before any public release.
- Tests for the defaults marked "cfg only" above.
