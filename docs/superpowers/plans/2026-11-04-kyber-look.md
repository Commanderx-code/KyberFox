# Kyber Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kyber Fox look like the owner's mockups: three dark Kyber themes (Kyber Crystal, Crimson, Azure) with a glowing window skin, a Kyber new tab page and a Kyber private window page.

**Architecture:** The three themes are skins in the existing theme engine (`KyberThemes.sys.mjs`). Each one is a small `skin.json` plus `colors.css`, and all three load one shared set of sheets from `themes/kyber/`: `chrome.css` for the window and `pages.css` for the new tab, private and welcome pages. Sheets are user sheets, which reach content pages too. Images (recolored foxes, waves, wordmark) and fonts ship inside the browser. The private page gets a small patch for its new, localized lines.

**Tech Stack:** Firefox 159 chrome CSS, `nsIStyleSheetService` user sheets, Fluent, mochitest browser tests, pytest, ImageMagick 7 (`tools/make-logos.sh`), fontTools (only to outline the wordmark, run once through `nix shell`).

**Spec:** `docs/superpowers/specs/2026-11-04-kyber-look-design.md`

## Global Constraints

- Theme names: **Kyber Crystal**, **Crimson**, **Azure**. Ids: `kyber-crystal`, `kyber-crimson`, `kyber-azure`. No Star Wars terms and no Lucasfilm emblems anywhere: not in names, art, strings or file names.
- Nothing loads from the network. No `http:`, `https:` or `//` URLs in any new sheet or SVG. `kyberfox.externalWallpapers.enabled` stays false.
- Heavy patches to Firefox code are out. CSS, images, strings and small patches only. A broken skin falls back to Ember, never to a broken window.
- Colors, from the spec: Kyber Crystal `#00E5FF` `#B400FF` `#0A0F2D` `#FFFFFF`. Crimson `#010101` `#560110` `#CF0122` `#FA0226` `#F994AE` `#FDFEFD`. Azure `#00133D` `#0045CC` `#31A2F2` `#88F7FD` `#CCD1D8` `#FEFEFE`.
- Text meets WCAG AA (4.5:1 for body text). No glow behind text.
- The app icon, the tab icon and the taskbar icon stay the real logo in every theme.
- Firefox's privacy explanation on the private page stays reachable.
- A user's own new tab wallpaper wins over the Kyber waves.
- The Kyber pages get the Kyber look only while a Kyber theme is active.
- Ember is the fallback, and the target of Reset and the reset shortcut. Kyber Crystal is the default.
- Fonts: Sora and Inter, OFL 1.1, woff2, only the weights used. They are pinned (version and SHA-256), the license ships with them, a line goes in `themes/NOTICES.md`, and they live outside `themes/skins/` (a test forbids fonts there).
- Wordmark: the bold, wide lettering of `06-brand-identity.png`, drawn as outlined paths. "KYBER" white, "FOX" with the theme's gradient.
- Private page logo: the badge logo from `branding/private-browsing/`.
- Strings in US English, through Fluent, in `overlay/browser/locales/en-US/browser/kyberfox.ftl`.
- MPL header on every new source file. No AI tool names in docs, comments or commits.
- No full builds on the laptop. Use the artifact build in `work/dev` (`work/apply_dev.py`, `./mach build faster`, then mochitest with the cfg loaded).
- The owner approves screenshots of every page in all three themes before the pull request is merged.

## Review Focus

1. **Theme switch with a new tab already open.** The open page drops or gains the Kyber look without a reload, because the sheets are user sheets. Pinned in Task 5.
2. **The user's own new tab wallpaper.** If a custom or built-in wallpaper is set, `body` has `lightWallpaper` or `darkWallpaper`, and the Kyber waves must not cover it. Pinned in Task 5.
3. **The Kyber skin disabled in `themes/status.json`, or failing to load.** The browser applies Ember, and the new tab and private page look as they did before. Pinned in Task 1.
4. **Existing profiles.** `ember` saved moves to `kyber-crystal` once; `frost` saved stays `frost`; Ember picked again after the move stays Ember after a restart. Pinned in Task 1.
5. **A private window under a non-Kyber theme.** The new private-page lines are hidden, and the page looks as it does today. Pinned in Task 6.

---

### Task 1: Theme engine support for the Kyber themes

