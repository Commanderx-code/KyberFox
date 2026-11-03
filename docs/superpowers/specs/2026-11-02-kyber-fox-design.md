# Kyber Fox Design

Date: 2026-11-02

Kyber Fox is called "the browser" below.

## Intent

The owner loves Firefox's interface but no longer trusts Mozilla's direction: its funding, its default-on advertising and AI features, and its data practices. The existing forks don't fill the gap. LibreWolf, Waterfox and FireDragon feel bland, and Zen's sidebar feel is wrong for the owner.

The browser is the classic Firefox layout, with stronger privacy than stock, the features the owner likes from other browsers, and real personality through built-in themes. It is meant for the owner and close friends first, and possibly a wider public later.

"From the ground up" means the interface, defaults and services. The engine stays Gecko. Writing a new engine is out of reach for one person.

## Goals

1. Keep Firefox's layout: tabs across the top, toolbar below.
2. Add workspaces, split view and a built-in theme picker. Keep Firefox's own tab groups.
3. Block ads and trackers out of the box, with a per-site shield in the style of Brave Shields.
4. Offer deeper privacy settings than stock Firefox.
5. Send no telemetry and ship no AI features.
6. Provide private sync of bookmarks and browser data with no account or email.
7. Ship automatic, signed updates that stay current with Firefox security releases.

## Non-goals

- A new browser engine.
- A vertical-tab or sidebar-first design.
- Phone apps in the desktop release. They are later, separate projects.
- macOS. None of the current users need it.
- Public-scale infrastructure before the friends release has proved itself.

## Anti-goals

These would make the project a failure even if it technically works:

- Falling behind Firefox security releases. A stale browser is worse than stock Firefox.
- Telemetry or an AI feature reappearing after an upstream merge.
- Synced data readable by the server.
- Bundling code the project has no license to use.
- A sidebar-first feel like Zen's.

## Constraints

- **Base:** a Firefox fork. Firefox ships a major release every 4 weeks, with urgent security fixes in between.
- **Maintainers:** the owner, with no wider team, so automation must carry routine work.
- **Budget:** free services for the first release, and no more than $25/month through the friends phase. See Costs.
- **Build hardware:** full builds and releases run on hosted automation, not on the owner's laptop.
- **Platforms for the first release:** Windows and Linux. A friend runs Garuda Linux, so Arch packaging is required.
- **Licensing:** Firefox and bundled themes are MPL-2.0. Keep notices, publish changes to MPL files, and do not use the Firefox, Mozilla or Opera names or logos.
- **Spelling:** US English in the interface and docs.

## Decisions Made by the Owner

- Firefox fork, not a new engine.
- Release to close friends first, with public release possible later.
- Desktop first. Phones can wait.
- Name: Kyber Fox.
- The owner approves each release with one click. Automation does the preparation.
- Friends may start with an unsigned Windows installer.
- Workspaces are tabs only for now.
- Layout A, "Classic Plus": a workspace dropdown at the left of the tab bar, followed by tabs, with the standard Firefox toolbar beneath.
- Sync modeled on Brave's: no account, a word code, end-to-end encryption, the owner's server.
- A per-site shield toggle. When strict settings break a site, the user turns protection down for that site.
- Built-in themes: Ember, Paper, Frost, Terminal, Catppuccin, Tokyo Night, plus Starry, GX-style and One-style.
- Ship every theme that can legally be used now. Remake the rest later.

## Interface

The mockup for layout A, from left to right:

- **Tab bar:** workspace dropdown, tab group label, tabs, new-tab button.
- **Toolbar:** back, forward, reload, address bar, shield button with a blocked count, menu.

### Workspaces

Each window shows one workspace at a time. The dropdown switches between workspaces and creates, renames and deletes them. Each workspace keeps its own tabs and tab groups.

A workspace is only a set of tabs for now. It shares cookies and logins with other workspaces. The data model should leave room for optional separate logins later, without migrating users' sessions.

### Split view

Two tabs show side by side in one window, with the focused pane outlined. This is Firefox's own feature, on by default since Firefox 149, so it is carried forward rather than rebuilt.

### Tab groups

Firefox's existing feature, carried forward unchanged.

## Themes

### Theme picker

