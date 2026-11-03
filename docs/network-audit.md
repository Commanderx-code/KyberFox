# First-run network audit

Date: 2026-11-03. Scope: the Linux x86_64 CI build, checked for every host it contacts in the background and while browsing.

## Build identity

| Item | Value |
|---|---|
| Commit | `3c99103` (branch `release-1`) |
| CI run | GitHub Actions `41575126157`, artifact `kyberfox-linux-x86_64` |
| Tarball | `kyberfox-159.0.en-US.linux-x86_64.tar.xz` |
| `kyberfox --version` | `Kyber Fox 159.0-1` |
| Binary | `kyberfox` (wrapper) and `kyberfox-bin`, from `--with-app-name=kyberfox` |

The shipped `kyberfox.cfg` and `distribution/policies.json` were compared with the files in the working tree. They are not identical: the working tree is newer. It makes `dom.security.https_only_mode` a `defaultPref` in the cfg, while the audited build enforces HTTPS-only through the `HttpsOnlyMode` policy. It also uses `defaultPref` for `browser.dom.window.dump.enabled` and `devtools.console.stdout.chrome`, where the build uses `pref`. None of these differences affect the hosts below.

## Method

The artifact was downloaded with `gh run download 41575126157 -n kyberfox-linux-x86_64` and extracted into an empty directory. Only the browser binary was run from it.

All runs used the same logging and flags, with a per-run timeout kill:

```
MOZ_LOG="nsHttp:3,nsSocketTransport:3,nsHostResolver:3" MOZ_LOG_FILE=<log> \
  kyberfox --headless --no-remote --profile <profile> <urls>
```

| Run | Profile | URLs | Duration |
|---|---|---|---|
| 1. First start | new `p1` | `about:blank` | 180 s |
| 2. Second start | same `p1` | `https://example.com` | 60 s |
| 3. Fresh profile | new `p3` | `about:newtab`, `about:preferences#privacy` | 60 s |

Run 3 started at the same time as run 1 (different profile, different log). All three processes ran until the timeout killed them; none exited early. Stderr held only `*** You are running in headless mode.` and `[ERROR lockstore_ffi] Lockstore error: Key not found: DEK not found for dek_name: httpcache`, a harmless message about a missing cache encryption key in a new profile.

Hosts come from the `nsHostResolver` "Calling getaddrinfo for host" lines and from `nsSocketTransport::Init host=` lines, cross-checked against the `uri=` lines of `nsHttp`. A plain grep for `https://` in the log is not reliable, because response headers (Content-Security-Policy, `report-to`) mention hosts such as `www.recaptcha.net`, `www.gstatic.com`, `www.gstatic.cn`, `a.nel.cloudflare.com` and `videos.cdn.mozilla.net`. None of those was ever resolved or connected to. No `localhost` host appears in any log.

## Hosts contacted

The Run column shows which runs reached the host (1, 2, 3).

| Host | Run | What it is | Verdict |
|---|---|---|---|
| `firefox.settings.services.mozilla.com` | 1, 3 | Remote Settings change polling: security-state (OneCRL, intermediates, cert-revocations), blocklists (add-on bloom filters, gfx), plus main-bucket collections listed below | allowed (security); see note on extra collections |
| `firefox-settings-attachments.cdn.mozilla.net` | 1, 2, 3 | Attachments: CRLite cert-revocation deltas (about 12 files), and `bundles/startup.json.mozlz4` in run 2 | allowed (security) |
| `content-signature-2.cdn.mozilla.net` | 1, 2, 3 | Certificate chains that sign Remote Settings data | allowed (security) |
| `services.addons.mozilla.org` | 1, 3 | Add-on metadata search for uBlock Origin and the built-in themes (`/api/v4/addons/search/?guid=...`) | allowed (add-ons) |
| `versioncheck-bg.addons.mozilla.org` | 1, 3 | Update check for uBlock Origin 1.75.2 (sends app version, OS, locale) | allowed (add-ons) |
| `ublockorigin.github.io` | 1, 2, 3 | uBlock filter lists and patches (`uAssetsCDN`) | allowed (filter lists) |
| `ublockorigin.pages.dev` | 1, 2, 3 | Mirror of the same filter lists | allowed (filter lists) |
| `cdn.jsdelivr.net` | 1, 3 | uBlock `assets.json` and list mirrors (`gh/uBlockOrigin/uAssetsCDN`, `gh/gorhill/uBlock`) | allowed (uBlock Origin asset fetch) |
| `pgl.yoyo.org` | 1, 3 | Peter Lowe's ad server list | allowed (filter lists) |
| `malware-filter.pages.dev` | 1, 3 | URLhaus malware filter | allowed (filter lists) |
| `publicsuffix.org` | 1, 3 | uBlock fetches `public_suffix_list.dat` | allowed (uBlock Origin asset fetch) |
| `aus5.mozilla.org` | 1, 3 | `/update/3/SystemAddons/159.0/<buildid>/Linux_x86_64-gcc3/en-US/release/<OS string>/...`: Mozilla's system add-on update service | unexpected |
| `commanderx-code.github.io` | not yet observed | Update manifest `/KyberFox/update/<channel>/<build target>/update.xml`, Windows builds only (the Linux build has no updater). Contacted every `app.update.interval` (14400 s); sends the request path only, no version or build id. See `docs/update-signing.md` | allowed (Kyber Fox updates) |
| `example.com` | 2 | The page the test opened | allowed (test page) |