**Files:**
- Modify: `overlay/browser/components/kyberfox/KyberThemes.sys.mjs`
- Create: `themes/skins/kyber-crystal/{skin.json,colors.css,LICENSE}`, and the same for `kyber-crimson` and `kyber-azure`
- Create: `themes/kyber/chrome.css`, `themes/kyber/pages.css`. Both start as a scoped header with no rules; Tasks 4 to 6 fill them.
- Modify: `themes/skins/index.json`, `overlay/browser/components/kyberfox/jar.mn`
- Modify: `tests/test_vendor_skins.py`. `test_committed_skins_have_no_opera_and_a_license` lists all five ids; the other vendored-skin tests keep looping over `("gx", "one")` only.
- Create: `tests/test_kyber_skins.py`, `overlay/browser/components/kyberfox/test/browser/browser_kyber_look.js`. Add the browser test to `browser.toml`.

**Interfaces:**
- Produces:
  - **`skin.json` field `"shared"`:** an optional array of paths relative to `themes/`, loaded after the skin's own `sheets`, in order. The Kyber skins use `"shared": ["base.css", "kyber/chrome.css", "kyber/pages.css"]` and `"sheets": ["colors.css"]`.
  - **`colors.css`:** sets the `--kf-*` variables that base.css maps, plus the Kyber variables. It is scoped to `url-prefix("chrome://")`, `url("about:newtab")`, `url("about:home")`, `url("about:privatebrowsing")` and `url-prefix("chrome://kyberfox/content/welcome")`.
  - **Kyber variables:** `--kyber-glow-a` and `--kyber-glow-b` (the glow gradient ends), `--kyber-bg-deep`, `--kyber-fox` (URL of the page fox), `--kyber-fox-private`, `--kyber-waves` (URL), `--kyber-wordmark-a` and `--kyber-wordmark-b`, and `--kyber-glow-strength` (default `1`).
  - **`KyberThemes.isKyber(id) -> boolean`:** true for the three ids. The Kyber sheets are registered only while a Kyber theme is active, so leaving one unregisters them; no marker attribute is needed.
  - **Constants:** `DEFAULT_ID = "kyber-crystal"` and `FALLBACK_ID = "ember"`. `apply()` falls back to `FALLBACK_ID` for an unknown or disabled id and when a skin fails. `resetToDefault()` and the reset shortcut apply `FALLBACK_ID`; their name and tests stay as they are.
  - **Migration:** the pref `kyberfox.theme.movedToKyber` (bool). `init()` runs it once: if the pref is false, a stored id of `ember` (or no stored id) applies `kyber-crystal`; then it sets the pref true. Every other stored id is kept.
  - **Reduce glow:** the pref `kyberfox.theme.reduceGlow` (bool, default false), plus `KyberThemes.reduceGlow() -> boolean` and `KyberThemes.setReduceGlow(on: boolean) -> void`. When on, the engine registers a data: user sheet that sets `--kyber-glow-strength: 0.25` in the same scopes as `colors.css`, and unregisters it when off. It also follows changes to the pref made elsewhere.

- [ ] **Step 1: Write the failing Python tests in `tests/test_kyber_skins.py`**

```python
def test_kyber_skins_are_listed():
    assert json.loads((SKINS / "index.json").read_text())["skins"] == ["gx", "one", "kyber-crystal", "kyber-crimson", "kyber-azure"]

def test_kyber_skin_manifests():
    for i, name in (("kyber-crystal", "Kyber Crystal"), ("kyber-crimson", "Crimson"), ("kyber-azure", "Azure")):
        m = json.loads((SKINS / i / "skin.json").read_text())
        assert (m["id"], m["name"], m["kind"], m["scheme"]) == (i, name, "skin", "dark")
        assert m["sheets"] == ["colors.css"] and m["shared"] == ["base.css", "kyber/chrome.css", "kyber/pages.css"]
        assert set(m["vars"]) == set(VARS)  # the eleven --kf-* names test_palettes.py uses

def test_kyber_files_have_no_remote_urls_or_star_wars_terms():
    for p in [*THEMES.joinpath("kyber").rglob("*"), *[q for i in KYBER for q in (SKINS / i).rglob("*")]]:
        if p.suffix in (".css", ".svg", ".json"):
            text = p.read_text()
            assert not re.search(r"url\(\s*['\"]?(https?:|//)", text), p
            assert not re.search(r"\b(jedi|sith|dark side|lightsaber)\b", text, re.I), p

def test_jar_packages_kyber_files():
    jar = JAR.read_text()
    for line in ("themes/skins/kyber-crystal/", "themes/skins/kyber-crimson/", "themes/skins/kyber-azure/", "themes/kyber/"):
        assert line in jar
```