A section in Settings offers one-click switching with previews. It also accepts custom CSS import, which is the built-in form of the `userChrome.css` workflow. Users should not need `about:config` or a profile folder to change themes.

### Color themes

Ember, Paper, Frost, Terminal, Catppuccin, Tokyo Night and Starry share one stylesheet driven by CSS variables. Each theme is a set of values, which keeps upkeep low. Variables also cover corner radius and font, because Paper uses a serif and Terminal uses square corners and monospace.

The first four came from the mockups:

| Theme | Look |
|---|---|
| Ember | Dark, close to Firefox, orange accent |
| Paper | Warm light with a serif font |
| Frost | Cool blue-gray with soft contrast |
| Terminal | Square corners, monospace, neon green on black |

Sources for the others:

- **Catppuccin:** MIT-licensed palette.
- **Tokyo Night:** built from its palette. Confirm the palette's license before shipping.
- **Starry:** reworked from starry-fox (MPL-2.0, last updated May 2024). That project needs `fx-autoconfig` for dark tooltips. The rework must not.

### Full skins

Each skin overrides Firefox internals, so each can break on any update.

- **GX-style**, from Godiesc/firefox-gx (MPL-2.0). CSS plus `user.js` prefs, no scripts.
- **One-style**, from Godiesc/firefox-one (MPL-2.0). CSS plus `user.js` prefs, no scripts.

Both projects warn that their newest code may work only on beta or nightly, so pin each to a commit known to work on the shipped Firefox version. Credit the authors and keep license notices. Remove Opera's name and branding.

### Glass (later)

Glass is a remake of our own, inspired by the look of Glass-Firefox-Theme and LIQUID-GLASS. Neither repository has a license, so no code may be copied, and LIQUID-GLASS also sells a paid pack. CSS alone cannot make the window itself transparent, so native window work may be needed. That needs testing on Windows and KDE.

## Privacy

### Shield

The toolbar button shows the blocked count for the current site. Its panel holds one master on/off switch for the site, plus separate controls for ads and trackers, fingerprinting, and cookies. Settings are remembered per site.

### Defaults

| Area | Default |
|---|---|
| Ads and trackers | Bundled uBlock Origin, on |
| Third-party cookies | Blocked |
| Fingerprinting | Firefox's standard protection on |
| Strict fingerprinting (`privacy.resistFingerprinting`) | Optional, because it can break sites and reports the timezone as UTC |
| Search | DuckDuckGo |
| DRM (Widevine) | Off until a site asks, then one click to enable |
| Malware protection | On with local lists, `browser.safebrowsing.downloads.remote.enabled=false` |
| Extensions | addons.mozilla.org stays, with a few requests to Mozilla when browsing or updating add-ons |
| New tab | Firefox Home with top sites on; sponsored content, weather, stories and highlights off |
| Search engines shipped | DuckDuckGo, Startpage, Brave Search, Wikipedia; Google and Bing addable by the user |
| Startup | Restore the previous session |
| Profile on Linux | `~/.config/kyberfox`, cache `~/.cache/kyberfox` (ADR 0002) |
| Version | Firefox version plus build counter, `159.0-1` (ADR 0001) |
| Update channels | `release` for friends, `test` for dry runs |

### Removed at build time

Telemetry, crash reporting, studies, sponsored content, ad attribution and AI features are removed, not merely turned off. LibreWolf's patches and hardening are the starting point.

### Background connections

Security-related connections stay and go directly to Mozilla, including extension blocklists, certificate revocation data and tracking-protection lists. Malware protection needs the project's own Google API key at build time. All other background connections to Mozilla and Google are removed or off by default, including web push.

Hosting copies of the security lists would be more private, but it would add a server that users' security depends on. Revisit this before any public release.

### Settings

A deeper Privacy page offers Standard and Strict presets, with every option exposed.

## Sync

There is no account and no email. The first device generates a random word code, and other devices join with that code.

- **Encryption:** the key is derived from the code on the device and never leaves it.
- **Server:** run by the project. It stores only encrypted data, though it can still see IP addresses, timing and data sizes.
- **Recovery:** none. Losing the code and every device loses the synced data. The interface must say so clearly before the user accepts the code.
- **Data synced:** bookmarks at minimum, plus Firefox Sync's other data types where practical.

