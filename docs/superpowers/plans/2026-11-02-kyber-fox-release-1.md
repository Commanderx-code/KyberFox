# Kyber Fox Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a friends release of Kyber Fox for Windows and Linux: Firefox's layout with workspaces, a per-site shield, built-in themes, removed telemetry and AI, and approved one-click updates.

**Architecture:** The repo holds no Firefox source. Python tools download a pinned Firefox tarball, apply a reviewed subset of LibreWolf's patches plus Kyber patches, copy an overlay of new files into the tree, and build with `mach`. New browser features live in one component, `browser/components/kyberfox/`, to keep the patch surface small for the 4-week rebase.

**Tech Stack:** Python 3 stdlib plus pytest (tools), Firefox `mach`, chrome JavaScript and CSS, mochitest and xpcshell, GitHub Actions, GitHub Pages and Releases, NSIS, pacman.

**Spec:** `docs/superpowers/specs/2026-11-02-kyber-fox-design.md`

**Out of scope:** word-code sync, Glass, Android and iOS. Each gets its own plan.

## Global Constraints

- Starting pins: Firefox `159.0`, LibreWolf `159.0-1`, uBlock Origin `1.75.2`.
- App name `Kyber Fox`, binary and ids `kyberfox`, pref prefix `kyberfox.`, US English in all text.
- All first-party code is MPL-2.0. Keep notices on Firefox, LibreWolf (MPL-2.0), firefox-gx, firefox-one and starry-fox code.
- uBlock Origin is GPL-3.0. It ships unmodified and unbundled from the MPL code, with its license and source link in `about:license`.
- Never use Firefox, Mozilla or Opera names or logos as branding. Never copy code from Glass-Firefox-Theme or LIQUID-GLASS.
- Commits carry no AI attribution. Docs name no AI tools.
- The repo is public. Secrets, keys, `.env` files and personal details never enter it. Real values live in a private folder outside the repo, and in GitHub environment secrets for CI. Only `.env.example` and public `.der` certificates are tracked.
- Actions come from GitHub or the allowlist, currently `jlumbroso/free-disk-space` and `mozilla-actions/sccache-action`, pinned to commit SHAs. Workflow tokens default to read-only. Adding an action means adding it to the repo allowlist.
- Budget: free services, with no more than $25/month in the friends phase. Ask the owner before exceeding that.
- Security fixes target 72 hours from the Firefox release. A broken feature or skin ships disabled and never holds a security release.
- Nothing reaches users without the owner's one-click approval.
- Release builds use no PGO or LTO on free runners. This makes the browser somewhat slower than official Firefox, and it is accepted for the friends phase.

## Review Focus

1. A tampered or wrongly signed update reaches a client. It must be refused, and the current version must keep working. Test in Task 15.
2. A session restores tabs whose workspace was deleted or is unknown. No tab may disappear. Test in Task 6.
3. A theme, skin or custom CSS hides the toolbar. The user must still recover, and Troubleshoot Mode must start with no theme. Test in Task 12.
4. Shield changes made in a private window must not persist after it closes. Test in Task 8.
5. Firefox ships a point release before LibreWolf catches up. Assembly must work with a newer Firefox pin and report only the patches that fail. Test in Task 1.

## Owner Steps

These need the owner, and tasks stop until they are done:

- Create the `release` GitHub environment with the owner as required reviewer (Task 16).
- Generate and store the MAR signing key offline, with a copy in the `release` environment secrets (Task 15).
- Create a Google API key for Safe Browsing (Task 3).
- Generate the pacman repo signing key (Task 14).
- Choose a final logo before friends install (Task 19).

## Repo Layout

```
pins.toml                     pinned versions and hashes
Makefile                      assemble, build, package, test targets
tools/                        Python: sources, patchset, assemble, check_forbidden,
                              update_manifest, upstream_watch
tests/                        pytest for tools/
patches/librewolf-keep.txt    LibreWolf patches we apply
patches/librewolf-drop.txt    LibreWolf patches we refuse, with a reason
patches/kyber/                our patches and series.txt
overlay/                      files copied into the Firefox tree at the same paths
overlay/browser/branding/kyberfox/
overlay/browser/components/kyberfox/
themes/                       palettes, shared stylesheet, vendored skins
settings/                     kyberfox.cfg, policies.json
mozconfigs/                   linux, windows-cross
packaging/arch/               PKGBUILD and repo scripts
.github/workflows/            build, front-end tests, release, upstream watch
```

---

## Phase A: Prove the Build

### Task 1: Source assembly tool

**Files:**
- Create: `pins.toml`, `Makefile`, `tools/sources.py`, `tools/patchset.py`, `tools/assemble.py`, `patches/librewolf-keep.txt`, `patches/librewolf-drop.txt`, `patches/kyber/series.txt`, `.gitignore`
- Test: `tests/test_patchset.py`, `tests/test_assemble.py`

