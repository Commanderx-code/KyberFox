# Kyber Shields

Kyber Shields is the per-site protection panel: the Crystal Guard icon at the
right end of the address bar and the panel it opens. The panel draws and
drives the shield engine (`KyberShield.sys.mjs`, see
[shield-ublock-control.md](shield-ublock-control.md)); it adds no protection
of its own.

Code: `overlay/browser/components/kyberfox/content/shield-ui.mjs`,
`shield.css`, the `crystal-guard*.svg` icons and `fox-guard-frame.svg`.
Strings: the Kyber Shields section of `kyberfox.ftl`. Tests:
`browser_shield_ui.js`.

## The icon

| State | When | Shape |
| --- | --- | --- |
| on | the site's switch is on and all three protections are on | shield with a solid crystal |
| partial | the site's switch is on, one protection is off | shield with a hollow crystal |
| off | the site's switch is off | empty shield, crossed out |
| unavailable | a page the shield does not handle (about:, file:, extension pages) | the "on" icon, dimmed; the panel does not open |

The state comes from `KyberShield.state()` and is set as `shield-state` on the
button. The tooltip and the accessible name say the state in words, so color
is never the only signal. The shield is colored with the skin's
`--kyber-glow-a` and the crystal with `--kyber-glow-b`; themes without them
fall back to the palette accent and then to Firefox's colors. With forced
colors the icon uses the system text color. The blocked count stays a small
badge on the icon.

## The panel

Every row shows real data or opens a real control:

| Row | Source | Action |
| --- | --- | --- |
| Status card: "Protection on", "Some protections off", "Protection off" | `KyberShield.state()` | the switch is the site's master switch (`setEnabled`), reloads the page |
| Ads and trackers blocked | uBlock Origin's badge count for the page in the tab (`KyberShield.blockedCount`) | none; reads "Off for this site" while ad blocking is off there and "Not counted" when uBlock is missing or its badge is not a number |
| On this site: Ads and trackers, Fingerprinting, Cookies | `KyberShield.state()` | `setControl`, reloads the page |
| Site not working? | `KyberShield.state()` | folds out steps that turn protections off for the site one at a time, reloading after each: cookie protection first (it also lifts Firefox's tracker blocking there and fixes most sign-in, video and checkout problems), then ad blocking, then the whole shield; "Turn everything back on" restores the site. A private window has the one session-only step |
| Site permissions | Firefox's `SitePermissions.getAllForBrowser`, counting the allowed ones | opens Firefox's Page Info window on its Permissions tab |
| Privacy settings | none | opens Settings, Privacy |
| Advanced blocking settings | shown only while uBlock Origin is installed | opens uBlock's dashboard |

The count is per page load, not per site: it is what uBlock blocked on the
page in the tab. Firefox's own tracking protection counts separately and is
not added in.

Keyboard: the icon takes Enter and Space, like the other address bar icons.
Opened from the keyboard, the panel focuses the master switch; Tab moves
through the switches and rows and wraps; Escape closes it. Rows
have a visible focus ring. The only motion is the hover color on the rows,
and it is off with reduced motion.

Private windows: only the master switch exists, kept for the session (the
engine's private-window rules). The per-site controls and their heading are
hidden; the permission and settings rows work as in a normal window.

## Placeholder: the Fox Guard emblem

The panel header shows a placeholder: `fox-guard-frame.svg`, a vector shield
outline in the theme colors, around the theme's existing fox image
(`--kyber-fox`, or the Kyber Fox logo outside the Kyber skins). The finished
emblem from the owner's concept sheet (a fox and a crystal within a shield)
does not exist as an asset yet. It needs:

- one SVG, no embedded raster, readable at 64 to 96 px;
- colors that work on the Crystal, Crimson and Azure skins and on light
  themes, either drawn with `context-fill`/`context-stroke` or as one file per
  skin;
- a license that lets it ship under the project's terms.

Drop it in as `fox-guard.svg` and replace the two background layers of
`.kyber-shield-emblem` in `shield.css` with it.

## Not built

- A built-in blocker. The in-tree adblock-rust engine is only an experiment
  (docs/research/2026-11-04-content-classifier-experiment.md); the panel
  shows uBlock Origin's work. When the engine is connected, its counts and
  per-site switch go through `KyberShield` so the panel needs no change.
- A per-site breakdown of what was blocked. uBlock's logger has it but no
  stable API for the panel.
- Firefox's own blocked-tracker count in the same row.