Brave's `go-sync` server speaks Chromium's sync protocol, so it does not fit. The intended approach keeps Firefox's sync code and `syncstorage-rs` storage server, and replaces the account login with the word code. Firefox's mobile apps are believed to share sync code through the Rust library `application-services`. Confirm this, because it decides how much of the login work can be reused on phones.

## Distribution

- **Windows:** an unsigned installer for friends, who click through a SmartScreen warning. Installer signing is required before any public release. Options are Azure Artifact Signing, where individual eligibility needs confirming, and SignPath, which requires an existing release and manual approval of each one.
- **Garuda and Arch:** a pacman repository.
- **Updates:** automatic on Windows from day one, using the browser's own update signing, which is separate from installer signing. Arch users update through pacman.
- **Source:** public, under MPL-2.0.

### Release approval

Automation merges each Firefox release, builds it and prepares it. Nothing reaches users until the owner approves it with one click. Security fixes target 72 hours from the Firefox release.

## Costs

Rough figures from 2026-11-02. Items marked "estimate" were not checked against a live price.

| Item | When | Cost |
|---|---|---|
| Builds on GitHub's standard runners | Now | Free on public repos |
| Update and download hosting on GitHub | Now | Free |
| Domain | Now | About $15/year (estimate) |
| Sync server, a small VPS of its own | Release 2 | About $5/month (estimate) |
| Windows signing with Azure Artifact Signing | Before public release | About $10/month |
| Apple Developer account | iOS only | $99/year |

Whether a full build fits GitHub's free runners is unconfirmed, so test that first. Zen's release builds use paid 16-core runners with profile-guided optimization. Kyber Fox builds without PGO or LTO to fit free runners, which makes the browser somewhat slower than official Firefox. If it doesn't fit, the fallback is a rented build machine for release days, within the $25/month limit if possible. If the limit can't hold, ask the owner before spending more.

## Release Order

1. Desktop browser for Windows and Linux: fork, removals, layout, workspaces, split view, shield, Privacy settings, theme picker, all themes except Glass, signed updates.
2. Word-code sync on the project's server.
3. Glass theme, and any remakes.
4. Android, likely based on IronFox. Confirm its current status first. It is a separate Kotlin app on GeckoView, and the desktop interface does not carry over.
5. iOS, as a lighter companion with sync and content blocking. In the US, Apple requires WebKit, so this is a separate Swift app with no Gecko, no uBlock Origin, no workspaces and no split view. Friends get it through TestFlight with a $99/year Apple Developer account.

## Designer's Calls

These were settled during design review, not by the owner, and can be overruled.

- **Security over features:** a feature or skin that breaks on a Firefox update ships disabled. It never holds a security release.
- **AI features:** remove chatbots, AI link previews, smart tab group suggestions and generated PDF alt text. Keep Firefox's on-device translation, which is local and not generative.
- **Mozilla account:** the account and Firefox Sync interface are removed from release 1. Release 1 has no sync until word-code sync ships.
- **Streaming:** test Widevine early, on Windows and Linux. Forks can have playback limits that one click cannot fix. Limits get documented and do not block release.
- **Sync code changes:** the sync design must support replacing a leaked code, which also removes lost devices. Passwords sync only once that works.
- **Sync server access:** invite-only for friends, not open to anyone with the source.
- **macOS:** left out because no current user needs it.
- **Background connections:** the owner left this choice to the designer. See Background connections.
- **Budget:** the owner asked for a recommendation. The designer set the $25/month limit.
- **Security target:** 72 hours.
- **Sync server host:** its own small VPS, kept apart from the owner's other services.
- **Logo:** an original placeholder until the owner picks a final one, before friends install. It must not resemble Firefox's.

## Left to the Builder

- Repository layout, and patch workflow on top of Firefox and LibreWolf.
- Which Firefox channel to track.
- Hosted build system and release pipeline.
- Automation that merges each Firefox release and flags patch conflicts.
- A check that fails a release if telemetry or AI code returns.
- How the shield panel controls uBlock Origin and Firefox's per-site settings.
- How the sync server is deployed.
- Theme file format, and the internal mechanism for applying themes.