**Interfaces:**
- Produces: `load_pins(path: Path) -> Pins` with fields `firefox_version`, `firefox_sha256`, `librewolf_ref`, `ublock_version`, `ublock_sha256`, `gx_commit`, `one_commit`.
- Produces: `classify(upstream: list[str], keep: set[str], drop: set[str]) -> list[str]`, raising `UnclassifiedPatch` naming each new upstream patch.
- Produces: `rebrand(text: str) -> str`.
- Produces: `assemble(pins: Pins, workdir: Path, allow_failed: bool = False) -> AssemblyResult` with fields `tree: Path` and `failed: list[str]`.
- Produces: Make targets `assemble`, `build`, `package`, `test-tools`.

- [ ] **Step 1: Write the failing tests**

```python
def test_new_upstream_patch_must_be_classified():
    with pytest.raises(UnclassifiedPatch, match="patches/new.patch"):
        classify(["patches/a.patch", "patches/new.patch"], {"patches/a.patch"}, set())

def test_drop_list_removes_patch():
    assert classify(["a", "b"], {"a"}, {"b"}) == ["a"]

def test_rebrand_replaces_all_forms():
    assert rebrand("LibreWolf librewolf LIBREWOLF") == "Kyber Fox kyberfox KYBERFOX"

def test_rebrand_keeps_upstream_urls():
    assert rebrand("codeberg.org/librewolf/source") == "codeberg.org/librewolf/source"

def test_hash_mismatch_stops_before_extract(tmp_path, fake_tarball):
    with pytest.raises(HashMismatch):
        assemble(pins_with_wrong_hash(), tmp_path)

def test_failed_patch_is_reported_with_newer_firefox(tmp_path, fake_sources):
    result = assemble(pins_newer_firefox(), tmp_path, allow_failed=True)
    assert result.failed == ["patches/stale.patch"]
    assert (result.tree / "kept.txt").read_text() == "patched\n"
```

- [ ] **Step 2: Run them.** `pytest tests -v`. Expected: FAIL on import.

- [ ] **Step 3: Implement `tools/`.** `assemble` downloads `https://archive.mozilla.org/pub/firefox/releases/<version>/source/firefox-<version>.source.tar.xz`, verifies SHA-256, fetches LibreWolf `source` and `settings` at the pinned ref into `workdir`, classifies `assets/patches.txt`, rebrands patch text, applies with `patch -p1 --no-backup-if-mismatch`, then applies `patches/kyber/series.txt` and copies `overlay/`. `allow_failed=False` raises on the first failure, and `allow_failed=True` collects failures.

- [ ] **Step 4: Fill in the patch lists.** Keep everything in `assets/patches.txt` except these, which go in `librewolf-drop.txt` with reasons: `add-mojeek`, `mullvad-dns-migration`, `msix`, `temp-macos-fix`, `ui-patches/lw-logo-devtools`. Keep `ui-patches/remove-branding`, because it helps remove Firefox naming.

- [ ] **Step 5: Run the tests.** `pytest tests -v`. Expected: PASS.

- [ ] **Step 6: Assemble for real.** `make assemble`. Expected: exit 0 and a patched tree. Move any failing patch to the drop list with a reason, or fix it.

- [ ] **Step 7: Commit.** `git commit -m "Add source assembly tool"`

### Task 2: Build gate on free runners

This task decides whether the spec's free build path holds. Zen's release builds use paid 16-core Blacksmith runners with PGO, so free 4-vCPU runners with 16 GB of RAM and 14 GB of disk are unproven.

**Files:**
- Create: `mozconfigs/linux`, `.github/workflows/build-linux.yml`, `docs/build-gate.md`

**Interfaces:**
- Consumes: `make assemble`, `make build`, `make package`.
- Produces: reusable workflow `build-linux.yml` that uploads artifact `kyberfox-linux-x86_64`.

- [ ] **Step 1: Write `mozconfigs/linux`.** Start from LibreWolf's `assets/mozconfig`. Set `--disable-lto`, leave PGO off, and set `--disable-crashreporter`, `--enable-update-channel=release` and `--disable-updater`.

- [ ] **Step 2: Write the workflow.** Use `ubuntu-latest`, `jlumbroso/free-disk-space` pinned to a commit SHA, and `mozilla-actions/sccache-action` pinned to a commit SHA. Set `timeout-minutes: 350`.

- [ ] **Step 3: Push the workflow.** The repo is `Commanderx-code/KyberFox` on `main`, through a pull request.

- [ ] **Step 4: Run the build twice.** `gh workflow run build-linux.yml`, once cold and once with cache.

- [ ] **Step 5: Record results in `docs/build-gate.md`.** Note wall time, peak disk and any out-of-memory failure.

- [ ] **Step 6: Apply the gate.** Pass means the cold build finishes inside 350 minutes. On failure, stop and bring the owner the measurements and a costed option. Do not add a paid runner without approval.

