# Content blocking research

Can a built-in blocker in the style of Brave Shields replace or complement uBlock Origin in Kyber Fox?

Status: **research**. Nothing here is a commitment to ship. Research date: 2026-11-04. Scope: Kyber Fox on Firefox 159 (release channel). Primary sources only; anything not verified is marked "unverified" and repeated in the last section.

What Kyber Fox does today: uBlock Origin is bundled, unmodified, and the toolbar shield turns blocking, fingerprinting protection and cookie blocking on or off per site, driving both uBlock Origin and Firefox's Enhanced Tracking Protection. See [shield-ublock-control.md](shield-ublock-control.md).

## Summary

- The Brave blocking engine (adblock-rust) is a standalone Rust crate under MPL-2.0, the same license as Gecko. The rest of Brave Shields is tied to Chromium. [adblock-rust](https://github.com/brave/adblock-rust), [brave-core DEPS](https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/browser/DEPS)
- Firefox already contains a fork of adblock-rust. It is the Content Classifier Service, present in the Firefox 159 tree, off by default, network-only, and fed by Mozilla's Remote Settings collection. [Content Classifier docs](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/content-classifier/index.html), [tree at FIREFOX_159_0_RELEASE](https://api.github.com/repos/mozilla-firefox/firefox/contents/toolkit/components/content-classifier?ref=FIREFOX_159_0_RELEASE), [pref defaults](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/modules/libpref/init/StaticPrefList.yaml)
- That changes the question. The cost of a native engine is mostly lists, cosmetic filtering, scriptlets, and UI, not the matching engine.
- A native engine cannot yet match uBlock Origin on cosmetic filtering, scriptlets, the logger, or user rules. Replacing uBlock Origin is not supported by the evidence here.
- Proposal (not a decision): keep uBlock Origin bundled. Optionally evaluate the in-tree Content Classifier as a complement behind a pref. Details in section 6.

## 1. Brave Shields components

### 1.1 adblock-rust (the engine)

- It is "Brave's Rust-based adblock engine". The README lists network blocking, cosmetic filtering, resource replacements, hosts syntax, uBlock Origin syntax extensions, and scriptlet injection and redirect rules that use uBlock Origin-compatible resources. [README](https://raw.githubusercontent.com/brave/adblock-rust/master/README.md)
- License: Mozilla Public License 2.0. The LICENSE file is the full MPL 2.0 text, and `Cargo.toml` says `license = "MPL-2.0"`. [LICENSE](https://raw.githubusercontent.com/brave/adblock-rust/master/LICENSE), [Cargo.toml](https://raw.githubusercontent.com/brave/adblock-rust/master/Cargo.toml)
- Current version: 0.13.5, published to crates.io on 2026-10-28. Version 0.13.4 was published the same day. [crates.io API](https://crates.io/api/v1/crates/adblock), [CHANGELOG](https://raw.githubusercontent.com/brave/adblock-rust/master/CHANGELOG.md)
- The GitHub Releases page is empty. Versions are tracked through crates.io and the CHANGELOG. [Releases](https://github.com/brave/adblock-rust/releases)
- It builds as a standalone Rust crate. The package name is `adblock`, edition 2024, and it has no dependency on Chromium or brave-core. The published dependencies are general crates: `regex`, `flatbuffers`, `idna`, `serde`, `seahash`, `memchr`, `addr` (optional), `cssparser` and `selectors` (optional), and others. [Cargo.toml](https://raw.githubusercontent.com/brave/adblock-rust/master/Cargo.toml)
- Cargo features: `embedded-domain-resolver` (default, pulls in `addr`), `full-regex-handling`, `single-thread` (default), `css-validation`, `content-blocking`, `resource-assembler`, `debug-info`. [Cargo.toml](https://raw.githubusercontent.com/brave/adblock-rust/master/Cargo.toml)
- Public API relevant to a browser: `check_network_request`, `url_cosmetic_resources`, `hidden_class_id_selectors`, `get_csp_directives`, `use_resources`, and `serialize`/`deserialize` (with a checksum that rejects truncated or corrupt data). [docs.rs Engine](https://docs.rs/adblock/latest/adblock/struct.Engine.html)
- Churn: the serialized DAT format changed in 0.13.0, 0.13.1, 0.13.3, and 0.13.4, so cached engines must be rebuilt on upgrade. 0.13.0 removed `EngineOptions` and `BlockerResult.matched`. [CHANGELOG](https://raw.githubusercontent.com/brave/adblock-rust/master/CHANGELOG.md)
- The repo has a fuzz directory with fuzz targets and a security policy that routes reports to Brave's HackerOne program. [fuzz dir](https://api.github.com/repos/brave/adblock-rust/contents/fuzz), [SECURITY.md](https://raw.githubusercontent.com/brave/adblock-rust/master/SECURITY.md)
- Activity: last push 2026-10-28, not archived. [GitHub API](https://api.github.com/repos/brave/adblock-rust)

### 1.2 adblock-resources (scriptlets and list catalog)

- Description: "Custom resources and scriptlets used for Brave's adblocker." License: MPL-2.0. [repo](https://github.com/brave/adblock-resources), [LICENSE](https://raw.githubusercontent.com/brave/adblock-resources/master/LICENSE)
- It holds `resources/` (scriptlets and redirect resources), `filter_lists/` (the list catalog, with component IDs and public keys), and tooling that builds `dist/resources.json`. [repo](https://github.com/brave/adblock-resources)
- The list catalog lists the sources of Brave's default lists. "Brave Default Adblock Filters" is built from uBlock Origin's uAssets filters, EasyList, the URLhaus malware filter, and Brave's own lists. "Brave Default Privacy Filters" is EasyPrivacy plus uAssets `privacy.txt`. [list_catalog.json](https://raw.githubusercontent.com/brave/adblock-resources/master/filter_lists/list_catalog.json)
- Practical meaning: Brave's blocking coverage largely comes from the same community lists uBlock Origin uses, run through a different engine.

### 1.3 brave-core `components/brave_shields` and related components

- brave-core is licensed MPL-2.0. [LICENSE](https://raw.githubusercontent.com/brave/brave-core/master/LICENSE)
- `components/brave_shields` has `content`, `core`, `ios`, and `resources` directories. `core/browser` and `content/browser` contain the service layer: filter providers, component installer, the engine wrapper, subscriptions, and the domain-block page. [brave_shields tree](https://github.com/brave/brave-core/tree/master/components/brave_shields), [core/browser](https://api.github.com/repos/brave/brave-core/contents/components/brave_shields/core/browser), [content/browser](https://api.github.com/repos/brave/brave-core/contents/components/brave_shields/content/browser)
- Chromium dependence is heavy. The `core/browser` DEPS file allows only Chromium paths: `components/component_updater`, `components/content_settings/core`, `components/prefs`, `components/keyed_service`, `components/value_store`, `crypto`. The BUILD.gn depends on `//base`, `//url`, and Chromium `//components/*`. [DEPS](https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/browser/DEPS), [BUILD.gn](https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/browser/BUILD.gn)
- Cosmetic filtering is a separate component, `components/cosmetic_filters`, with `browser`, `common`, `renderer`, and `resources`. The renderer part depends on `content/public/renderer`, `third_party/blink/public`, `v8/include`, and `gin`. [cosmetic_filters](https://api.github.com/repos/brave/brave-core/contents/components/cosmetic_filters), [renderer DEPS](https://raw.githubusercontent.com/brave/brave-core/master/components/cosmetic_filters/renderer/DEPS)
- The Rust engine is wrapped by a small crate, `adblock-cxx` (MPL-2.0), which depends on `adblock` v0.13, `serde_json`, and `thiserror`, and is built through GN's `rust_static_library`. [rs/BUILD.gn](https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/common/adblock/rs/BUILD.gn), [rs/Cargo.toml](https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/common/adblock/rs/Cargo.toml)
- Brave builds Rust crates with Chromium's build system (GN and `gnrt`), not Cargo, and vendors crates under `third_party/rust`. [brave-core docs/rust.md](https://raw.githubusercontent.com/brave/brave-core/master/docs/rust.md)
- Verdict on reuse: the engine (adblock-rust) is reusable. The rest of Shields (providers, installer, UI, Blink renderer handlers) is written against Chromium internals and is not a drop-in for Gecko. The only part of brave-core that carries over as a pattern is the thin cxx wrapper.
- Shields features other than list blocking (fingerprinting, cookies, HTTPS upgrades) are in other brave-core components. This research did not review them. Unverified.

## 2. Technical integration paths into Gecko

### 2.0 Key finding: Gecko already has an adblock-rust fork

- Gecko has a "Content Classifier Service": "the anti-tracking component that classifies network channels against adblock-format filter lists delivered through Remote Settings." It runs beside the older URL Classifier. [docs](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/content-classifier/index.html)
- Source layout: `toolkit/components/content-classifier/` with `ContentClassifierService.cpp`, `content_classifier_engine/` (C++ glue), `etp_engine/` (the Rust crate), a Remote Settings client, and tests. [directory listing](https://api.github.com/repos/mozilla-firefox/firefox/contents/toolkit/components/content-classifier)
- The directory exists in the `FIREFOX_159_0_RELEASE` tag. [listing at tag](https://api.github.com/repos/mozilla-firefox/firefox/contents/toolkit/components/content-classifier?ref=FIREFOX_159_0_RELEASE)
- The landing bug is "Add a prototype rich content blocking engine", target milestone 149, status fixed. [Bug 2013888](https://bugzilla.mozilla.org/rest/bug/2013888)
- `etp_engine` is forked from adblock-rust v0.12.1. License MPL-2.0, except `src/url_parser/parser.rs`, which is dual Apache-2.0/MIT from Servo's rust-url. [etp_engine README](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/README.md), [moz.yaml](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/moz.yaml)
- Mozilla's fork removed `cssparser`, `selectors`, and `addr` to avoid duplicate crate versions and about 2.9 MB of public-suffix data. It requires the embedder to set a domain resolver, which Gecko backs with nsIEffectiveTLDService. It updates manually by applying upstream diffs, and does not use `./mach vendor`. [etp_engine README](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/README.md)
- It is off by default: `privacy.trackingprotection.content.protection.enabled` and `privacy.trackingprotection.content.annotation.enabled` are both `false` on main. [StaticPrefList.yaml](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/modules/libpref/init/StaticPrefList.yaml) The `FIREFOX_159_0_RELEASE` source used for Kyber Fox's development build also has `privacy.trackingprotection.content.protection.enabled` set to `false`, and its `etp_engine/README.md` names adblock-rust 0.12.1 as the corresponding release (checked locally).
- The service runs in the parent process (`MOZ_ASSERT(XRE_IsParentProcess())`). Engine builds run on a background queue. Classification runs on the URL-classifier worker thread, called from `AsyncUrlChannelClassifier.cpp`. [ContentClassifierService.cpp](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/ContentClassifierService.cpp), [docs](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/antitracking/docs/content-classifier/index.md)
- Today's feature table maps to Mozilla lists, not EasyList: `disconnect-tracker-base`, `disconnect-tracker-content`, `mozilla-social`, `disconnect-fingerprinters-base`, `disconnect-email-base`, `disconnect-cryptominer-base`, `mozilla-harmful-addon`, plus exception lists. [ContentClassifierService.cpp](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/ContentClassifierService.cpp)
- The docs describe network request classification only. They do not mention cosmetic filtering. [docs](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/content-classifier/index.html)
- It is a prototype by its own bug title. Mozilla has not announced it as a product feature. This research found no Mozilla statement of intent in primary sources. Unverified.

### 2.1 Path (a): a Rust crate linked into Gecko

How Gecko takes Rust crates:

- Third-party crates are vendored into `third_party/rust`. Adding a crate means running `mach vendor rust`. [Rust in the build system](https://firefox-source-docs.mozilla.org/build/buildsystem/rust.html)
- `mach vendor rust` checks licenses and runs `cargo vet`. "All vendored crates must be audited." Unaudited crates need `mach cargo vet`, with attention to `unsafe` code and test quality. [same page](https://firefox-source-docs.mozilla.org/build/buildsystem/rust.html)
- Crates for libxul go in `toolkit/library/rust/shared/Cargo.toml` and are linked as `libgkrust.a`. Only one `RustLibrary` may be linked into a binary. All of mozilla-central shares one `Cargo.lock`. [same page](https://firefox-source-docs.mozilla.org/build/buildsystem/rust.html)
- The minimum Rust version in the tree is 1.95.0, which covers adblock-rust's edition 2024. [mozboot/util.py](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/python/mozboot/mozboot/util.py)
- Dependency overlap with upstream adblock-rust 0.13.5: `regex` 1.12.3, `flatbuffers`, `seahash`, `base64`, `arrayvec`, `bitflags`, and `cssparser` are already in `third_party/rust`. `regex` is at the exact version adblock-rust asks for. `addr` and `psl` are not in the tree. [regex Cargo.toml](https://api.github.com/repos/mozilla-firefox/firefox/contents/third_party/rust/regex/Cargo.toml), [flatbuffers](https://api.github.com/repos/mozilla-firefox/firefox/contents/third_party/rust/flatbuffers), [seahash](https://api.github.com/repos/mozilla-firefox/firefox/contents/third_party/rust/seahash)
- This research did not check the other dependencies (`idna`, `memchr`, `itertools`, `rustc-hash`, `thiserror`, `serde_json`, `percent-encoding`) or their versions. Unverified.

Hooking requests:

- The in-tree answer is the URL classifier channel path: `AsyncUrlChannelClassifier.cpp` calls the engine and the main thread applies the result (cancel or annotate). [docs](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/antitracking/docs/content-classifier/index.md)
- `nsIContentPolicy` is the other in-tree hook. Implementations return ACCEPT or REJECT from `ShouldLoad`, and callers use `NS_CheckContentLoadPolicy`. [nsContentPolicyUtils.h](https://searchfox.org/mozilla-central/source/dom/base/nsContentPolicyUtils.h), [example policy](https://searchfox.org/firefox-main/source/dom/security/IntegrityPolicyService.cpp)
- `http-on-modify-request` observers: This research did not verify their current status or constraints in a primary source. Unverified.

Cosmetic filtering:

- The engine produces the data (`url_cosmetic_resources`, `hidden_class_id_selectors`). [docs.rs](https://docs.rs/adblock/latest/adblock/struct.Engine.html)
- Gecko has no code to inject it. Brave does this in a Blink renderer component. [cosmetic_filters renderer](https://api.github.com/repos/brave/brave-core/contents/components/cosmetic_filters/renderer)
- A Gecko version would need new parent-to-content plumbing, a stylesheet or JS-actor injection path, and handling of procedural and `:has()`-style filters. This is an estimate of the work. No primary source describes it.

Pros:

- Native speed, no extension startup cost, and works in all windows and in private browsing without extension permissions.
- Reuses code Mozilla already carries, so a Kyber Fox patch could stay small.
- Same MPL-2.0 license as Gecko.

Cons:

- Kyber Fox must rebase the patch on every Firefox release. Mozilla's own crate is hand-forked and manually updated. [etp_engine README](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/README.md)
- Only network matching exists. Cosmetic filtering, scriptlets, and redirect resources would be new work.
- Lists must be delivered somehow (section 3).

Rough complexity (estimate): enable and evaluate the existing engine, low to medium. Add third-party lists through your own list delivery, medium. Add cosmetic filtering and scriptlets in Gecko, high.

### 2.2 Path (b): a WebExtension using blocking webRequest

- Firefox supports blocking `webRequest`. It needs the `webRequest` and `webRequestBlocking` permissions plus host permissions. `onBeforeRequest` can cancel or redirect. `filterResponseData` can rewrite response bodies. [MDN webRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest)
- Mozilla states Firefox keeps Manifest V2 alongside V3 and "will continue supporting both blockingWebRequest and declarativeNetRequest." [Mozilla blog, 2025-02-25](https://blog.mozilla.org/en/products/firefox/firefox-manifest-v3-adblockers/)
- This is what uBlock Origin does today on Firefox. The uBlock Origin README says it "works best on Firefox." [uBO README](https://raw.githubusercontent.com/gorhill/uBlock/master/README.md)
- An extension built on adblock-rust compiled to WASM is possible, since the README lists WASM as a compile target. [adblock-rust README](https://raw.githubusercontent.com/brave/adblock-rust/master/README.md)
- An extension built on the JS library `@ghostery/adblocker` (MPL-2.0) is also possible. It is described as an "efficient embeddable adblocker library" for Chrome and Firefox. [ghostery/adblocker](https://github.com/ghostery/adblocker)
- Pros: no Gecko patches, ships and updates independently, full cosmetic support through content scripts, and it is the path that already works.
- Cons: this is the same architecture as uBlock Origin, so it adds little. Kyber Fox would be writing and maintaining a second blocker that competes with the one it already bundles.
- Rough complexity (estimate): medium to high for a feature-complete extension. Low only if an existing extension is bundled.

### 2.3 Path (c): Firefox's own URL Classifier and ETP with Disconnect lists

- ETP Standard turns Tracking Protection off in normal windows and on in private windows. Strict turns most protections on in both and enables the Level 2 tracking list and Query Parameter Stripping. [ETP matrix](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/etp-matrix/index.html)
- The lists are Disconnect's tracking, fingerprinting, cryptomining, and social lists. "Mozilla does not maintain these lists." [ETP matrix](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/etp-matrix/index.html), [shavar-prod-lists](https://github.com/mozilla-services/shavar-prod-lists)
- Lists reach clients through the Shavar service (client check every 6 hours) and, increasingly, Remote Settings. Disconnect list changes land every two to three months. [Tracking Lists](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/tracking-lists/index.html)
- Coverage is third-party trackers only. It is not an ad blocker, has no cosmetic filtering, and no user-visible filter list control. This follows from the lists described above. It is an inference, not a Mozilla statement.
- Pros: zero engineering, already shipped, and already driven by the Kyber Fox shield toggle.
- Cons: no ad blocking and no annoyance filtering.
- Rough complexity (estimate): none.

## 3. Filter lists

| List | License | Source |
|---|---|---|
| EasyList and EasyPrivacy | Dual license: GNU GPL v3 or later, or Creative Commons Attribution-ShareAlike 3.0 Unported or later. Attribution as source is required where applicable. | [easylist.to licence](https://easylist.to/pages/licence.html) |
| uBlock Origin lists (uAssets) | GPL-3.0. The list header points to the uAssets LICENSE. | [uAssets LICENSE](https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/LICENSE), [list header](https://ublockorigin.github.io/uAssets/filters/filters.txt) |
| uBlock Origin extension | GPL-3.0 | [LICENSE.txt](https://raw.githubusercontent.com/gorhill/uBlock/master/LICENSE.txt) |
| Brave lists (`brave/adblock-lists`) | MPL-2.0. No separate terms of use stated. | [repo](https://github.com/brave/adblock-lists) |
| Brave scriptlets and resources | MPL-2.0 | [LICENSE](https://raw.githubusercontent.com/brave/adblock-resources/master/LICENSE) |
| Disconnect lists | Not stated on the pages that were read. The Mozilla mirror repo is MPL with unnamed exceptions. | [shavar-prod-lists LICENSE](https://raw.githubusercontent.com/mozilla-services/shavar-prod-lists/master/LICENSE) |

Notes:

- The EasyList licence page says externally hosted files may be under other conditions and permission must come from their holders. EasyPrivacy is among the exempt named subscriptions. [easylist.to licence](https://easylist.to/pages/licence.html)
- Mozilla did not import adblock-rust's test data because the fixtures are third-party filter lists whose licensing it called incompatible with MPL-2.0. [etp_engine README](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/README.md)
- Fetching GPL or CC-licensed lists at runtime is how uBlock Origin and Brave both operate today. Bundling those lists inside a Kyber Fox binary is a different act. Whether it is acceptable alongside MPL-2.0 code is a legal question This research did not resolve. See the last section.

Update mechanisms and cadence:

- EasyList header: "Expires: 4 days (update frequency)", and the list had a version stamp of 2026-11-04 when fetched. [easylist.txt](https://easylist.to/easylist/easylist.txt)
- uBlock filters header: "Expires: 5 days", last modified 2026-11-02 when fetched. [filters.txt](https://ublockorigin.github.io/uAssets/filters/filters.txt)
- uBlock Origin fetches from `ublockorigin.github.io`, with fallback CDNs at `ublockorigin.pages.dev` and jsDelivr. [assets.json](https://raw.githubusercontent.com/gorhill/uBlock/master/assets/assets.json)
- Brave's catalog points straight at raw GitHub and other upstream URLs. The `brave-core-crx-packager` repo builds them into signed component packages that clients fetch. The catalog entries carry component IDs and public keys. [adblock-lists README](https://github.com/brave/adblock-lists), [list_catalog.json](https://raw.githubusercontent.com/brave/adblock-resources/master/filter_lists/list_catalog.json)
- Mozilla's delivery for its engine is the `content-classifier-lists` Remote Settings collection, with attachments downloaded on demand, cached on disk, and fallback to a packaged dump. [RS client](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/ContentClassifierRemoteSettingsClient.sys.mjs)
- Remote Settings syncs on push and every 24 hours, and checks the SHA-256 hash and size of attachments. [Remote Settings docs](https://firefox-source-docs.mozilla.org/services/settings/index.html) A sync verifies the collection's content signature when the build has signature checking on (`REMOTE_SETTINGS_VERIFY_SIGNATURE`); re-checking already stored data on each read is optional (`verifySignature` in `RemoteSettingsClient.get`). [RemoteSettingsClient.sys.mjs](https://searchfox.org/firefox-main/source/services/settings/RemoteSettingsClient.sys.mjs)
- The collection is published by Mozilla. A Kyber Fox build that wants EasyList or uBlock lists in the native engine needs its own delivery channel: its own Remote Settings-compatible server and signing keys, or its own download and verification code. The only built-in alternative This research found is the `test_list_urls` prefs, which are labeled test-only. [docs](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/antitracking/docs/content-classifier/index.md)
- Hosting needs for a self-run channel (estimate): a static origin with HTTPS, a signing key, a scheduled job to pull upstream lists, and a rollback path. Update frequency should match upstream, so roughly daily pulls.

## 4. Maintenance and security implications

- Parse surface: the engine parses remotely fetched filter text, builds regexes, and deserializes a FlatBuffers cache. Mozilla's engine does this in the parent process. [ContentClassifierService.cpp](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/ContentClassifierService.cpp)
- Memory safety: the engine is Rust, which removes most memory-corruption classes. It still uses `regex` and FlatBuffers, and unsafe code in dependencies is covered by the `cargo vet` expectations above. [Rust in the build system](https://firefox-source-docs.mozilla.org/build/buildsystem/rust.html)
- Cache safety: `deserialize` uses a checksum to reject truncated or corrupt data. 0.13.4 skips FlatBuffers verification for cache files written and read by the same version. That is a trust decision about the on-disk cache, which matters if the profile is not trusted. [docs.rs](https://docs.rs/adblock/latest/adblock/struct.Engine.html), [CHANGELOG](https://raw.githubusercontent.com/brave/adblock-rust/master/CHANGELOG.md)
- Denial of service: a malformed or hostile list could cause slow regexes or large memory use. The engine exposes `set_regex_discard_policy`, and 0.13.0 parses filters iteratively to reduce peak memory. [CHANGELOG](https://raw.githubusercontent.com/brave/adblock-rust/master/CHANGELOG.md) This research did not find a documented worst-case bound. Unverified.
- Sandboxing: running the classifier in the parent process means a bug is not contained by the content-process sandbox. Mozilla's own docs say the author is unsure the engine lookup is threadsafe. [docs](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/antitracking/docs/content-classifier/index.md)
- An extension sits in a different place. uBlock Origin parses lists in the extension process, with the extension sandbox and permission model around it. This research did not verify extension-process isolation details for Firefox in a primary source. Unverified.
- Rebase cost: Mozilla's fork is manual, and Updatebot only files bugs. If Kyber Fox carries its own newer fork, it owns merges against Mozilla's changes to `toolkit/components/content-classifier/`. [etp_engine README](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/README.md)
- Update cadence compared with uBlock Origin: filter lists update every few days for both. Engine code updates only with a browser release for a native engine. uBlock Origin ships fixes independently of the browser. The uAssets `quick-fixes` list is a fast-path list for broken sites. [assets.json](https://raw.githubusercontent.com/gorhill/uBlock/master/assets/assets.json)
- Mozilla's Disconnect-list updates, by contrast, land every two to three months. [Tracking Lists](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/tracking-lists/index.html)
- Version drift: upstream adblock-rust is at 0.13.5 and Mozilla's fork is at 0.12.1, with format changes between them. [crates.io](https://crates.io/api/v1/crates/adblock), [moz.yaml](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/moz.yaml)

## 5. Alternatives

| Option | License | Notes | Source |
|---|---|---|---|
| Keep uBlock Origin bundled (status quo) | GPL-3.0 | Uses EasyList, EasyPrivacy, Peter Lowe's list, malware lists, and uBO lists by default. Firefox is its recommended browser. | [README](https://raw.githubusercontent.com/gorhill/uBlock/master/README.md) |
| Firefox ETP Strict | Firefox (MPL-2.0 code); Disconnect lists not stated | Tracker blocking and Level 2 list. No ads, no cosmetic filtering. | [ETP matrix](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/etp-matrix/index.html) |
| In-tree Content Classifier (complement) | MPL-2.0 (one Apache/MIT file) | Off by default. Needs a list channel. Network only. | [docs](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/content-classifier/index.html) |
| AdGuard Browser Extension | GPL-3.0 | Alternative full blocker. | [LICENSE](https://raw.githubusercontent.com/AdguardTeam/AdguardBrowserExtension/master/LICENSE) |
| `@ghostery/adblocker` library | MPL-2.0 | JavaScript engine for building an extension. Not a finished product by itself. | [repo](https://github.com/ghostery/adblocker) |
| Privacy Badger | GPL-3.0 or later | Learning tracker blocker. Complements rather than replaces a list blocker. | [LICENSE](https://raw.githubusercontent.com/EFForg/privacybadger/master/LICENSE) |

- Adblock Plus: This research could not fetch its license file from the repo path tried. Unverified.
- uBlock Origin Lite: it is listed as a related project, but the README does not describe its differences. Unverified. [README](https://raw.githubusercontent.com/gorhill/uBlock/master/README.md)

## 6. Proposal (for discussion, not a decision)

Kyber Fox keeps Mozilla's Remote Settings for security data ([network-audit.md](network-audit.md)), so the in-tree engine's list channel would reach a Kyber Fox build if Mozilla turned it on.

Facts that drive it:

1. uBlock Origin on Firefox is supported today, and Mozilla says blocking `webRequest` stays. [Mozilla blog](https://blog.mozilla.org/en/products/firefox/firefox-manifest-v3-adblockers/)
2. Brave's own default lists are mostly uBlock Origin and EasyList content, so swapping the engine does not change the filtering data much. [list_catalog.json](https://raw.githubusercontent.com/brave/adblock-resources/master/filter_lists/list_catalog.json)
3. Brave's non-engine Shields code is Chromium-specific. [DEPS](https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/browser/DEPS)
4. Gecko already carries an adblock-rust fork that is network-only and off by default. [docs](https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/content-classifier/index.html)

Proposed direction:

- Do not replace uBlock Origin. A native engine today lacks cosmetic filtering, scriptlets, and the uBlock Origin feature set. The docs do not list them as present.
- Keep the current shield toggle, uBlock Origin, and ETP. No code change.
- Run a time-boxed experiment, on a development profile only: set the two Content Classifier prefs and measure what the in-tree engine does. Use `test_list_urls` with a local copy of a list, kept out of any release build. This answers whether the engine is stable enough to build on.
- Decide on a list channel only if the experiment is promising. The options are: wait for Mozilla to publish more lists; run Kyber Fox's own signed list service; or skip the native path.
- Revisit when Mozilla's prototype changes. Watch the bug and the `toolkit/components/content-classifier/` directory.
- Do not start a Gecko cosmetic-filtering project until there is a clear user need uBlock Origin does not meet.

Open questions for the owner:

- Is the goal to remove the bundled extension (for example to have blocking in a state with no extension), or to add a second layer?
- Is Kyber Fox willing to run list-signing infrastructure?
- Is the licensing position on shipping GPL or CC lists inside a binary settled?

## Sources

Brave and adblock-rust
- https://github.com/brave/adblock-rust
- https://raw.githubusercontent.com/brave/adblock-rust/master/Cargo.toml
- https://raw.githubusercontent.com/brave/adblock-rust/master/LICENSE
- https://raw.githubusercontent.com/brave/adblock-rust/master/README.md
- https://raw.githubusercontent.com/brave/adblock-rust/master/CHANGELOG.md
- https://raw.githubusercontent.com/brave/adblock-rust/master/SECURITY.md
- https://github.com/brave/adblock-rust/releases
- https://api.github.com/repos/brave/adblock-rust
- https://api.github.com/repos/brave/adblock-rust/contents/fuzz
- https://crates.io/api/v1/crates/adblock
- https://docs.rs/adblock/latest/adblock/struct.Engine.html
- https://github.com/brave/adblock-resources
- https://raw.githubusercontent.com/brave/adblock-resources/master/LICENSE
- https://raw.githubusercontent.com/brave/adblock-resources/master/filter_lists/list_catalog.json
- https://github.com/brave/adblock-lists
- https://github.com/brave/brave-core/tree/master/components/brave_shields
- https://raw.githubusercontent.com/brave/brave-core/master/LICENSE
- https://api.github.com/repos/brave/brave-core/contents/components/brave_shields/core/browser
- https://api.github.com/repos/brave/brave-core/contents/components/brave_shields/content/browser
- https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/browser/DEPS
- https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/browser/BUILD.gn
- https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/common/adblock/rs/BUILD.gn
- https://raw.githubusercontent.com/brave/brave-core/master/components/brave_shields/core/common/adblock/rs/Cargo.toml
- https://api.github.com/repos/brave/brave-core/contents/components/cosmetic_filters
- https://api.github.com/repos/brave/brave-core/contents/components/cosmetic_filters/renderer
- https://raw.githubusercontent.com/brave/brave-core/master/components/cosmetic_filters/renderer/DEPS
- https://raw.githubusercontent.com/brave/brave-core/master/docs/rust.md

Gecko and Mozilla
- https://firefox-source-docs.mozilla.org/build/buildsystem/rust.html
- https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/content-classifier/index.html
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/antitracking/docs/content-classifier/index.md
- https://api.github.com/repos/mozilla-firefox/firefox/contents/toolkit/components/content-classifier
- https://api.github.com/repos/mozilla-firefox/firefox/contents/toolkit/components/content-classifier?ref=FIREFOX_159_0_RELEASE
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/README.md
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/etp_engine/moz.yaml
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/ContentClassifierService.cpp
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/content-classifier/ContentClassifierRemoteSettingsClient.sys.mjs
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/modules/libpref/init/StaticPrefList.yaml
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/python/mozboot/mozboot/util.py
- https://bugzilla.mozilla.org/rest/bug/2013888
- https://api.github.com/repos/mozilla-firefox/firefox/contents/third_party/rust/regex/Cargo.toml
- https://api.github.com/repos/mozilla-firefox/firefox/contents/third_party/rust/flatbuffers
- https://api.github.com/repos/mozilla-firefox/firefox/contents/third_party/rust/seahash
- https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/etp-matrix/index.html
- https://firefox-source-docs.mozilla.org/toolkit/components/antitracking/anti-tracking/tracking-lists/index.html
- https://firefox-source-docs.mozilla.org/services/settings/index.html
- https://searchfox.org/mozilla-central/source/dom/base/nsContentPolicyUtils.h
- https://searchfox.org/firefox-main/source/dom/security/IntegrityPolicyService.cpp
- https://github.com/mozilla-services/shavar-prod-lists
- https://raw.githubusercontent.com/mozilla-services/shavar-prod-lists/master/LICENSE
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest
- https://blog.mozilla.org/en/products/firefox/firefox-manifest-v3-adblockers/

Lists and extensions
- https://easylist.to/pages/licence.html
- https://easylist.to/easylist/easylist.txt
- https://github.com/easylist/easylist
- https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/LICENSE
- https://github.com/uBlockOrigin/uAssets
- https://ublockorigin.github.io/uAssets/filters/filters.txt
- https://raw.githubusercontent.com/gorhill/uBlock/master/assets/assets.json
- https://raw.githubusercontent.com/gorhill/uBlock/master/LICENSE.txt
- https://raw.githubusercontent.com/gorhill/uBlock/master/README.md
- https://raw.githubusercontent.com/AdguardTeam/AdguardBrowserExtension/master/LICENSE
- https://github.com/ghostery/adblocker
- https://raw.githubusercontent.com/EFForg/privacybadger/master/LICENSE

## Unverified / needs review

- Whether Mozilla intends to ship the Content Classifier as a product feature, and its roadmap. Only the bug title ("prototype") is primary evidence.
- Remaining dependency overlap and versions between adblock-rust 0.13.5 and `third_party/rust` (`idna`, `memchr`, `itertools`, `rustc-hash`, `thiserror`, `serde_json`, `percent-encoding`).
- Current constraints on `http-on-modify-request` observers in Gecko, and a primary-source description of the Gecko UrlClassifier internals. Those firefox-source-docs pages returned 404, and the Content Classifier docs were the nearest primary source.
- License of the Disconnect lists and which files are the "exceptions" in the shavar-prod-lists LICENSE.
- Legal question: whether bundling GPL-3.0 (uAssets) or GPL/CC-BY-SA (EasyList) list files inside a Kyber Fox binary is compatible with distribution terms. Runtime download is what Brave and uBlock Origin do. Needs a licensing review.
- Whether `content-classifier-lists` is a signed collection in Mozilla's Remote Settings, so that the sync-time signature check applies to it.
- Worst-case parse time and memory use of adblock-rust on hostile lists. Not documented in the sources that were read.
- Isolation properties of the Firefox extension process compared with the parent process.
- The rest of Brave Shields (fingerprinting, cookie, HTTPS features) was not reviewed.
- Adblock Plus license file (path returned 404) and uBlock Origin Lite differences.
- Waterfox reportedly adopted adblock-rust, per a news site. This research did not find a primary source, so it is left out of the findings.
- Complexity ratings and hosting requirements in sections 2 and 3 are estimates, not sourced facts.