Run 3 (new tab and the Privacy page) made exactly the same connections as run 1 and no more. In particular the new tab page contacted no Contile, sponsored-content, weather, stories or other Mozilla host. In run 2 the only additions were `example.com` and the uBlock patch downloads; Remote Settings made one further attachment request (`startup.json.mozlz4`).

None of the forbidden hosts appeared in any log: no `telemetry.mozilla.org`, `normandy.cdn.mozilla.net`, `detectportal.firefox.com`, `push.services.mozilla.com`, `location.services.mozilla.com`, `contile`, `safebrowsing.googleapis.com`, `ocsp` host, search engine or prefetch host, `librewolf.net`, `codeberg.org`, or any model or AI host. A case-insensitive search of all three logs for `telemetry`, `normandy`, `detectportal`, `push.services`, `contile`, `ocsp`, `crlite`, `shavar`, `safebrowsing` and `googleapis` found zero lines. No Kyber-owned host and no `localhost` appeared; there is no update server yet.

The Remote Settings poll reached these main-bucket collections besides the security ones: `websites-with-shared-credential-backends`, `webcompat-interventions`, `translations-wasm`, `translations-models`, `password-rules`, `password-recipes`, `language-dictionaries`, `hijack-blocklists`, `fxmonitor-breaches`, `anti-tracking-url-decoration`. Only change-set metadata was requested for them (no attachments), but they are outside the "security-related" list in the spec, and `translations-*` belongs to the on-device translation feature (an AI feature).

## Profile checks

| Check | Run 1 profile | Run 3 profile |
|---|---|---|
| `datareporting/` | present: `state.json` and an empty Glean store (`glean/db`, empty `events/`, empty `pending_pings/`); the IDs in `state.json` are fixed dummy values | same |
| `saved-telemetry-pings/` | absent | absent |
| `crashes/` | absent | absent |
| uBlock Origin in `extensions.json` | 1.75.2, location `app-profile`, `active: true`, `userDisabled: false` | same |

Built-in add-ons also listed as active: `formautofill`, `ipp-activator`, `newtab`, `pictureinpicture`, `addons-search-detection`, `webcompat`, `default-theme`. The other three themes are disabled. `distribution/extensions/` ships only `uBlock0@raymondhill.net.xpi`.

Preferences in `prefs.js` (run 1 profile; run 3 is the same):

| Pref | In `prefs.js` | Why |
|---|---|---|
| `toolkit.telemetry.enabled` | absent | `lockPref(..., false)` in `kyberfox.cfg`; locked prefs are not written to `prefs.js`. Locked value false. |
| `datareporting.healthreport.uploadEnabled` | absent | `lockPref(..., false)` in `kyberfox.cfg` |
| `app.normandy.enabled` | absent | `lockPref(..., false)` in `kyberfox.cfg` |
| `kyberfox.cfg.version` | absent | `lockPref(..., "1")` in `kyberfox.cfg` |
| `browser.contentblocking.category` | `"standard"` | The cfg has `defaultPref(..., "strict")`, but a user value `"standard"` was written on first run; see conclusion |
| `dom.security.https_only_mode` | absent | Enforced by the `HttpsOnlyMode: enabled` policy in this build |
| `browser.startup.page` | absent | `defaultPref(..., 3)` in the cfg (restore session); the user has not changed it |

Absence from `prefs.js` was checked against the shipped `kyberfox.cfg`, not by reading live values. Live values were not queried (no `about:config` in headless mode).

## Conclusion

The build behaves as the spec describes for telemetry, studies, sponsored content, captive-portal checks, push, geolocation, search suggestions and AI model hosts: none of those hosts was contacted in five minutes of combined logging. uBlock Origin is installed, active and fetched its filter lists on first start. Security connections go directly to Mozilla.

Items to change:

1. `aus5.mozilla.org` is contacted on every fresh start (run 1 and run 3, not run 2). It is the system add-on update check and sends the build ID and OS version string. Turn it off in `settings/kyberfox.cfg` (for example `extensions.systemAddon.update.enabled` set to false and `extensions.systemAddon.update.url` empty) and confirm with a new run. Re-check this when the project's own update server and `MOZ_APPUPDATE_HOST` are set up, since Firefox's app updater and the system add-on updater are separate.
2. `browser.contentblocking.category` ended up as `"standard"` in the profile although the cfg default is `"strict"`. Find what writes the user value on first run (a policy or the first-run page) and decide which one the Shield presets are meant to own. Until that is settled, treat third-party cookie blocking and tracker settings as unverified on a new profile.
3. Remote Settings polls `translations-wasm`, `translations-models`, `fxmonitor-breaches`, `language-dictionaries`, `password-rules`, `password-recipes`, `webcompat-interventions`, `hijack-blocklists`, `websites-with-shared-credential-backends` and `anti-tracking-url-decoration`. The host is allowed, but the spec only lists security data. Decide whether to keep them; at minimum the `translations-*` polls conflict with "AI features removed". A patch or a Remote Settings collection filter would be needed.
4. uBlock Origin fetches lists from `cdn.jsdelivr.net` (a third-party CDN) and `publicsuffix.org` as well as the GitHub and Cloudflare Pages mirrors. These are allowed by the filter-list rule, but the spec's "Background connections" section does not name them; update it, or pin uBlock's list sources.
5. `safebrowsing/` in the profile holds empty tracking-protection list stores, and no `shavar` host was contacted in the observed time. The first list download probably comes later than five minutes. A longer run (30 minutes) is needed to confirm that those lists, when fetched, come from `shavar.services.mozilla.com` or `tracking-protection.cdn.mozilla.net` only.
6. This audit used a headless, 60 to 180 second window. Timers that fire later (add-on update every 24 hours, Remote Settings every 24 hours) were not observed beyond their first run.

## Follow-up

Checked on the same extracted build with the edited `settings/kyberfox.cfg` and `settings/policies.json` copied over the shipped files, using fresh profiles, headless, `about:blank`.

### System add-on update check

`aus5.mozilla.org` was the system add-on updater (`extensions.systemAddon.update.url`, enabled by default in `firefox.js`). The cfg now sets `lockPref("extensions.systemAddon.update.enabled", false)` and `lockPref("extensions.systemAddon.update.url", "")`. A new 90 second run resolved only the hosts that stayed allowed in the table above, and `aus5.mozilla.org` is gone. The cfg has no other `aus5` or `aus.mozilla.org` reference. `app.update.url.manual` and `app.update.url.details` point at the project's GitHub releases page, and `app.update.url` is not set in the cfg. The only remaining `aus5.mozilla.org` string in the repo is in `patches/kyber/updater.patch`, where it is the `MOZ_APPUPDATE_HOST` value that patch removes.

### Content blocking category

Cause. Firefox's `ContentBlockingPrefs.sys.mjs` (`browser/components/protections`) runs `matchCBCategory()` at startup. It tests the `standard` category before `strict`, and a category matches when none of its listed prefs has a user value. Both categories pass on a new profile, because the cfg sets the strict values as defaults. `standard` is tested first, so Firefox wrote `"standard"` as a user value. That value differs from the cfg default `"strict"`, so it was stored. No cfg pref was pinning a value to standard, and the `hasMigratedCategoryPrefs` lock was not involved.

Fix. The cfg no longer sets a default for the category, so the default stays at Firefox's `"standard"`. It seeds `"strict"` once with `pref()`, guarded by `kyberfox.cfg.categorySeeded`. A user value equal to the default is never stored, so this only works when the default differs. The guard keeps the seed from overriding a later choice on the Privacy page. `browser_defaults.js` now checks the seed flag instead of the default branch.

Result. Two starts with one fresh profile, then a third fresh profile with the final cfg, each gave in `prefs.js`:

```
user_pref("browser.contentblocking.category", "strict");
user_pref("kyberfox.cfg.categorySeeded", true);
```

The other audited prefs are unchanged: `toolkit.telemetry.enabled`, `datareporting.healthreport.uploadEnabled`, `app.normandy.enabled` and `kyberfox.cfg.version` are locked in the cfg and absent from `prefs.js`; `dom.security.https_only_mode` and `browser.startup.page` are still absent (policy and default). No `crashes/` or `saved-telemetry-pings/` directory appeared.

Open point for the Privacy page task. The strict feature prefs are defaults, not user values. Choosing Standard in Firefox's page only clears user values, so it would leave the strict defaults in force. The Kyber presets in that task must set Standard values explicitly.

## Welcome page (recommended add-ons)

`addons.mozilla.org` is contacted only after the user clicks "Install selected" on the first-run welcome page (`chrome://kyberfox/content/welcome.xhtml`), once per chosen add-on, at `https://addons.mozilla.org/firefox/downloads/latest/<slug>/latest.xpi`. The page itself makes no request: it shows no AMO icons, ratings, or counts, and the add-on list is read from a file shipped in the browser. "Skip" makes no request. Chosen add-ons then update through the normal add-on updater. The search engines the page offers (DuckDuckGo, Google, Brave Search, Startpage, Ecosia) are shipped by `settings/policies.json`; picking one contacts nothing until the user searches.