- [ ] **Step 7: Prove a low-power dev loop.** Clone `mozilla-firefox/firefox` at the `159.0` release tag, apply the assembly, set `ac_add_options --enable-artifact-builds`, and run `./mach build`. Expected: a runnable browser in under 30 minutes on the owner's laptop. Record the steps in `docs/build-gate.md`. If it fails, front-end tests run on hosted runners only.

- [ ] **Step 8: Commit.** `git commit -m "Add Linux build workflow and gate results"`

---

## Phase B: A Private, Rebranded Browser

### Task 3: Identity, settings and removals

**Files:**
- Create: `overlay/browser/branding/kyberfox/` (placeholder logo and `configure.sh`), `settings/kyberfox.cfg`, `settings/policies.json`, `tools/check_forbidden.py`, `rules/forbidden.toml`, `overlay/browser/components/kyberfox/moz.build`, `overlay/browser/components/kyberfox/jar.mn`, `patches/kyber/0001-register-component.patch`, `.github/workflows/front-end-tests.yml`
- Modify: `mozconfigs/linux`
- Test: `tests/test_check_forbidden.py`, `overlay/browser/components/kyberfox/test/xpcshell/test_defaults.js`

**Interfaces:**
- Consumes: `assemble()`.
- Produces: `scan(tree: Path, rules: list[Rule]) -> list[Finding]`, and a CLI that exits 1 on any finding. Make target `check-forbidden`.
- Produces: an empty registered component at `browser/components/kyberfox/` with xpcshell and browser test manifests, and workflow `front-end-tests.yml`, which later tasks extend.

- [ ] **Step 1: Write the failing tests**

```python
def test_flags_forbidden_pref_set_true(tmp_path):
    write(tmp_path / "firefox.js", 'pref("toolkit.telemetry.enabled", true);')
    assert [f.rule for f in scan(tmp_path, RULES)] == ["telemetry-enabled"]

def test_flags_ai_chat_provider(tmp_path):
    write(tmp_path / "x.js", 'pref("browser.ml.chat.enabled", true);')
    assert [f.rule for f in scan(tmp_path, RULES)] == ["ai-chat"]

def test_translations_not_flagged(tmp_path):
    write(tmp_path / "x.js", 'pref("browser.translations.enable", true);')
    assert scan(tmp_path, RULES) == []
```

`test_defaults.js` asserts these prefs and policies on a built browser:

| Key | Value |
|---|---|
| `Services.search.getDefault()` name | `DuckDuckGo` |
| `network.cookie.cookieBehavior` | `1`, which blocks all third-party cookies |
| `privacy.resistFingerprinting` | `false` |
| `privacy.fingerprintingProtection` | `true` |
| `browser.safebrowsing.downloads.remote.enabled` | `false` |
| `browser.safebrowsing.malware.enabled` | `true` |
| `dom.push.enabled` | `false` |
| `identity.fxaccounts.enabled` | `false` |
| `media.eme.enabled` | `false` |
| `extensions.blocklist.enabled` | `true` |
| `security.remote_settings.crlite_filters.enabled` | `true` |

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement the scanner and rule file.** Rules cover telemetry, studies, sponsored content, ad attribution (`dom.private-attribution.submission.enabled`), crash reporting, and the AI items below.

- [ ] **Step 4: Write `settings/`.** Start from LibreWolf `librewolf.cfg` and `distribution/policies.json`. Keep `AIControls` with `Translations: available`, and `PDFAltText`, `SmartTabGroups`, `LinkPreviewKeyPoints`, `SidebarChatbot` and `SmartWindow` as `blocked`. Remove `AppUpdateURL` and `DisableAppUpdate`. Remove the `uBlock0@raymondhill.net` `ExtensionSettings` entry, which Task 4 replaces. Re-enable Safe Browsing with local lists, and set `browser.safebrowsing.downloads.remote.enabled=false`. Read `patches/rs-blocker.patch`, and make sure it leaves blocklist and certificate revocation updates working.

- [ ] **Step 5: Wire branding.** Set `--with-branding=browser/branding/kyberfox`, the app id, `--with-app-name=kyberfox` and the vendor. Pass the Google key through `--with-google-safebrowsing-api-keyfile`. Confirm the profile path is `~/.config/kyberfox` on Linux, with the cache under `~/.cache/kyberfox`, and `%APPDATA%\Kyber Fox` on Windows.

- [ ] **Step 6: Run tests and the release guard.** `pytest tests -v`, then `make check-forbidden`, then `./mach xpcshell-test browser/components/kyberfox/test/xpcshell/`. Expected: PASS and exit 0.

- [ ] **Step 7: Audit first-run traffic.** Launch a clean profile for 5 minutes behind `mitmdump` and list every host contacted. Allowed: Mozilla security lists, addons.mozilla.org, Safe Browsing and uBlock Origin's filter hosts. Save the list to `docs/network-audit.md`, and fix anything else.

- [ ] **Step 8: Commit.** `git commit -m "Add branding, private defaults and forbidden-code check"`

### Task 4: Bundle uBlock Origin