- [ ] **Step 2: Run them. Expected: FAIL (files missing).** `.venv/bin/python -m pytest tests/test_kyber_skins.py -q`

- [ ] **Step 3: Write the failing browser tests in `browser_kyber_look.js`**

  The test names and what each asserts:
  - `test_three_kyber_themes_listed`: `KyberThemes.available()` contains the three ids with the names above, kind `skin`.
  - `test_default_is_kyber_crystal`: with `kyberfox.theme.id` and `kyberfox.theme.movedToKyber` cleared and the engine reset with `KyberThemes._resetForTests()`, `init()` makes `current()` `kyber-crystal`.
  - `test_ember_moves_once`: `ember` stored and the pref false gives `kyber-crystal` after `init()`. `apply("ember")` then a second `init()` (after reset) keeps `ember`.
  - `test_other_saved_theme_kept`: `frost` stored and the pref false gives `frost`.
  - `test_disabled_kyber_falls_back_to_ember`: `kyberfox.theme.disabled = "kyber-crystal"`, then `apply("kyber-crystal")` gives `current() == "ember"`.
  - `test_failing_kyber_skin_falls_back_to_ember`: `_skinSheetFailsForTests = true`, then `apply("kyber-azure")` gives `"ember"`.
  - `test_reduce_glow`: after `setReduceGlow(true)`, `getComputedStyle(document.documentElement).getPropertyValue("--kyber-glow-strength").trim() == "0.25"`. After `false` the value is `"1"`. Setting the pref directly gives the same result.

- [ ] **Step 4: Implement.** Engine changes as in Interfaces. Skin dirs: `LICENSE` is a copy of the repo `LICENSE`; `skin.json` `vars` are each theme's colors mapped onto the eleven `--kf-*` names, also used for the picker preview; `colors.css` carries the same values plus the Kyber variables (the image URLs may point at files Task 3 creates; until then use `none`). Add the jar.mn lines.

- [ ] **Step 5: Run.**
  - `.venv/bin/python -m pytest tests -q`: all pass.
  - In `work/dev`: copy the overlay and themes over (`work/apply_dev.py`), `./mach build faster`, then mochitest `browser_kyber_look.js`, `browser_skins.js`, `browser_theme_picker.js` and `browser_themes.js` with `kyberfox.cfg` loaded: `MOZCONFIG=$PWD/mozconfig-artifact ./mach mochitest --headless --app obj-artifact/dist/bin/firefox --exclude-extension=uBlock0@raymondhill.net.xpi <test path>` from `work/dev`. All pass.
  - Existing tests that assumed `ember` is the start-up default (not the fallback) are corrected to name `kyber-crystal`, each with a one-line reason in the commit.

- [ ] **Step 6: Commit** `Add the three Kyber themes to the theme engine`

### Task 2: Bundle the Sora and Inter fonts

**Files:**
- Create: `overlay/browser/components/kyberfox/content/fonts/` with `sora-latin-600-normal.woff2`, `sora-latin-700-normal.woff2`, `inter-latin-400-normal.woff2`, `inter-latin-500-normal.woff2`, `inter-latin-600-normal.woff2`, `OFL-Sora.txt`, `OFL-Inter.txt`, `SHA256SUMS`
- Create: `themes/kyber/fonts.css` with the `@font-face` rules (`src: url("chrome://kyberfox/content/fonts/…")`, family names `"Kyber Sora"` and `"Kyber Inter"`, so they never clash with installed fonts)
- Modify: `jar.mn`, `themes/NOTICES.md`, `pins.toml` (a `[fonts]` table with the two `@fontsource` package versions)
- Test: `tests/test_kyber_fonts.py`

