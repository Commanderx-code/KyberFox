# Themes

The theme engine (`KyberThemes.sys.mjs`) restyles the browser window with two
user style sheets registered through `nsIStyleSheetService`: `themes/base.css`,
which maps Kyber variables onto Firefox's own, and a generated palette sheet
that sets the variables for the chosen theme. Both are limited to
`chrome://browser/content/browser.xhtml`, so web pages are unaffected. The
Kyber themes also style the new tab, private window and welcome pages (see
below); no theme styles web pages.

The theme is stored in `kyberfox.theme.id`. `themes/palettes.json` holds the
palettes and `themes/status.json` lists disabled ids. Every palette defines
all of: `--kf-bg`, `--kf-bg-toolbar`, `--kf-bg-tab-active`, `--kf-bg-urlbar`,
`--kf-fg`, `--kf-fg-muted`, `--kf-accent`, `--kf-border`, `--kf-radius`,
`--kf-font`, `--kf-bg-image`. The palette's `scheme` sets `color-scheme` on
the window root, menus, panels and tooltips.

## Picker and custom CSS

Settings > Appearance starts with a Kyber Fox theme group
(`content/theme-pane.mjs`, wired in by `patches/kyber/theme-pane.patch`): one
card per `KyberThemes.available()` entry, an Import custom CSS button and a
Reset button. Clicking a card applies it at once.

Import copies the picked `.css` file (at most 1 MB, valid UTF-8, at least one
rule) to `<profile>/chrome/kyberfox-custom.css` and registers it as a user
sheet above the palette sheet, wrapped in the same browser-window rule. It is
read from nowhere else. `kyberfox.theme.custom` records that it is active; a
later start registers the file again. The file is parsed first and only its
parsed top-level rules are placed inside the wrapper (and the result is
checked to be a single scope rule), so stray braces cannot widen the scope to
web pages; the same check runs on every start. `@namespace` and `@import`
rules are dropped. A failed import changes nothing.

Reset (the button, or Ctrl+Shift+Alt+T in any browser window) removes the
sheet and the file and applies Ember. In safe mode `init()` does nothing, so a
broken theme or custom file cannot lock you out.

Firefox's own themes picker in Add-ons and themes is off
(`browser.aboutaddons.novaThemesPickerEnabled` is false in `kyberfox.cfg`): its
themes install from addons.mozilla.org and compete with the Kyber Fox picker.
Firefox's built-in Light, Dark and Alpenglow themes are hidden there too
(`patches/kyber/hide-builtin-themes.patch`). They stay installed, because the
profile manager uses Light and Dark; their manifests set `hidden`, which the
patch allows in the theme manifest schema for built-in add-ons. Add-ons and
themes then lists only the default theme and themes the user installed. A
profile that had one of the three active keeps it until the default theme is
enabled again from that page.

## Skins

`themes/skins/<id>/` holds full skins (kind `skin`): GX-style (`gx`) and
One-style (`one`), vendored from Godiesc's projects by
`python -m tools.vendor_skins` at the commits pinned in `pins.toml` (see
`themes/NOTICES.md` for what is kept and changed). `skins/index.json` lists
the ids; each `skin.json` has `name`, `scheme`, `sheets`, `prefs` and the
`--kf-*` `vars` used for the picker card. An optional `logo`, a PNG path
relative to `themes/`, replaces the Kyber Fox logo on that card.

`apply("gx")` removes `base.css` and the color palette, registers a sheet
that sets only `color-scheme` (from `scheme`), then each sheet of the skin
as a user sheet (`colors.css` first, `userChrome.css` last). Every skin sheet
is wrapped in `@-moz-document url-prefix("chrome://")`, so it styles browser
windows and dialogs and never web pages. In-content `about:` pages are not
styled; the skins' `userContent.css` is not shipped.

The skin's `prefs` are set on apply. The user's own values (or the fact that
there was none) are first saved as JSON in `kyberfox.theme.skinPrefBackup`
and put back when another theme is applied or `resetToDefault()` runs. After
a restart a backup that already covers the skin's prefs is kept, so a crash
cannot save the skin's values as the user's. Some prefs may need a restart
or a tab reload to show fully: `browser.tabs.allow_transparent_browser`.

A skin that cannot be loaded, or that is listed in `status.json` `disabled`,
falls back to Ember like any theme.

To update a skin: change its pin in `pins.toml`, run
`python -m tools.vendor_skins <gx|one>`, commit the diff, and run
`browser_skins.js`.

## Kyber themes