**Files:**
- Modify: `tools/assemble.py`, `pins.toml`, `patches/kyber/series.txt`
- Test: `tests/test_assemble.py`, `overlay/browser/components/kyberfox/test/browser/browser_ublock_bundled.js`

**Interfaces:**
- Produces: signed XPI at `distribution/extensions/uBlock0@raymondhill.net.xpi` in every package.

- [ ] **Step 1: Write the failing tests.** `test_ublock_hash_mismatch_fails` expects `HashMismatch`. `browser_ublock_bundled.js` asserts `AddonManager.getAddonByID("uBlock0@raymondhill.net")` returns an active add-on, with no network, on a clean profile.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Download `uBlock0_<version>.firefox.signed.xpi` from the `gorhill/uBlock` GitHub release, verify `ublock_sha256`, and stage it into the package. Add its GPL-3.0 notice and source link to `about:license` with a Kyber patch.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Bundle uBlock Origin"`

### Task 5: Windows build and installer

**Files:**
- Create: `mozconfigs/windows-cross`, `.github/workflows/build-windows.yml`
- Test: `.github/workflows/smoke-windows.yml`

**Interfaces:**
- Consumes: `make assemble`, `check-forbidden`.
- Produces: artifact `kyberfox-windows-x86_64` containing `kyberfox-<version>.installer.exe`.

- [ ] **Step 1: Write the smoke workflow.** On `windows-latest`, run the installer with `/S`, confirm the install directory, run `kyberfox.exe --version` and expect `Kyber Fox 159.0`, then run a `--headless --screenshot` launch.

- [ ] **Step 2: Write the cross-build.** Follow the win-cross steps in Zen's `windows-release-build.yml`, which fetch Wine and Visual Studio packages through `get_vs.py`. Set `--disable-lto`, `--enable-updater`, `--enable-verify-mar` and `--disable-maintenance-service`. Zen is MPL-2.0, so keep notices on anything copied.

- [ ] **Step 3: Set the install location.** Default to a per-user folder, so updates run without UAC prompts.

- [ ] **Step 4: Run both workflows.** Expected: both succeed inside 350 minutes. Apply the Task 2 gate if not.

- [ ] **Step 5: Commit.** `git commit -m "Add Windows cross-build and installer smoke test"`

---

## Phase C: The Interface

All tests in this phase run with `./mach mochitest browser/components/kyberfox/test/browser/`, through the Task 2 dev tree or the `front-end-tests.yml` workflow created in Task 3.

### Task 6: Workspace engine

**Files:**
- Create: `overlay/browser/components/kyberfox/KyberWorkspaces.sys.mjs`, `patches/kyber/0002-browser-init.patch`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_workspaces.js`

**Interfaces:**
- Produces, in `resource:///modules/KyberWorkspaces.sys.mjs`, object `KyberWorkspaces`:
  - `list(): {id: string, name: string}[]`
  - `create(name: string): {id, name}`
  - `rename(id: string, name: string): void`
  - `remove(id: string, win: Window): void`
  - `activeId(win: Window): string`
  - `switchTo(win: Window, id: string): void`
  - `assign(tab: Tab, id: string): void`
  - `init(win: Window): void`
- Pref `kyberfox.workspaces.list` holds the JSON list, shared by all windows. A tab's id is stored with `SessionStore.setCustomTabValue`, and a window's active id with `SessionStore.setCustomWindowValue`.

Decided behavior:
- Two windows may show the same workspace, and each keeps its own tabs.
- Pinned tabs stay visible in every workspace, because `gBrowser.hideTab` refuses pinned tabs.
- Deleting a workspace moves its tabs to the first remaining one. The last workspace can't be deleted.
- Switching to an empty workspace opens a new tab.
- Workspaces share cookies and logins. Leave `{id, name}` extensible for an optional later `containerId`.

- [ ] **Step 1: Write the failing tests:** `test_switch_hides_other_tabs`, `test_new_tab_joins_active_workspace`, `test_link_opened_tab_joins_active_workspace`, `test_switch_to_empty_opens_tab`, `test_pinned_visible_in_all`, `test_tab_group_hides_with_workspace`, `test_remove_moves_tabs_to_first`, `test_cannot_remove_last`, `test_restore_preserves_assignment`, and for Review Focus 2, `test_restore_with_unknown_id_lands_in_first_visible`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Select a tab in the target workspace before hiding the rest, because `hideTab` skips the selected tab. Listen for `TabOpen` and `SSTabRestoring`.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add workspace engine"`

### Task 7: Workspace dropdown and layout A

