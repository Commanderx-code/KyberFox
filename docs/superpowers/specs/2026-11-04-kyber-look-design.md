# Kyber look: themes, skin, new tab and private window

Status: design, waiting for the owner's approval. Date: 2026-11-04.

## Intent

The owner drew eight mockups of how Kyber Fox should look: a dark browser
with cyan and violet glow, the fox logo large on the new tab and the private
window page, the name "KYBER FOX" under it, rounded glowing search fields,
and three color themes. Today Kyber Fox has the logo and a theme engine, but
it still looks like Firefox with different colors. This work makes the
browser look like the mockups, so it feels like its own product the moment
it opens.

The mockups are kept outside the public repository, in
`kyber-fox-private/notes/mockups/2026-11-04/` (`01-website.png` to
`08-crimson-azure-palettes.png`), because some of them show Lucasfilm
names and a Lucasfilm emblem. The builder reads them there. The ones this
design covers are `02-private-window.png`, `03-new-tab.png`,
`05-logo-card.png`, `06-brand-identity.png`, `07-theme-concepts.png` and
`08-crimson-azure-palettes.png`.

## Goals

1. **Three themes**, all dark, with the same look and different colors:
   - **Kyber Crystal**: cyan, violet, deep navy. The new default.
   - **Crimson**: red and black.
   - **Azure**: blue and silver.
2. **The Kyber skin**: the browser window in the mockup style. A glowing
   gradient outline on the address bar, rounded tabs with the selected tab
   outlined, dark toolbars, and in private windows a "PRIVATE" pill with
   the mask icon at the right end of the toolbar (`02-private-window.png`).
3. **New tab page** (`03-new-tab.png`): the logo large and centered, the
   designed "KYBER FOX" wordmark under it, a rounded search field with a
   glowing outline, the shortcut tiles as dark glass cards, and a
   background of soft glowing waves in the theme's colors.
4. **Private window page** (`02-private-window.png`): the private logo
   large (for now the main fox with the mask badge from
   `branding/private-browsing/`; the masked fox drawn in the mockup comes
   later, when the owner has a clean export), "PRIVATE WINDOW" in wide letter spacing with a short line on each
   side, "Search privately" under it, the glowing search field, and the
   sentence "Your local browsing history is not saved in this window."
   Firefox's longer explanation and its links stay reachable on the page.
5. **A fox for each theme**: on the new tab and private pages the logo takes
   the theme's colors: red and black for Crimson, blue and silver for Azure.
   The app icon, the tab icon and the taskbar icon stay the one real logo
   in every theme.
6. **Wordmark**: "KYBER FOX" in the bold, wide lettering of
   `06-brand-identity.png` (not the thin, very wide lettering of
   `03-new-tab.png`), "KYBER" white and "FOX" with a cyan-to-violet
   gradient. Sora Bold, letter-spaced, is the starting point; the outline
   should match the brand sheet's weight and width. It
   replaces the placeholder `about-wordmark.svg` and `firefox-wordmark.svg`,
   so the About window shows it too.
7. **Fonts**: Sora for headings and the wordmark, Inter for text, on Kyber
   Fox's own pages (new tab, private page, welcome page). The toolbars and
   menus keep the system font.
8. **"Reduce glow" switch** in the theme settings, which tones the glow down
   to a thin outline for people who find it too bright.

## Decisions the owner made (2026-11-04)

- The Kyber look is the **default** on first start. The other themes and
  skins stay one click away in the theme picker.
- Theme names: **Kyber Crystal**, **Crimson**, **Azure**. No Star Wars
  terms and no Lucasfilm emblems
  anywhere: not in names, art, strings or file names.
- Shortcut tiles are **Firefox's own top sites** (most visited, which the
  user can pin, edit and remove), styled as cards. No fixed set of links.
- The new tab background is **glowing waves** in each theme's colors. No
  city or landscape scenes in this work.
- The glow is **as bright as in the mockups**, with the "Reduce glow"
  switch.
- **Dark only.** No light variant in this work.
- The red and blue foxes are made from the real logo by a **gradient map**:
  the logo's brightness mapped onto a ramp of the theme's colors, keeping
  its shading and transparency. A plain hue shift was tried and rejected
  (it turns the fox green). The owner judges the result and may replace the
  files with their own art later.
