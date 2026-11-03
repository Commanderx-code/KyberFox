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
| `media.gmp-manager.updateEnabled` | `false` | Gates the module lookup itself: while it is `false`, `GMPInstallManager.checkForAddons` returns no add-ons, so no Widevine download can start. |
| `media.gmp-manager.allowLocalSources` | `false` | No local module sources. |
| `media.gmp-widevinecdm.allow-chromium-update` | `false` | Widevine is not fetched from Chromium servers. |
| `media.gmp-widevinecdm.force-chromium-update` | `false` | Same. |
| `media.gmp-widevinecdm.force-chromium-beta` | `false` | Same. |
| `kyberfox.eme.gmp-clearkey.enabled` | `false` | Clear Key module off (depends on `media.eme.enabled`). |
| `media.gmp-gmpopenh264.enabled` | `false` | OpenH264 module off. |

Two ways to turn DRM on. Both set the same three prefs to `true`: `media.eme.enabled`, `media.gmp-manager.updateEnabled` and `media.gmp-widevinecdm.enabled`.

1. The settings checkbox "Play DRM-controlled content" (the `playDRMContent` setting). With the settings redesign on (the Firefox 159 default), it is in the media group of Tabs and browsing. In the legacy pane it is in General, under "Digital Rights Management (DRM) Content". Confirm the location on the built UI. The text under it reads: "Uses Google's closed-source Widevine module, downloaded when you turn this on." The checkbox is hidden unless `browser.eme.ui.enabled` is `true`, which Firefox sets only in builds with Widevine support (`MOZ_WIDEVINE_EME`).
2. The infobar. While `media.eme.enabled` is `false`, a site that asks for DRM playback shows a notification bar from `EncryptedMediaParent.sys.mjs`: "You must enable DRM to play some audio or video on this page." with an "Enable DRM" button. The button sets the three prefs above to `true` and reloads the page.

After EME is on, a site that asks for DRM playback triggers a second, separate prompt: the per-site Allow or Block permission prompt (`permissions.default.media-key-system-access` at `0` asks; `media.eme.require-app-approval` is `true`). It stores a per-site permission and does not start the download.

## Widevine download

Widevine is Google's closed-source content decryption module. Kyber Fox does not bundle it. It is downloaded after the user enables DRM, never before.

- Kyber Fox contacts nothing for Widevine on a fresh profile. `docs/network-audit.md` lists the hosts contacted with DRM off.
- After enabling, the lookup goes to Mozilla: `media.gmp-manager.url` is `https://aus5.mozilla.org/update/3/GMP/...` (set in the upstream `modules/libpref/init/all.js`; no Kyber or LibreWolf patch changes it). The module file then comes from the URL in that response, a Google host (commonly `redirector.gvt1.com`; not verified here). The owner confirms the hosts in step 7 of the procedure.
- `media.gmp-manager.allowLocalSources` is `false` in the cfg (upstream default `true`), which removes the offline fallback to local sources.
- The three Chromium prefs above (`allow-chromium-update`, `force-chromium-update`, `force-chromium-beta`) are `false`, so the Chromium update route is not used.

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
- Netflix 1080p needs a standard Firefox user agent. Kyber Fox keeps Firefox's own string: `general.useragent.compatMode.firefox` is `true` in `settings/kyberfox.cfg` ("Always use the Firefox UA"), and the cfg sets no custom `general.useragent.override`. `compatMode.firefox` is a patch pref, and under Strict resist fingerprinting the user agent stays Firefox's. If Netflix caps below 1080p, compare `navigator.userAgent` in the console, and check `general.useragent.*` in `about:config`, for a change first.
- Standard preset: `privacy.resistFingerprinting` is `false` and `privacy.resistFingerprinting.letterboxing` is `false` (also the cfg defaults). Firefox's lighter `privacy.fingerprintingProtection` is `true`. Streaming is not expected to be affected.
- Strict preset (Settings, Privacy and Security) turns `privacy.resistFingerprinting` and `privacy.resistFingerprinting.letterboxing` on. Resist fingerprinting rounds timers, reports the time zone as UTC, and letterboxes the window. It can break EME timing, so playback may stutter, fail to start, or cap in quality. Strict also sets `webgl.disabled` to `true`. If a service fails under Strict but works under Standard, record that in Notes; it is a known trade-off, not a release blocker.

## Owner procedure

Run this on the released build, installed the way a user installs it from [docs/install.md](install.md). Do not use a dev build, a CI artifact, or a profile that has other prefs set by hand: the cfg defaults, the download, and the update behavior differ.

1. Install the released build on Windows. Repeat everything below on Garuda (pacman package). Start with a new profile.
2. Open About Kyber Fox and copy the display version into the Build column.
3. In `about:config` confirm `media.eme.enabled`, `media.gmp-manager.updateEnabled` and `media.gmp-widevinecdm.enabled` are all `false`. If the settings checkbox is missing, check `browser.eme.ui.enabled`; it is `false` in builds without Widevine support, and the infobar is then the only route. Open a Netflix title now and note what the page says with DRM off.
4. Enable DRM: tick "Play DRM-controlled content" in Settings, or click "Enable DRM" in the infobar when Netflix asks, then answer the Allow or Block prompt that follows. Note which one you used, and copy the Allow or Block prompt text.
5. Wait for the Widevine module to finish downloading. Check `about:addons`, Plugins, for "Widevine Content Decryption Module provided by Google Inc." showing a version and enabled.
6. In `about:config` record the values of `media.eme.enabled`, `media.gmp-manager.updateEnabled` (all three should now be `true`), `media.gmp-widevinecdm.enabled` and `media.gmp-widevinecdm.version`.
7. While step 5 runs, watch outgoing connections (for example with the same method as `docs/network-audit.md`, Method section). Write the Widevine hosts you see into Notes, and update the rows "`aus5.mozilla.org` GMP lookup" and "Google Widevine download host(s)" in `docs/network-audit.md` to the exact names.
8. Play Netflix: start a title, open the stats overlay or player info, and record the resolution reached. Repeat for the YouTube baseline, a DRM-flagged YouTube title if one is available, and Spotify web player. Let each play for at least two minutes and seek once.
9. Switch the privacy preset to Strict, restart the browser, and repeat step 8 for Netflix only. Note the difference in Notes.
10. Fill the table. Replace every `TBD` you tested. Leave `TBD` where you did not test. Commit the change with a plain message.