**Files:**
- Create: `overlay/browser/components/kyberfox/content/workspaces-ui.mjs`, `overlay/browser/components/kyberfox/content/workspaces.css`, `patches/kyber/0003-workspace-button.patch`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_workspaces_ui.js`

**Interfaces:**
- Consumes: `KyberWorkspaces`.
- Produces: toolbar item `kyber-workspace-button` as the first item in `TabsToolbar`, showing a color dot and name.

- [ ] **Step 1: Write the failing tests:** `test_button_first_in_tab_bar`, `test_panel_lists_workspaces`, `test_create_rename_delete_from_panel`, `test_hidden_in_private_window`, and `test_tabs_on_top_toolbar_below`, which asserts `sidebar.verticalTabs` stays `false` and the nav bar sits beneath `TabsToolbar`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Match mockup layout A: `Personal ▾` dropdown, then tab group label, tabs and new-tab button. Delete prompts only if the workspace has tabs.

- [ ] **Step 4: Add upstream regression tests.** `test_split_view_opens_from_tab_menu` and `test_tab_group_create`. Firefox has shipped split view by default since 149, and it stays unmodified. Add a CSS rule that outlines the focused pane if upstream doesn't already.

- [ ] **Step 5: Run them.** Expected: PASS.

- [ ] **Step 6: Commit.** `git commit -m "Add workspace dropdown"`

### Task 8: Shield engine

**Files:**
- Create: `overlay/browser/components/kyberfox/KyberShield.sys.mjs`, `docs/shield-ublock-control.md`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_shield.js`

**Interfaces:**
- Produces object `KyberShield`:
  - `state(browser): {supported: boolean, enabled: boolean, ads: boolean, fingerprinting: boolean, cookies: boolean}`
  - `setEnabled(browser, value: boolean): void`
  - `setControl(browser, control: "ads"|"fingerprinting"|"cookies", value: boolean): void`
  - `blockedCount(browser): string`
- Settings are stored per base domain in `Services.perms` as `kyber-shield`, `kyber-shield-ads`, `kyber-shield-fp` and `kyber-shield-cookies`.

uBlock Origin exposes no external messaging, so controlling it is a spike:

- [ ] **Step 1: Spike uBlock control.** Primary approach, with no change to uBlock: add the site to `extensions.quarantinedDomains.list` and confirm uBlock stops blocking there while other tests pass. Test with a page that loads a known blocked resource. Record the result in `docs/shield-ublock-control.md`, including any effect on other extensions. If quarantine doesn't work or also disables other extensions, the fallback is a patched uBlock built from source with a `runtime.onMessageExternal` handler. That loses its AMO signature and needs a built-in add-on path, so stop and report before taking it.

- [ ] **Step 2: Write the failing tests:** `test_defaults_all_protected`, `test_master_off_disables_all_three`, `test_control_persists_per_site`, `test_subdomains_share_setting`, `test_about_page_unsupported`, `test_blocked_count_reads_badge`, and for Review Focus 4, `test_private_window_setting_not_persisted`.

- [ ] **Step 3: Run them.** Expected: FAIL.

- [ ] **Step 4: Implement.** Mapping:
  - **ads:** the Step 1 result, plus `ContentBlockingAllowList` for Firefox's tracker blocking.
  - **fingerprinting:** per-domain entries in `privacy.fingerprintingProtection.granularOverrides`.
  - **cookies:** a `cookie` permission through `Services.perms`.
  - **count:** read uBlock's per-tab badge through `browserActionFor(extension).getContextData(tab).badgeText`.

- [ ] **Step 5: Run them.** Expected: PASS.

- [ ] **Step 6: Commit.** `git commit -m "Add per-site shield engine"`

### Task 9: Shield button and panel

**Files:**
- Create: `overlay/browser/components/kyberfox/content/shield-ui.mjs`, `overlay/browser/components/kyberfox/content/shield.css`, `patches/kyber/0004-shield-button.patch`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_shield_ui.js`

**Interfaces:**
- Consumes: `KyberShield`.
- Produces: toolbar button `kyber-shield-button` in `nav-bar`, right of the address bar.

- [ ] **Step 1: Write the failing tests:** `test_badge_updates_on_navigation`, `test_panel_has_master_and_three_controls`, `test_toggle_reloads_page`, `test_disabled_state_on_about_pages`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** A panel with the master switch first, then ads and trackers, fingerprinting and cookies. A change reloads the tab.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add shield button and panel"`

### Task 10: Privacy settings page

**Files:**
- Create: `overlay/browser/components/kyberfox/KyberPrivacyPresets.sys.mjs`, `patches/kyber/0005-privacy-pane.patch`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_privacy_presets.js`

**Interfaces:**
- Produces: `KyberPrivacyPresets.apply(name: "standard"|"strict"): void`, `KyberPrivacyPresets.current(): "standard"|"strict"|"custom"`.

- [ ] **Step 1: Write the failing tests:** `test_standard_matches_defaults`, `test_strict_sets_resist_fingerprinting`, `test_manual_change_reports_custom`, and `test_strict_warns_about_timezone`, which checks the pane text says sites may break and the timezone reads as UTC.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Extend LibreWolf's `ui-patches/privacy-preferences.patch` pane. Show Standard and Strict presets first, then every option, with DRM enabling and a note that DRM is closed-source Widevine.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add privacy presets and settings"`

### Task 11: Theme engine and color themes