- The wordmark uses the **bold, wide lettering** of `06-brand-identity.png`.
- The private page uses the **badge logo** (`branding/private-browsing/`)
  until the masked fox art exists.
- The real logo stays as it is (raster, `branding/logo.png` and the size
  renders). The redrawn SVGs were rejected.

## Colors

Read off the owner's mockups (`06-brand-identity.png` gives the Kyber
Crystal values; the Crimson and Azure values were sampled from the swatches
in `08-crimson-azure-palettes.png`).

| Theme | Colors |
|---|---|
| Kyber Crystal | cyan `#00E5FF`, electric violet `#B400FF`, deep navy `#0A0F2D`, white `#FFFFFF` |
| Crimson | black `#010101`, dark red `#560110`, crimson `#CF0122`, red `#FA0226`, pink `#F994AE`, white `#FDFEFD` |
| Azure | navy `#00133D`, royal blue `#0045CC`, sky blue `#31A2F2`, ice `#88F7FD`, silver `#CCD1D8`, white `#FEFEFE` |

How these spread over backgrounds, toolbar, tabs, borders and text is the
builder's call, as long as text meets WCAG AA contrast (4.5:1 for body text)
on its background.

The gradient ramps used in the trial (dark to light, three segments) were:

- Crimson: `#120006` → `#7A0012` → `#FF1A3C` → `#FFD6DE`
- Azure: `#020B2A` → `#0B3FD6` → `#3AA0F5` → `#EEF3FA`

Trial output: the right column of the sheet the owner was shown. The
builder may tune the ramps; the owner approves the final images.

## Non-goals

- The Settings page restyle (`04-settings.png`). That is the next design,
  after this one ships.
- The project website (`01-website.png`). A separate project.
- A light theme.
- Background scenes (cities, castles, landscapes) from the concept sheets.
- The tab sidebar on the left in `04-settings.png`. Firefox's vertical tabs
  stay a user choice; this work does not turn them on.
- Features drawn in the mockups that Kyber Fox does not have or will not
  have: "Kyber Search", "Tabs from Other Devices" (needs Sync, a later
  release), "Send Do Not Track" (Firefox removed it), and "search
  recommendations" (sponsored suggestions, which stay off).
- The traffic-light window buttons in `01-website.png`. Window buttons stay
  native.

## Anti-goals

These would make the work a failure even if it looks right:

- **Anything that loads from the network.** Wave backgrounds, fonts, logos
  and the wordmark ship inside the browser. The network audit must not
  change. The new tab's remote wallpapers stay off
  (`kyberfox.externalWallpapers.enabled` false).
- **Heavy patches to Firefox code.** Firefox ships every two weeks. The
  look is CSS (skin sheets and user sheets), images, strings, and at most
  small patches of the kind already in `patches/kyber/`. A look that
  breaks on a Firefox update must be switchable off through
  `themes/status.json`, falling back to a working theme, never a broken
  window.
- **Changing the logo's design**, or showing a recolored fox as the app
  icon.
- **Hiding Firefox's privacy explanation** on the private page. The short
  sentence is added; the accurate longer text stays reachable.
- **Text that is hard to read**: glow behind text, or contrast under AA.
- **Breaking user choices**: a user who picked another theme keeps it after
  the update; a user's own new tab wallpaper, if they set one in the new
  tab's customize panel, still wins over the Kyber waves.

## Constraints

- Builds on the existing theme engine (`KyberThemes.sys.mjs`,
  `themes/palettes.json`, `themes/skins/`, the theme pane in Settings).
  A skin today is `skin.json` plus CSS sheets; the three Kyber themes are
  one look in three colors, so they should share one set of sheets, not
  three copies.
- `DEFAULT_ID` (today `ember`) becomes the Kyber Crystal theme. Profiles
  with a saved `kyberfox.theme.id` keep theirs.
- Fonts: Sora and Inter are under the SIL Open Font License 1.1, which
  allows bundling. Ship only the weights used, as woff2, with the license
  and a line in `themes/NOTICES.md`, pinned like every other input (version
  and hash).
