# Kyber Shields

Kyber Shields is the per-site protection panel: the Crystal Guard icon at the
right end of the address bar and the panel it opens. The panel draws and
drives the shield engine (`KyberShield.sys.mjs`, see
[shield-ublock-control.md](shield-ublock-control.md)); it adds no protection
of its own.

Code: `overlay/browser/components/kyberfox/content/shield-ui.mjs`,
`shield.css`, the `crystal-guard*.svg` icons and the `fox-guard.png` artwork.
Strings: the Kyber Shields section of `kyberfox.ftl`. Tests:
`browser_shield_ui.js`.

## The icon

| State | When | Shape |
| --- | --- | --- |
| on | the site's switch is on and all three protections are on | shield with a solid crystal |
| partial | the site's switch is on, one protection is off | shield with a hollow crystal |
| attention | the site's switch and its ad protection are on, but the ad blocker is turned off or removed, so nothing blocks ads | the "on" icon with a "!" badge cut into the corner |
| off | the site's switch is off | shield and crystal in one color, crossed out |
| unavailable | a page the shield does not handle (about:, file:, extension pages) | the "on" icon, dimmed; the panel does not open |

The state comes from `KyberShield.state()` and `KyberShield.adBlocking()` and
is set as `shield-state` on the button. Attention is only for a protection the
user asked for that is not running. A protection the user switched off is a
choice and shows as partial. The badge's magenta is fixed, so it reads the
same on every theme, and its "!" is a hole, so the shape carries the meaning
too. The icons are drawn by hand on a 16 px grid after the Crystal Guard
artwork, not traced. The tooltip and the accessible name say the state in words, so color
is never the only signal. The shield is colored with the skin's
`--kyber-glow-a` and the crystal with `--kyber-glow-b`; themes without them
fall back to the palette accent and then to Firefox's colors. With forced
colors the icon uses the system text color. The blocked count stays a small
badge on the icon.

## The panel

Every row shows real data or opens a real control:

| Row | Source | Action |
| --- | --- | --- |
| Status card: "Protection on", "Some protections off", "Ad blocking is not running", "Protection off" | `KyberShield.state()` | the switch is the site's master switch (`setEnabled`), reloads the page |
| Ads and trackers blocked | uBlock Origin's badge count for the page in the tab (`KyberShield.blockedCount`) | none; reads "Off for this site" while ad blocking is off there, "Not running" while the ad blocker is turned off or removed, "Off in private windows" in a private window after the ad blocker's private-window access was turned off in Add-ons and themes (it is on by default; see [shield-ublock-control.md](shield-ublock-control.md)), and "Not counted" when its badge is not a number |
| On this site: Ads and trackers, Fingerprinting, Cookies | `KyberShield.state()` | `setControl`, reloads the page. The ads switch is disabled while the ad blocker is not running |
| Turn it on in Add-ons and themes | shown only while the ad blocker is turned off or removed, with a note that ads are not blocked | opens Add-ons and themes |
| Site not working? | `KyberShield.state()` | folds out steps that turn protections off for the site one at a time, reloading after each: cookie protection first (it also lifts Firefox's tracker blocking there and fixes most sign-in, video and checkout problems), then ad blocking (skipped while the ad blocker is not running), then the whole shield; "Turn everything back on" restores the site. A private window has the one session-only step |
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

## The Fox Guard artwork

The panel header shows Fox Guard, a fox and a crystal within a shield, at
88 px (48 px in windows shorter than 560 px). The shipped file,
`fox-guard.png`, is the original artwork cropped to its content and resized
to 176 px, twice the shown size, for HiDPI screens; it is about 48 KB. The
1312 px original is `branding/fox-guard.png`. The artwork carries its own
glow, so one file works on the Kyber skins and on light themes. It is
decoration: screen readers skip it, and the title names the panel.

## Not built

- A built-in blocker. The in-tree adblock-rust engine is only an experiment
  (docs/research/2026-11-04-content-classifier-experiment.md); the panel
  shows uBlock Origin's work. When the engine is connected, its counts and
  per-site switch go through `KyberShield` so the panel needs no change.
- A per-site breakdown of what was blocked. uBlock's logger has it but no
  stable API for the panel.
- Firefox's own blocked-tracker count in the same row.
- A Shields page in Settings. The panel's Privacy settings row opens the
  Privacy pane, where the presets and Firefox's own protections live.