**Files:**
- Create: `overlay/browser/components/kyberfox/KyberThemes.sys.mjs`, `themes/base.css`, `themes/palettes.json`, `themes/status.json`
- Modify: `tools/assemble.py` to copy `themes/` into the component
- Test: `overlay/browser/components/kyberfox/test/browser/browser_themes.js`, `tests/test_palettes.py`

**Interfaces:**
- Produces object `KyberThemes`:
  - `available(): {id: string, name: string, kind: "color"|"skin"|"custom", disabled: boolean}[]`
  - `current(): string`
  - `apply(id: string): void`
  - `init(): void`
- Pref `kyberfox.theme.id`, default `ember`. `themes/status.json` lists disabled ids.
- Stylesheets load through `nsIStyleSheetService.loadAndRegisterSheet`, so no `userChrome.css` or `about:config` step is needed.

- [ ] **Step 1: Write the failing tests:** Python `test_every_palette_defines_all_variables` and `test_color_themes_are_the_seven` for `ember`, `paper`, `frost`, `terminal`, `catppuccin`, `tokyo-night` and `starry`. Mochitests `test_apply_changes_toolbar_color`, `test_apply_persists_after_new_window`, `test_paper_uses_serif`, `test_terminal_has_square_corners`, `test_unknown_id_falls_back_to_ember`, and for the "never hold a release" rule, `test_status_disabled_skin_falls_back_to_ember`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Use the values from the mockup for the first four. Catppuccin uses the Mocha palette (MIT). Confirm Tokyo Night's palette license before adding it, and record it in `themes/NOTICES.md`. Starry takes its look from starry-fox (MPL-2.0) and must not need `fx-autoconfig`.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add theme engine and color themes"`

### Task 12: Theme picker and CSS import

**Files:**
- Create: `patches/kyber/0006-theme-pane.patch`, `overlay/browser/components/kyberfox/content/theme-pane.mjs`
- Modify: `KyberThemes.sys.mjs`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_theme_picker.js`

**Interfaces:**
- Consumes: `KyberThemes`.
- Produces: `KyberThemes.importCustomCss(file: nsIFile): Promise<void>`, copying to `<profile>/chrome/kyberfox-custom.css`, plus `KyberThemes.resetToDefault(): void`.

- [ ] **Step 1: Write the failing tests:** `test_picker_shows_all_with_previews`, `test_click_applies_immediately`, `test_import_valid_css`, `test_import_over_1mb_rejected`, `test_import_rejects_non_css`, `test_import_unreadable_file_keeps_current`, `test_reset_button_available`. For Review Focus 3: `test_safe_mode_skips_theme`, and `test_shortcut_resets_theme`, which binds Ctrl+Shift+Alt+T to `resetToDefault` so a user can recover from CSS that hides the toolbar.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** A card grid in Settings, previews drawn from palette values, and an Import button with a file picker. Add a warning that imported CSS can load remote images. In `init()`, return early when `Services.appinfo.inSafeMode` is true.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add theme picker and custom CSS import"`

### Task 13: GX-style and One-style skins

**Files:**
- Create: `themes/skins/gx/`, `themes/skins/one/`, `tools/vendor_skins.py`, `themes/NOTICES.md`
- Test: `tests/test_vendor_skins.py`, `overlay/browser/components/kyberfox/test/browser/browser_skins.js`

**Interfaces:**
- Consumes: `KyberThemes.apply`, `pins.toml` `gx_commit`, `one_commit`.
- Produces: `vendor(repo: str, commit: str, dest: Path) -> None`. Theme ids `gx` and `one`, kind `skin`.

- [ ] **Step 1: Write the failing tests:** `test_vendor_keeps_license`, `test_vendor_strips_opera_branding`, `test_skin_prefs_restored_on_switch`, `test_skin_applies_on_shipped_firefox`, which asserts tabs, address bar and menu remain visible and have nonzero size.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Pin commits.** Choose the newest commit of `Godiesc/firefox-gx` and `Godiesc/firefox-one` that passes on Firefox `159.0`. Their READMEs warn the latest code may suit only beta or nightly.

- [ ] **Step 4: Implement.** Copy CSS and assets, keep MPL notices, and remove Opera names and logos. Each `user.js` becomes a pref list set on apply and restored on switch. Each project's matching color theme add-on must be replaced by CSS variables. Skip `Extras/`.

- [ ] **Step 5: Run them.** Expected: PASS.

- [ ] **Step 6: Commit.** `git commit -m "Add GX-style and One-style skins"`

### Task 20: Recommended add-ons page

Added 2026-11-03 at the owner's request: on first run, friends pick which recommended add-ons to install. Runs after Task 13, before Phase D.

**Files:**
- Create: `overlay/browser/components/kyberfox/KyberAddons.sys.mjs`, `overlay/browser/components/kyberfox/content/welcome.xhtml`, `overlay/browser/components/kyberfox/content/welcome.mjs`, `overlay/browser/components/kyberfox/content/welcome.css`, `settings/recommended-addons.json`, `patches/kyber/welcome-tab.patch`
- Test: `overlay/browser/components/kyberfox/test/browser/browser_welcome.js`, `tests/test_recommended_addons.py`

