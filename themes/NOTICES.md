# Theme notices

Palettes and styles in this directory come from, or are derived from, the
projects below.

## Catppuccin Mocha

Palette: Mocha from https://github.com/catppuccin/catppuccin (`LICENSE`).
License: MIT. Copyright (c) 2021 Catppuccin.

## Tokyo Night

Palette: https://github.com/enkia/tokyo-night-vscode-theme (`LICENSE.txt`,
fetched 2026-11-03). License: MIT. Copyright (c) 2018-present Enkia.
Every value used (`#1a1b26`, `#16161e`, `#1e202e`, `#c0caf5`, `#787c99`,
`#7aa2f7`, `#363b54`) occurs in `themes/tokyo-night-color-theme.json` of that
repository (the Tokyo Night variant, not Storm).

## Starry

Colors derived from starry-fox, https://github.com/sagars007/starry-fox, at
commit bf7947b341bff62a9c85b1409c224c8065c37974 (main; last pushed
2024-05-18). License: MPL-2.0. The values used are the near-black
backgrounds (`#101010`, `#000000`, `#111111`, `#313131`), the border
`rgb(48, 48, 48)` and the purple-to-cyan accent pair (`#9f1aff`, `#00ddff`).
No file content, script or image is copied; the star field is plain CSS
radial gradients written for Kyber Fox. The project's `fx-autoconfig`
scripts are not used.

## Ember, Paper, Frost, Terminal

Original to Kyber Fox.

## GX-style and One-style skins

Both skins are vendored with `python -m tools.vendor_skins` (see
`tools/vendor_skins.py`) into `themes/skins/gx/` and `themes/skins/one/`.
Each directory keeps the upstream `LICENSE` and every upstream MPL header.
Author of both projects: Godiesc. License: MPL-2.0.

- GX-style: https://github.com/Godiesc/firefox-gx, commit
  `1d2bbf2e27dcf56f72f9cd974dfd271159b37ae8` (release v.12.5, 2026-10-26).
- One-style: https://github.com/Godiesc/firefox-one, commit
  `8dae8be19f690317a97a608c408f82751ed040be` (2026-10-17).

Modifications, all made by the vendor tool:

- Only `chrome/userChrome.css`, its `@import` tree and the icon and image
  files it refers to are kept (no font files; see below). `userContent.css` (web and `about:` page styling),
  `chrome/newtab/` wallpapers, `Extras/`, `Tricks/`, READMEs, previews and
  the companion browser extensions are not shipped.
- The `@import` tree is flattened into one `userChrome.css` and wrapped in
  `@-moz-document url-prefix("chrome://")`, so the skin only restyles
  browser windows and dialogs, never web pages. Every `url()` becomes an
  absolute `chrome://` URL (see below).
- Branding removal: the custom properties `--opera4`, `--opera7` and
  `--opera9` (One-style) are renamed `--vivid4`, `--vivid7`, `--vivid9`; the
  word is removed from comments. Neither project ships an Opera logo file; the third-party brand logos
  they do ship are listed below.
- Every `url()` into `chrome/newtab/` (wallpapers, about-page images) is
  replaced by `none`, since that directory is not shipped. Every
  `url()` to a file that upstream references but does not ship is replaced by
  `none` as well, because a missing chrome:// file crashes the browser under
  automation: `icons/black.svg` and `icons/convert-range.svg` (both skins) and
  `icons/tab-bottom-corner-right-australis-clipped.svg` (GX-style).
- Fonts: upstream ships `Underwave-Bold.ttf`, whose name table reads
  "Copyright (c) 2021 Opera Norway AS. All rights reserved." It is not MPL
  and is not copied; no font file is ever vendored from the skins. The `@font-face` rule for
  the family `gamer` (used for a menu label in GX-style) is removed and uses
  of the family become `sans-serif`.
- Every `url()` is rewritten to an absolute
  `chrome://kyberfox/content/themes/skins/<id>/...` URL. A relative `url()`
  inside a custom property resolves against the sheet that uses the property,
  which can be a Firefox sheet.
- `url(../icons/logo_chatGPT.svg)` is matched to the shipped
  `logo_chatgpt.svg` ignoring case (upstream is developed on Windows).
- Third-party brand logos that upstream ships and the skins use for menu
  icons are kept unchanged: `relay-logo.svg`, `logo_anthropic-claude.svg`,
  `logo_bitwarden.svg`, `logo_chatgpt.svg`, `logo_discord.svg`,
  `logo_google-gemini.svg`, `logo_hugging-chat.svg`, `logo_instagram.svg`,
  `logo_messenger.svg`, `logo_mistral.svg`, `logo_spotify.svg`,
  `logo_telegram.svg`, `logo_twitch.svg`, `logo_twitter.svg`,
  `logo_ublock.svg`, `logo_whatsapp.svg` (plus the project logos
  `logo_grouptabs.svg`, `logo_gx-theme-styles.svg`, `logo_side-view.svg`,
  `logo_tree-tabs.svg`). The marks belong to their owners.
- `user.js` is converted to the `prefs` map of `skin.json` and applied by the
  theme engine, which saves and restores the user's own values.
  `toolkit.legacyUserProfileCustomizations.stylesheets` is dropped because
  the sheets are registered directly. Also dropped, with these effects:
  `svg.context-properties.content.enabled` (web-exposed; chrome:// images get
  SVG context paint anyway), `layout.css.corner-shape.enabled` (GX-style; a
  nightly-only CSS feature exposed to web pages on release, so those corners
  degrade to plain rounded ones) and
  `browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar`
  (One-style; only upstream's unshipped new-tab CSS needs it).
- One-style gets the extra pref `firefoxone.without-default-colors`, which
  upstream provides to turn off its own light and dark defaults. Those follow
  the operating system, so without it the skin comes up light on a light OS
  whatever the Kyber `color-scheme` says.
- `colors.css` in each skin is written for Kyber Fox (source in
  `tools/skin_extras/`). The upstream projects expect a lightweight color
  theme from addons.mozilla.org (Beautiful Opera GX Fuchsia, for example,
  CC-BY-NC-SA-3.0 per its listing); those add-ons are not bundled and their
  values are not copied. The accent colors `#fa1e4e` and `#4c4cff` are the
  skins' own `--fuchsia` and `--blue` constants from their MPL files.

## Sora and Inter fonts

Sora 5.3.0 (https://github.com/sora-xor/sora-font, Copyright 2019 The Sora
Project Authors) and Inter 5.3.0 (https://github.com/rsms/inter, Copyright
2016 The Inter Project Authors), taken from the `@fontsource/sora` and
`@fontsource/inter` npm packages at the versions pinned in `pins.toml`.
License: SIL Open Font License 1.1, shipped next to the fonts as
`OFL-Sora.txt` and `OFL-Inter.txt`. Only the Latin subset is bundled, in
the weights the Kyber pages use (Sora 600 and 700, Inter 400, 500 and 600),
unmodified, in `overlay/browser/components/kyberfox/content/fonts/`.

The wordmark (`branding/wordmark.svg`, `themes/kyber/wordmark-mask.svg` and
the copies in the branding folder) is the Sora Bold glyph outlines, drawn as
paths by `tools/make_wordmark.py`; no font is embedded in it.
