# Streaming and DRM check

Kyber Fox ships with DRM off. This page says how DRM is turned on, what to expect, and holds the checklist and results table for the playback test. The test needs real accounts and a released build, so the owner runs it on the owner's own machines. Every result cell below is `TBD` until then. Limits found during the test are documented here and do not block the release.

For install steps see [docs/install.md](install.md). For the hosts the browser contacts see [docs/network-audit.md](network-audit.md).

## How DRM is enabled

DRM stays off until the user turns it on. The shipped defaults in `settings/kyberfox.cfg` (section DRM) are:

| Pref | Default | Meaning |
|---|---|---|
| `media.eme.enabled` | `false` | Master switch for Encrypted Media Extensions (EME). |
| `media.gmp-widevinecdm.enabled` | `false` | Widevine module off. |
| `media.eme.require-app-approval` | `true` | Playback of DRM content needs permission. |
| `permissions.default.media-key-system-access` | `0` | Site permission default: 0 asks, 1 allows, 2 blocks. |
| `media.gmp-provider.enabled` | `true` | The module provider is available, so the download can start on enable. |
| `media.gmp-manager.updateEnabled` | `false` | Background module update checks are off. |
| `media.gmp-manager.allowLocalSources` | `false` | No local module sources. |
| `media.gmp-widevinecdm.allow-chromium-update` | `false` | Widevine is not fetched from Chromium servers. |
| `media.gmp-widevinecdm.force-chromium-update` | `false` | Same. |
| `media.gmp-widevinecdm.force-chromium-beta` | `false` | Same. |
| `kyberfox.eme.gmp-clearkey.enabled` | `false` | Clear Key module off (depends on `media.eme.enabled`). |
| `media.gmp-gmpopenh264.enabled` | `false` | OpenH264 module off. |

Two ways to turn DRM on:

1. Settings, Privacy and Security, Digital Rights Management group: tick "Play DRM-controlled content". The text under it reads: "Uses Google's closed-source Widevine module, downloaded when you turn this on."
2. The site prompt. With `permissions.default.media-key-system-access` at `0` and `media.eme.require-app-approval` at `true`, a site that asks for DRM playback triggers a prompt in the browser. Allowing it is the other way to start the Widevine download. The exact wording of the prompt is Firefox's own and is not changed by Kyber Fox; the owner should copy it into the Notes of the first row below.

Whether the checkbox flips `media.eme.enabled` and `media.gmp-widevinecdm.enabled`, and what the prompt does to them, is Firefox behavior that this page does not verify. The owner records the pref values after enabling (see procedure, step 6).

## Widevine download

Widevine is Google's closed-source content decryption module. Kyber Fox does not bundle it. It is downloaded after the user enables DRM, never before.

- Kyber Fox contacts nothing for Widevine on a fresh profile. `docs/network-audit.md` lists the hosts contacted with DRM off.
- After enabling, Firefox's module installer fetches the module. In upstream Firefox the lookup goes through the GMP update service and the file comes from a Google download host (commonly `redirector.gvt1.com`, then a Google CDN). These hostnames are not recorded anywhere in this repository and were not observed in an audit run. They are listed in `docs/network-audit.md` as "only after the user enables DRM", and the owner confirms the exact hosts in step 7 of the procedure.
- The Chromium update paths are disabled by the three `media.gmp-widevinecdm.*chromium*` prefs above.

## Results

Fill one row per platform for each service. Resolution reached is the highest quality the player offers and plays (for example 1080p, 720p, 480p, or none). Build is the display version from About Kyber Fox.

| Service | Platform | Build | Resolution reached | Result | Notes |
|---|---|---|---|---|---|
| Netflix | Windows | TBD | TBD | TBD | TBD |
| Netflix | Garuda | TBD | TBD | TBD | TBD |
| YouTube, non-DRM baseline | Windows | TBD | TBD | TBD | TBD |
| YouTube, non-DRM baseline | Garuda | TBD | TBD | TBD | TBD |
| YouTube, DRM-flagged title (rental or movie, if any) | Windows | TBD | TBD | TBD | TBD |
| YouTube, DRM-flagged title (rental or movie, if any) | Garuda | TBD | TBD | TBD | TBD |
| Spotify web player | Windows | TBD | TBD | TBD | TBD |
| Spotify web player | Garuda | TBD | TBD | TBD | TBD |

Spotify is the third Widevine service. Its resolution cell stays `n/a` if only audio plays; write the audio result in Notes.

## Known limits

- Widevine L3 only. Netflix does not offer 4K or HDR in any Firefox, so Kyber Fox does not either. Expect 1080p at best on Netflix.
- Netflix 1080p needs a standard Firefox user agent. Kyber Fox keeps Firefox's own string: `general.useragent.compatMode.firefox` is `true` in `settings/kyberfox.cfg` ("Always use the Firefox UA"), and the cfg sets no custom `general.useragent.override`. If Netflix caps below 1080p, check About Kyber Fox for a user-agent change first.
- Standard preset: `privacy.resistFingerprinting` is `false` and `privacy.resistFingerprinting.letterboxing` is `false` (also the cfg defaults). Firefox's lighter `privacy.fingerprintingProtection` is `true`. Streaming is not expected to be affected.
- Strict preset (Settings, Privacy and Security) turns `privacy.resistFingerprinting` and `privacy.resistFingerprinting.letterboxing` on. Resist fingerprinting rounds timers, reports the time zone as UTC, and letterboxes the window. It can break EME timing, so playback may stutter, fail to start, or cap in quality. Strict also sets `webgl.disabled` to `true`. If a service fails under Strict but works under Standard, record that in Notes; it is a known trade-off, not a release blocker.

## Owner procedure

Run this on the released build, installed the way a user installs it from [docs/install.md](install.md). Do not use a dev build, a CI artifact, or a profile that has other prefs set by hand: the cfg defaults, the download, and the update behavior differ.

1. Install the released build on Windows. Repeat everything below on Garuda (pacman package). Start with a new profile.
2. Open About Kyber Fox and copy the display version into the Build column.
3. In `about:config` confirm `media.eme.enabled` is `false` and `media.gmp-widevinecdm.enabled` is `false`. Open a Netflix title now and note what the page says with DRM off.
4. Enable DRM: tick "Play DRM-controlled content" in Settings, or accept the site prompt when Netflix asks. Note which one you used and copy the prompt text.
5. Wait for the Widevine module to finish downloading. Check `about:addons`, Plugins, for "Widevine Content Decryption Module provided by Google Inc." showing a version and enabled.
6. In `about:config` record the values of `media.eme.enabled`, `media.gmp-widevinecdm.enabled` and `media.gmp-widevinecdm.version`.
7. While step 5 runs, watch outgoing connections (for example with the same method as `docs/network-audit.md`, Method section). Write the Widevine hosts you see into Notes, and update the DRM row in `docs/network-audit.md` to the exact names.
8. Play Netflix: start a title, open the stats overlay or player info, and record the resolution reached. Repeat for the YouTube baseline, a DRM-flagged YouTube title if one is available, and Spotify web player. Let each play for at least two minutes and seek once.
9. Switch the privacy preset to Strict, restart the browser, and repeat step 8 for Netflix only. Note the difference in Notes.
10. Fill the table. Replace every `TBD` you tested. Leave `TBD` where you did not test. Commit the change with a plain message.