- The wordmark SVG uses outlined paths, not live text, so it does not
  depend on the font being loaded.
- New strings ("PRIVATE", "Private window", "Search privately", "Your
  local browsing history is not saved in this window.", "Reduce glow") go
  through Fluent like the other Kyber Fox strings, in US English.
- `tools/check_forbidden.py`, the front-end tests and every release gate
  keep passing. MPL headers on new source files.
- No new full builds on the owner's laptop; the artifact build in
  `work/dev` is used for checks and screenshots.

## How it is checked

- Browser tests: the three themes are listed and apply; Kyber Crystal is
  the default on a new profile; a saved theme survives; the "Reduce glow"
  switch changes the computed style; disabling the skin in `status.json`
  falls back; the new tab and private page show the Kyber logo, wordmark
  and strings for each theme; nothing on those pages loads from `http(s)`.
- Screenshots from the artifact build (virtual KWin, as for the logo work)
  of: the new tab, the private page and a normal window with a few tabs, in
  each of the three themes, with and without "Reduce glow". The owner
  compares them with the mockups and approves.

## Calls made while writing this (the owner can overrule any)

- **The Kyber pages follow the Kyber themes only.** The new tab and private
  page get the Kyber look (waves, large fox, wordmark, glass tiles, fonts)
  only while one of the three Kyber themes is active. Under any other theme
  (Ember, Paper, Frost, Terminal, Catppuccin, Tokyo Night, Starry, GX, One)
  they look as they do today. The private page keeps the private logo that
  `patches/kyber/private-browsing-logo.patch` already puts there.
- **Fallback theme.** If the Kyber skin is switched off in
  `themes/status.json`, or cannot load, the engine falls back to Ember, and
  the new tab and private page go back to today's look. Ember stays the
  fallback even though Kyber Crystal becomes the default.
- **Existing profiles move once.** Every alpha profile has `ember` saved,
  because the engine writes the theme on first run, so "keep a saved theme"
  alone would leave every current user on Ember. One time only, a profile
  whose saved theme is `ember` is moved to Kyber Crystal. Any other saved
  theme is kept, and a user who wants Ember back picks it again; it is not
  moved a second time.
- **The wordmark follows the theme** on the new tab and private page: "FOX"
  takes the theme's gradient (cyan to violet, red to pink, blue to silver).
  It is drawn as a mask filled from the theme's colors, so one outline
  serves all three. The About window uses the Kyber Crystal colors in every
  theme.
- **Window parts in scope:** the glowing address bar outline, the rounded
  and outlined tabs, the toolbar colors, the PRIVATE pill, and the logo
  with "Kyber Fox" at the start of the tab strip (`02-private-window.png`).
  **Out of scope:** the set and order of toolbar buttons (they are the
  user's customization), and the placeholder text. The address bar keeps
  Firefox's text naming the search engine, and the new tab search keeps its
  own. The comparison with the mockups will show those differences, and
  that is intended.
- **The welcome page** gets the Kyber Crystal colors and the two fonts, and
  no other changes.
- **Logo cleanup.** The private logo PNG has faint speckled pixels around
  its edge, which would show at the large size on a dark page. These are
  cleaned (alpha thresholded) when the large page images are made, without
  changing the drawing.
- **Owner approval is a merge gate.** The screenshots, including the red
  and blue foxes, go to the owner before the pull request is merged. The
  color-shift trial sheet is
  `kyber-fox-private/notes/mockups/2026-11-04/09-fox-recolor-trial.png`.

## Left to the builder

- How the three themes share sheets in the theme engine (variants of one
  skin, or three skins pointing at shared files), and how the theme picker
  shows them.
- CSS selectors, glow sizes, gradients, radii, and how each theme's colors
  map onto the `--kf-*` variables.
- Drawing the wave backgrounds (original SVG or images; no stock art).
- The exact way the "PRIVATE" pill is made (restyling Firefox's private
  window indicator is the expected route).
- How the new tab and private page styles are attached (user sheets scoped
  to those pages, or the existing private page patch extended).
- File layout, test names, and the order of the work.