**Interfaces:**
- Consumes: `AddonManager.getInstallForURL`, pref `kyberfox.welcome.shown` (bool, default false).
- Produces: `KyberAddons.recommended(): {id, slug, name, summary, group}[]` read from `settings/recommended-addons.json`; `KyberAddons.install(ids: string[]): Promise<{id, ok: boolean, error?: string}[]>`; `KyberAddons.installed(id): Promise<boolean>`. Page `chrome://kyberfox/content/welcome.xhtml`, opened once per profile on first run after `SessionStore.promiseInitialized`, and reachable later from the Privacy page (Task 10) through a "Recommended add-ons" link.

Decided behavior:
- Nothing is pre-ticked. The page lists each add-on with a checkbox, its name, one line of plain summary, and its group. Groups: Passwords (Bitwarden `bitwarden-password-manager`, Proton Pass `proton-pass`, KeePassXC-Browser `keepassxc-browser`), Privacy (Privacy Badger `privacy-badger17`, Decentraleyes `decentraleyes`, Consent-O-Matic `consent-o-matic`, Firefox Multi-Account Containers `multi-account-containers`), Video (SponsorBlock `sponsorblock`, Return YouTube Dislike `return-youtube-dislikes`), Appearance (Dark Reader `darkreader`). uBlock Origin is shown as "included" with no checkbox.
- Install URL is `https://addons.mozilla.org/firefox/downloads/latest/<slug>/latest.xpi` (signed by Mozilla, auto-updated through the normal add-on updater). No XPI is bundled: bundling ten add-ons would bloat the installer and freeze their versions.
- "Install selected" installs in sequence, shows per-add-on progress and errors, and never blocks the browser. "Skip" closes the page. Either sets `kyberfox.welcome.shown`.
- No network request is made until the user clicks Install. The page shows no AMO ratings, icons or counts (those would need requests).
- `settings/recommended-addons.json` is the single source of the list; the Python test checks every entry has `id`, `slug`, `name`, `summary`, `group`, and that `id` matches the add-on id used by AMO (`{...}` GUID or `name@domain`).

- [ ] **Step 1: Write the failing tests:** `test_welcome_opens_once_on_first_run`, `test_welcome_not_opened_when_shown`, `test_nothing_preselected`, `test_ublock_shown_as_included`, `test_install_selected_installs_only_ticked` (stub `AddonManager.getInstallForURL` through a test-only hook on `KyberAddons`), `test_install_error_is_shown_and_others_continue`, `test_skip_sets_pref`, plus `tests/test_recommended_addons.py::test_entries_complete`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** The patch opens the tab from `browser-init.js` after the Task 6 init hook, only when `kyberfox.welcome.shown` is false and the window is not private.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add recommended add-ons page"`

---

## Phase D: Ship It

### Task 14: Arch packaging

**Files:**
- Create: `packaging/arch/PKGBUILD`, `packaging/arch/publish-repo.sh`
- Test: `.github/workflows/smoke-arch.yml`

**Interfaces:**
- Consumes: artifact `kyberfox-linux-x86_64`.
- Produces: pacman repo `kyberfox` on GitHub Pages, with packages signed by a project key.

- [ ] **Step 1: Write the smoke workflow.** In an `archlinux` container, add the repo, run `pacman -Sy --noconfirm kyberfox`, and expect `kyberfox --version` to print `Kyber Fox 159.0`.

- [ ] **Step 2: Write the PKGBUILD.** Package the prebuilt tarball into `/opt/kyberfox`, with a desktop file, icons and a `/usr/bin/kyberfox` link.

- [ ] **Step 3: Run the workflow.** Expected: PASS.

- [ ] **Step 4: Commit.** `git commit -m "Add Arch packaging"`

### Task 15: Signed Windows updates

**Files:**
- Create: `tools/update_manifest.py`, `overlay/toolkit/mozapps/update/updater/release_primary.der`, `overlay/toolkit/mozapps/update/updater/release_secondary.der`, `docs/update-signing.md`
- Modify: `patches/kyber/series.txt`, `.github/workflows/build-windows.yml`
- Test: `tests/test_update_manifest.py`, `.github/workflows/smoke-update.yml`

**Interfaces:**
- Produces: `render_update_xml(version: str, build_id: str, mar_url: str, sha512: str, size: int) -> str`.
- Produces: `app.update.url` set to `https://commanderx-code.github.io/KyberFox/update/%CHANNEL%/%BUILD_TARGET%/update.xml`. MAR files live on GitHub Releases.

- [ ] **Step 1: Write the failing test**