- [ ] **Step 1: Failing test.** `test_fonts_match_sums`: every file listed in `SHA256SUMS` exists and its SHA-256 matches; the set of `.woff2` files equals the five names above. `test_licenses_are_ofl`: both OFL files contain `SIL OPEN FONT LICENSE Version 1.1`. `test_notices_list_fonts`: NOTICES.md names Sora, Inter and the versions from `pins.toml`. `test_fonts_css_is_local`: every `url(` in `fonts.css` starts with `chrome://kyberfox/content/fonts/`.
- [ ] **Step 2: Run. Expected: FAIL.**
- [ ] **Step 3: Fetch.**
  - Take the files from the npm packages `@fontsource/sora` and `@fontsource/inter`, at the latest versions older than two weeks, from `cdn.jsdelivr.net/npm/@fontsource/<name>@<version>/files/<file>`, and the license from the package's `LICENSE` file. The download is under 1 MB.
  - Write the versions to `pins.toml` and the hashes to `SHA256SUMS`.
  - Add `fonts.css` to the Kyber skins' `"shared"` list, first, so `"shared"` becomes `["base.css", "kyber/fonts.css", "kyber/chrome.css", "kyber/pages.css"]`. Update Task 1's manifest test to match.
- [ ] **Step 4: Run all pytest. Expected: PASS.**
- [ ] **Step 5: Commit** `Bundle the Sora and Inter fonts for the Kyber pages`

### Task 3: Wordmark, theme foxes and wave backgrounds

**Files:**
- Create: `tools/make_wordmark.py`. Run once with `nix shell nixpkgs#python3Packages.fonttools nixpkgs#python3Packages.brotli`. It reads the Sora 700 woff2 from Task 2, lays out "KYBER FOX" with letter spacing of 0.06 em, and writes outlined paths.
- Create: `branding/wordmark.svg` (the master: "KYBER" `#FFFFFF`, "FOX" with a linear gradient from `#00E5FF` to `#B400FF`) and `themes/kyber/wordmark-mask.svg` (all letters filled white, used as a CSS mask)
- Modify: `tools/make-logos.sh`
  - Copy `branding/wordmark.svg` to `overlay/browser/branding/kyberfox/content/about-wordmark.svg` and `firefox-wordmark.svg`, each with the MPL header.
  - Add `gradient_map SRC RAMP OUT`, which maps the luminance of the source onto the ramp and keeps the alpha. The commands from the trial: `-colorspace gray -sigmoidal-contrast 3,50%` then `-clut`, then the alpha copied back.
  - Add `clean_alpha SRC OUT`, which sets alpha below 8% to 0.
- Create, through `make-logos.sh`, in `themes/kyber/foxes/`: `fox-crystal.png` (the real logo), `fox-crimson.png`, `fox-azure.png`, `private-crystal.png`, `private-crimson.png`, `private-azure.png`. Each is 1024 px, from `branding/logo.png` and `branding/private-browsing/logo.png`, with the private ones run through `clean_alpha` first. Ramps:
  - Crimson: `#120006` → `#7A0012` → `#FF1A3C` → `#FFD6DE`
  - Azure: `#020B2A` → `#0B3FD6` → `#3AA0F5` → `#EEF3FA`
- Create: `themes/kyber/waves-crystal.svg`, `waves-crimson.svg`, `waves-azure.svg`. These are original drawings: 3 to 5 flowing bands per file, using the theme colors, with soft blur (`feGaussianBlur`) on the near-black theme background, 1920×1080 `viewBox`, `preserveAspectRatio="xMidYMid slice"`, and each under 20 KB.
- Modify: the three `colors.css` files, setting `--kyber-fox`, `--kyber-fox-private` and `--kyber-waves` to these files (as `chrome://kyberfox/content/themes/kyber/…` URLs) and `--kyber-wordmark-a/b`: Crystal `#00E5FF` and `#B400FF`, Crimson `#FA0226` and `#F994AE`, Azure `#31A2F2` and `#CCD1D8`.
- Test: extend `tests/test_kyber_skins.py`

- [ ] **Step 1: Failing tests.**
  - `test_wordmarks_are_outlines`: `branding/wordmark.svg`, `wordmark-mask.svg` and both branding copies have a `viewBox`, have at least 8 `<path`, and contain no `<text`, `<image` or `<script`.
  - `test_theme_foxes_exist`: the six PNGs exist, are 1024×1024, and have an alpha channel (read with `magick identify`; skip when ImageMagick is missing, as CI has no need for it).
  - `test_waves_are_small_and_local`: each wave SVG is under 20 KB and passes the no-remote rule.
  - `test_colors_css_points_at_existing_files`: every `chrome://kyberfox/content/themes/` URL in the three `colors.css` resolves to a file under `themes/`.
