# Themes

The theme engine (`KyberThemes.sys.mjs`) restyles the browser window with two
user style sheets registered through `nsIStyleSheetService`: `themes/base.css`,
which maps Kyber variables onto Firefox's own, and a generated palette sheet
that sets the variables for the chosen theme. Both are limited to
`chrome://browser/content/browser.xhtml`, so web pages are unaffected.

The theme is stored in `kyberfox.theme.id`. `themes/palettes.json` holds the
palettes and `themes/status.json` lists disabled ids. Every palette defines
all of: `--kf-bg`, `--kf-bg-toolbar`, `--kf-bg-tab-active`, `--kf-bg-urlbar`,
`--kf-fg`, `--kf-fg-muted`, `--kf-accent`, `--kf-border`, `--kf-radius`,
`--kf-font`, `--kf-bg-image`. The palette's `scheme` sets `color-scheme` on
the window root, menus, panels and tooltips.

## Known limits

- `@media (prefers-color-scheme: ...)` blocks in Firefox's own CSS follow the
  operating system's scheme, not `color-scheme`. A light palette on a dark OS
  can show a few dark-styled details.
- In-content pages such as about:preferences and about:newtab follow the OS or
  the default theme, not the palette.
- User style sheets are sent to and parsed in every content process. The cost
  is small and accepted.
- If `palettes.json` cannot be read, the engine runs on a built-in Ember
  palette and leaves the stored theme id alone.