Kyber Crystal (`kyber-crystal`, cyan and violet on midnight blue), Crimson
(`kyber-crimson`, red on black) and Azure (`kyber-azure`, blue and silver on
navy) are skins under `themes/skins/kyber-*/`. Each has its own `colors.css`
with the `--kf-*` variables and the Kyber ones (`--kyber-glow-a`,
`--kyber-glow-b`, `--kyber-bg-deep`, the fox, private fox, Fox Guard and wave
images and the wordmark colors). Everything else is shared by the three and lives in
`themes/kyber/`, listed in each `skin.json` under `"shared"` (paths relative
to `themes/`, registered after the skin's own sheets):

- `base.css`, the same variable mapping the color themes use.
- `kyber/fonts.css`: Sora and Inter, bundled (see `themes/NOTICES.md`), under
  the family names "Kyber Sora" and "Kyber Inter".
- `kyber/chrome.css`: the window. A gradient outline and glow on the address
  bar, rounded tabs with the selected one outlined, the theme's fox and the
  name at the start of the tab strip, Firefox's labeled private browsing
  indicator shown as a PRIVATE pill in private windows, and the theme's Fox
  Guard in the Kyber Shields panel.
- `kyber/settings.css`: native Settings, with the theme's fox and wordmark,
  cyan-edged cards, violet navigation selection, subtle waves and a wider content
  column. Native radio presets are arranged horizontally at wider sizes.
  `content/settings-layout.mjs` places the real Settings search control in the
  sidebar above 950 px and restores it below that width or outside a Kyber skin.
  It preserves focus and restores native positioning in high contrast and safe
  mode. Navigation still collapses at Firefox's breakpoint.
- `kyber/pages.css`: about:newtab and about:home (waves behind the page, the
  big fox with the wordmark, a glowing search pill, glass top site cards; a
  wallpaper the user picked still wins), about:privatebrowsing (the private
  fox, a PRIVATE WINDOW heading, the search pill, a short note and Firefox's
  info box as a glass card), and the welcome page (the theme's colors and
  fonts).

The shared sheets are scoped with `@-moz-document` to `chrome://` URLs and
the new-tab, private and preferences `about:` pages, and register only while a Kyber theme is applied,
so every other theme leaves these pages as Firefox draws them. The private
page's heading and note come from `patches/kyber/private-window-page.patch`,
hidden in the page itself, and only `pages.css` shows them. The new tab's CSP
gets `font-src chrome:` from `patches/kyber/newtab-fonts.patch` so the bundled
fonts load there; no package is made reachable from web pages.

The generated fox images in `themes/kyber/foxes/` are the logo, the private
logo and the Fox Guard artwork recolored per theme by `tools/make-logos.sh` (a
gradient map from luminance to the theme's ramp, alpha kept). The waves are
drawn by `tools/make_waves.py` and the wordmark mask by
`tools/make_wordmark.py`. On the new tab and in Settings the wordmark is that
mask filled with the text color for KYBER and the theme's two wordmark colors
for FOX, so it follows the theme; `firefox-wordmark.svg` keeps the Kyber
Crystal colors for Firefox's own pages.

**Reduce glow.** Settings > Appearance has a Reduce glow checkbox under the
theme cards, stored in `kyberfox.theme.reduceGlow`. When it is on, a small
sheet sets `--kyber-glow-strength` to 0.25, which scales every glow. High
contrast and forced colors drop the glow and the pictures behind text.

**Default, fallback and the one-time move.** New profiles start on Kyber
Crystal. Ember stays the fallback: a theme that fails to load or is disabled
in `status.json`, a skin sheet that fails, and Reset all go to Ember. A theme
that is only disabled keeps its place in `kyberfox.theme.id`, so it comes
back when a later release turns it on again. On the first start of this
version a profile whose stored theme is empty or `ember` moves to Kyber
Crystal once, and `kyberfox.theme.movedToKyber` records it, so choosing Ember
again later sticks. If Kyber Crystal cannot be applied on that start, the
move is tried again on the next one. Any other stored theme is kept.

## Known limits

- `@media (prefers-color-scheme: ...)` blocks in Firefox's own CSS follow the
  operating system's scheme, not `color-scheme`. A light palette on a dark OS
  can show a few dark-styled details.
- Kyber themes color about:preferences through native settings tokens. Other
  in-content pages still follow Firefox defaults.
- User style sheets are sent to and parsed in every content process. The cost
  is small and accepted.
- If `palettes.json` cannot be read, the engine runs on a built-in Ember
  palette and leaves the stored theme id alone.

The private pages use the owner-supplied `foxes/masked-fox.png` unchanged.
See [ui-implementation.md](ui-implementation.md) for the current implementation,
preview instructions and remaining mockup work. Reduced-motion preferences
remove glow and page transitions.

Settings listens for `kyberfox-theme-changed`, emitted by `KyberThemes.apply()`
after applying a palette. This also handles a disabled or unreadable skin falling
back while the stored theme choice remains unchanged. The observer and media
query listeners are removed when the Settings document unloads.

## Settings page details

Appearance lists the three Kyber themes first while keeping `available()` in
its original order for other callers. Each theme card contains a decorative
browser preview driven by its actual palette; the preview is hidden from
assistive technology and the card remains the only control. The gallery has
one tab stop, arrow-key selection, Home/End navigation and disabled-theme
skipping. Selecting a theme still uses the existing settings binding and
applies immediately. Preview images use the existing local PNG app icon.

Search retains native engine selection, private-window engine selection,
reordering, editing and visibility controls. Settings tokens provide rounded rectangular
fields and outlined rows, with a violet marker for the separate private engine.
Permissions retains the native list and per-site dialogs. Rows have cyan icons,
hover/focus feedback and individual outlines. `sitePermissions.xhtml` and `addEngine.xhtml` receive
the Kyber surface and control colors while retaining all native warnings and
permission behavior. Narrow Settings dialogs are constrained to the viewport;
Save and Cancel remain reachable. High contrast keeps system colors.