- [ ] **Step 2: Run. Expected: FAIL.**
- [ ] **Step 3: Implement** as above, and run `tools/make-logos.sh`.
- [ ] **Step 4: Check by eye.** Make a contact sheet of the six foxes on their theme backgrounds and the wordmark on `#0A0F2D`. Compare it with `06-brand-identity.png` and `09-fox-recolor-trial.png` in `kyber-fox-private/notes/mockups/2026-11-04/`. The wordmark should match the brand sheet's weight and width. If it reads thinner, step up to Sora 800 if the package has it, or widen the spacing.
- [ ] **Step 5: Run all pytest. Expected: PASS.**
- [ ] **Step 6: Commit** `Add the wordmark, theme foxes and wave backgrounds`

### Task 4: The window skin (`themes/kyber/chrome.css`)

**Files:**
- Modify: `themes/kyber/chrome.css`, scoped to `url-prefix("chrome://browser/content/browser.xhtml")`
- Test: `browser_kyber_look.js`

What it draws, with values tied to the Kyber variables:
- **Address bar:** a 1.5 px gradient outline from `--kyber-glow-a` to `--kyber-glow-b`, drawn with a two-layer background (padding-box fill plus border-box gradient). An outer glow `box-shadow: 0 0 calc(12px * var(--kyber-glow-strength)) …`, at most 60% alpha. The radius is the pill height.
- **Tabs:** radius 10 px. The selected tab gets the same gradient outline and a weaker glow. Other tabs get no outline.
- **Tab strip logo:** at the start of `#TabsToolbar`, the real logo at 20 px (`chrome://branding/content/icon32.png`), plus the text "Kyber Fox" in the system font at 600 weight, via `::before` on the tab strip's first box. It is hidden in fullscreen and when the tab strip is vertical.
- **PRIVATE pill:** in private windows, restyle `.private-browsing-indicator-with-label`: pill border with the gradient outline, `text-transform: uppercase`, letter spacing 0.08 em, and the mask icon from the branding private icon. It keeps Firefox's own string, so it reads "PRIVATE BROWSING". (Ruling: no new string or patch for the label. This is a deviation from the mockup's "PRIVATE"; it is listed for the owner in the pull request.)
- **No glow under `@media (forced-colors: active)` or `(prefers-contrast: more)`:** outlines become 1 px `CanvasText`.

- [ ] **Step 1: Failing tests.** Under `kyber-crystal`:
  - `test_urlbar_has_glow`: `#urlbar-background` has a computed `box-shadow` not equal to `none`.
  - `test_selected_tab_rounded`: the selected tab's `.tab-background` has `border-radius` `10px`.
  - `test_tabstrip_logo`: the `::before` element has `content` containing `Kyber Fox`.
  - `test_private_pill`: in `BrowserTestUtils.openNewBrowserWindow({ private: true })`, the label has `text-transform` `uppercase`.
  - `test_glow_off_under_ember`: after `apply("ember")`, the urlbar `box-shadow` is the stock value recorded before applying any Kyber theme.
  - `test_reduce_glow_shrinks_shadow`: the blur radius parsed from `box-shadow` is at most 3 px with reduce glow on.
- [ ] **Step 2: Run. Expected: FAIL.**
- [ ] **Step 3: Write `chrome.css`.**
- [ ] **Step 4: Run the browser tests. Expected: PASS.** Then take screenshots of a normal window and a private window in the three themes (virtual KWin, as in `docs/testing.md`).
- [ ] **Step 5: Commit** `Add the Kyber window skin`

### Task 5: The new tab page and the welcome page (`themes/kyber/pages.css`)

**Files:**
- Modify: `themes/kyber/pages.css`, with one block scoped to `url("about:newtab"), url("about:home")` and one scoped to `url-prefix("chrome://kyberfox/content/welcome")`
- Test: `browser_kyber_look.js`