```python
def test_update_xml_has_complete_patch():
    root = ET.fromstring(render_update_xml("159.0.1", "20261110000000", URL, "ab" * 64, 123))
    update = root.find("update")
    assert update.get("appVersion") == "159.0.1"
    assert update.get("buildID") == "20261110000000"
    patch = update.find("patch")
    assert (patch.get("type"), patch.get("hashFunction")) == ("complete", "sha512")
    assert patch.get("URL") == URL and patch.get("size") == "123"
```

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement the manifest.** Keep it static, and publish one file per channel and build target. Read LibreWolf's `updater.patch` and `ui-patches/allow-disabling-updater.patch`, and move either to the drop list if it blocks Windows updates. LibreWolf's own `marsigner` keys must not ship.

- [ ] **Step 4: Owner generates the MAR key.** Follow `docs/update-signing.md`. Commit only the public `.der`.

- [ ] **Step 5: Write `smoke-update.yml`.** On `windows-latest`, install version N, serve a local manifest with `app.update.url.override`, and confirm the update applies. Then, for Review Focus 1, serve a MAR signed with a throwaway key. Expected: update refused, version unchanged, browser still launches.

- [ ] **Step 6: Run both tests.** Expected: PASS.

- [ ] **Step 7: Commit.** `git commit -m "Add signed Windows updates"`

### Task 16: One-click release

**Files:**
- Create: `.github/workflows/release.yml`
- Test: `tests/test_release_inputs.py`

**Interfaces:**
- Consumes: all build, smoke and test workflows, `check-forbidden`, `render_update_xml`.
- Produces: workflow `release.yml` with stages build, verify, `publish`. `publish` runs in the `release` environment.

- [ ] **Step 1: Write the failing test.** `test_publish_job_requires_environment` parses `release.yml` and asserts `publish` has `environment: release`, needs `verify`, and that only `publish` references `MAR_SIGNING_KEY`.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement.** `verify` runs `check-forbidden`, front-end tests and smoke tests. A `publish` job pauses for the owner's approval, signs the MARs, creates the GitHub Release, and updates manifests and the pacman repo. Add `set-disabled-skin` as an input, which writes `themes/status.json` so a broken skin never holds a security release.

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Run a full dry release.** Use version `159.0-test` on a test channel. Expected: the workflow stops at approval, and proceeds to a working update on the test channel once approved.

- [ ] **Step 6: Commit.** `git commit -m "Add approved release workflow"`

### Task 17: Upstream watch

**Files:**
- Create: `tools/upstream_watch.py`, `.github/workflows/upstream-watch.yml`
- Test: `tests/test_upstream_watch.py`

**Interfaces:**
- Consumes: `load_pins`, `assemble(allow_failed=True)`.
- Produces: `latest_firefox(details: dict) -> str`, `needs_update(pins: Pins, latest: str) -> bool`, `is_security_release(old: str, new: str) -> bool`, `bump_pins(path: Path, version: str, sha256: str) -> None`.

- [ ] **Step 1: Write the failing tests:** `test_reads_latest_version` from a saved `firefox_versions.json` with key `LATEST_FIREFOX_VERSION`, `test_no_update_when_equal`, `test_point_release_flagged`, `test_bump_rewrites_version_and_hash_only`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Poll `https://product-details.mozilla.org/1.0/firefox_versions.json` every 3 hours. On a new version, bump pins, run assembly with `allow_failed=True`, and open a PR with the failed patch list and the 72-hour deadline. Also check for a newer LibreWolf ref and report new patches through `UnclassifiedPatch`.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Add upstream Firefox watch"`

### Task 18: Streaming check

**Files:**
- Create: `docs/streaming.md`

- [ ] **Step 1: Test real playback.** On Windows and Linux builds, enable DRM from the site prompt, and try Netflix, YouTube and one more Widevine service.

- [ ] **Step 2: Record results.** Note resolution and any failure in `docs/streaming.md`. Limits get documented and do not block release.

- [ ] **Step 3: Commit.** `git commit -m "Document streaming results"`

### Task 19: Friends release

**Files:**
- Create: `README.md`, `SECURITY.md`, `docs/install.md`, `LICENSE`
- Modify: `overlay/browser/branding/kyberfox/`

- [ ] **Step 1: Owner chooses the final logo.** Replace the placeholder, and confirm it doesn't resemble Firefox's.

- [ ] **Step 2: Write `docs/install.md`.** Cover the SmartScreen click-through on Windows and pacman repo setup on Garuda. State that sync is not in this release.

- [ ] **Step 3: Audit notices.** Confirm `about:license` and `themes/NOTICES.md` cover Firefox, LibreWolf, uBlock Origin, firefox-gx, firefox-one, starry-fox, Catppuccin and Tokyo Night. Confirm the Firefox name doesn't appear in the UI except for required attribution.

- [ ] **Step 4: Run the release.** Run `release.yml` for the current Firefox version. Expected: approval prompt, then published Windows and Arch builds.

- [ ] **Step 5: Verify on real machines.** Install on Windows and Garuda, then confirm workspaces, split view, shield, a theme change, and an update to a following point release.

- [ ] **Step 6: Commit.** `git commit -m "Prepare friends release"`