New tab:
- **Background:** `body:not(.lightWallpaper, .darkWallpaper)` gets `var(--kyber-bg-deep)` and `var(--kyber-waves)` (cover, fixed).
- **Logo:** the logo-and-wordmark block becomes centered, the fox (`var(--kyber-fox)`) at 280 px, and the wordmark under it at 420 px wide: `mask-image: url(wordmark-mask.svg)` over `linear-gradient(90deg, #fff 0 57%, var(--kyber-wordmark-a) 57%, var(--kyber-wordmark-b))`, so "KYBER" is white and "FOX" is the gradient. Tune the split to the mask's glyph positions. It overrides the Nova rules that shrink the logo to 64 px and hide the wordmark on narrow widths. It stays centered at every width; below 700 px the fox shrinks to 160 px.
- **Search:** the search field becomes a pill with the gradient outline and a glow scaled by `--kyber-glow-strength`, Kyber Inter for the text, and the placeholder kept.
- **Top sites:** cards with background `rgb(255 255 255 / 0.04)`, a 1 px border `rgb(255 255 255 / 0.08)`, radius 14 px and `backdrop-filter: blur(8px)`. Titles in Kyber Inter.
- **Text contrast:** at least 4.5:1 against `--kyber-bg-deep`.

Welcome page: the Kyber Crystal colors (background `#0A0F2D`, accent `#00E5FF`), headings in Kyber Sora and text in Kyber Inter. No other change.

- [ ] **Step 1: Failing tests,** opening `about:newtab` in a tab under `kyber-crystal`:
  - `test_newtab_waves`: the computed `background-image` of `body` contains `waves-crystal.svg`.
  - `test_newtab_big_fox`: the logo element's computed width is at least 160 px and its `background-image` contains `fox-crystal.png`.
  - `test_newtab_follows_theme`: `apply("kyber-crimson")` with the tab still open makes `body`'s image contain `waves-crimson.svg`, within `TestUtils.waitForCondition`. Then `apply("ember")` makes it contain neither file.
  - `test_user_wallpaper_wins`: add `darkWallpaper` to `body` and set `--newtab-wallpaper`; the computed `background-image` no longer contains `waves-`.
  - `test_newtab_no_remote_loads`: a `PerformanceObserver` in the page (or `performance.getEntriesByType("resource")`) shows no `http:` or `https:` resource.
  - `test_welcome_fonts`: the welcome page `h1` computed `font-family` starts with `"Kyber Sora"`.
- [ ] **Step 2: Run. Expected: FAIL.**
- [ ] **Step 3: Write the new tab and welcome blocks.** Check in the running build that the `chrome://kyberfox/content/…` images load on `about:newtab`. If they do not, add `contentaccessible=yes` to the `% content kyberfox` line in `jar.mn`, limited to that package, and note it in the commit.
- [ ] **Step 4: Run. Expected: PASS.** Take screenshots of the new tab in the three themes, with and without reduce glow.
- [ ] **Step 5: Commit** `Give the new tab and welcome page the Kyber look`

### Task 6: The private window page

**Files:**
- Create: `patches/kyber/private-window-page.patch`, appended to `patches/kyber/series.txt`. It changes `browser/components/privatebrowsing/content/aboutPrivateBrowsing.html`:
  - Add `<link rel="localization" href="browser/kyberfox.ftl"/>`.
  - Inside the `.showPrivate.showSearch.container`, after the logo block, add `<div class="kyber-private-heading" hidden>` with `<h1 data-l10n-id="kyberfox-private-heading">` and `<p data-l10n-id="kyberfox-private-subheading">`. After the search wrapper, add `<p class="kyber-private-note" data-l10n-id="kyberfox-private-note" hidden>`.
  - The `hidden` attributes keep them out of view under every non-Kyber theme. `pages.css` shows them.
- Modify: `overlay/browser/locales/en-US/browser/kyberfox.ftl`, adding:
  - `kyberfox-private-heading = Private window`
  - `kyberfox-private-subheading = Search privately`
  - `kyberfox-private-note = Your local browsing history is not saved in this window.`
- Modify: `themes/kyber/pages.css`, with a block scoped to `url("about:privatebrowsing")`:
  - The private fox `var(--kyber-fox-private)` at 300 px replaces the logo image, and the Firefox wordmark and Nova tagline are hidden.
  - `.kyber-private-heading` and `.kyber-private-note` get `display: block !important` (to beat `[hidden]`).
  - The heading uses Kyber Sora 600, `text-transform: uppercase`, letter spacing 0.18 em, and a 90 px line on each side in the glow colors via `::before`/`::after`.
  - The search field is the same pill as on the new tab.
  - Firefox's info box (`.info-border`) stays, styled as a dark glass card under the note. Its text and links are unchanged.
- Test: `browser_kyber_look.js`

- [ ] **Step 1: Failing tests,** in a private window opening `about:privatebrowsing`:
  - `test_private_page_kyber_lines`: under `kyber-crystal`, `.kyber-private-heading` is visible (`offsetHeight > 0`), and its `h1` text (after `document.l10n.ready`) is `Private window`. The note text is the sentence above.
  - `test_private_page_hidden_under_ember`: under `ember`, both are not visible, and the Firefox info box is visible.
  - `test_private_info_still_reachable`: under `kyber-crystal`, `.info-border` is visible and its link elements are present.
  - `test_private_fox_follows_theme`: under `kyber-azure`, the logo's computed `background-image` contains `private-azure.png`.
- [ ] **Step 2: Run. Expected: FAIL.**
- [ ] **Step 3: Implement.** Generate the patch with `diff -u` from `work/dev`, as for the earlier patches, and check it with `patch -p1 -R --dry-run`. Run `tests/test_patchset.py`.
- [ ] **Step 4: Run. Expected: PASS.** Take screenshots of the private page in the three themes.
- [ ] **Step 5: Commit** `Give the private window page the Kyber look`

### Task 7: "Reduce glow" in the theme settings

**Files:**
- Modify: `overlay/browser/components/kyberfox/content/theme-pane.mjs`, adding a checkbox under the theme cards, bound to `KyberThemes.setReduceGlow` / `reduceGlow()`, shown for every theme but described as affecting the Kyber themes
- Modify: `kyberfox.ftl`, adding `kyberfox-theme-reduce-glow = Reduce glow` and `kyberfox-theme-reduce-glow-description = Tones down the glow of the Kyber Crystal, Crimson and Azure themes.`
- Test: `browser_theme_picker.js`

- [ ] **Step 1: Failing test** `test_reduce_glow_checkbox`: open the theme pane. The checkbox exists, is unchecked, and checking it makes `KyberThemes.reduceGlow()` true and the pref true. Unchecking makes both false.
- [ ] **Step 2: Run. Expected: FAIL.**
- [ ] **Step 3: Implement**, following how the pane's other controls are built.
- [ ] **Step 4: Run. Expected: PASS.**
- [ ] **Step 5: Commit** `Add the Reduce glow switch`

### Task 8: Docs, full check and pull request

**Files:**
- Modify:
  - `docs/themes.md`: the three themes, the `"shared"` field, reduce glow, the fallback and default rules, and the one-time move.
  - `docs/branding.md`: the wordmark is now designed (status complete), the theme foxes, and that the masked fox for the private page is still planned.
  - `ROADMAP.md`: Phase 5 gets "Kyber themes, skin, new tab and private page" (in review), and the Jedi-inspired item is replaced by "Crimson and Azure themes, from the owner's concept sheet" (in review).
  - `themes/NOTICES.md`: the fonts, from Task 2.

- [ ] **Step 1: Run the whole Python suite.** `.venv/bin/python -m pytest tests -q`: all pass. `tools/check_forbidden.py` against the dev tree: no hits.
- [ ] **Step 2: Run every Kyber browser test** (`browser/components/kyberfox/test/browser/`) in `work/dev` with the cfg loaded: all pass.
- [ ] **Step 3: Take the screenshot set.**
  - Shots: the new tab, the private page and a normal window with three tabs, for each of `kyber-crystal`, `kyber-crimson` and `kyber-azure`, plus the Kyber Crystal new tab with reduce glow. That is 10 images.
  - Put them in the scratchpad and in `kyber-fox-private/notes/mockups/2026-11-04/results/`, and a contact sheet next to the mockups.
- [ ] **Step 4: Push the branch and open the pull request.**
  - The PR body lists what was built, the screenshots, and the rulings:
    - the PRIVATE label reads "PRIVATE BROWSING";
    - Reset goes to Ember;
    - the move is from `ember` only;
    - `contentaccessible`, if it was needed.
  - It says the owner approves the screenshots before merging.
  - Then dispatch `front-end-tests.yml` on the branch.
- [ ] **Step 5: Commit** any doc changes before the push: `Document the Kyber themes`
