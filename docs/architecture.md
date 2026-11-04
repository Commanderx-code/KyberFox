# Architecture

This page describes how Kyber Fox is put together today, why, and which
decisions are still open. Decisions already made are recorded as ADRs in
[docs/adr/](adr/).

## Summary

Kyber Fox is not a long-lived fork branch of Firefox. Each build starts from
the official Firefox source tarball of a pinned release and applies Kyber
Fox's changes on top, in a fixed order. The repository holds only those
changes, the tools that apply them, and the release pipeline.

```
Firefox release tarball (pinned version and SHA-256, archive.mozilla.org)
  + LibreWolf patches, the subset listed in patches/librewolf-keep.txt
  + Kyber Fox patches, patches/kyber/series.txt, in order
  + LibreWolf's en-US strings
  + overlay/ copied over the tree (branding, the Kyber Fox component, tests)
  + settings/ (kyberfox.cfg prefs, policies.json), themes/, bundled uBlock Origin
  = assembled tree  ->  mach build (CI)  ->  installer, tarball, MAR, pacman package
```

`tools/assemble.py` does every step, and `pins.toml` pins every input:
Firefox (version and hash), LibreWolf (tag and commit), uBlock Origin (version
and hash), and the vendored skins (commits). The same pins give the same tree.

## Upstream base: Firefox release channel

**Decision (made, see [ADR 0003](adr/0003-firefox-release-channel-base.md)):**
Kyber Fox follows the Firefox release channel, not ESR, and its version number
is the Firefox version plus a build counter ([ADR 0001](adr/0001-version-tracks-firefox.md)).

The comparison behind it is in [Release or ESR](#release-or-esr) below.

## Layers, from lightest to heaviest

Changes go in the lightest layer that can carry them, because heavier layers
cost more on every Firefox update.

| Layer | Where | Examples | Cost on a Firefox update |
|---|---|---|---|
| Prefs | `settings/kyberfox.cfg` | Privacy defaults, telemetry off, presets | Almost none; a renamed pref is caught by tests |
| Enterprise policies | `settings/policies.json` | Search engines, disabled features | Almost none |
| Overlay files | `overlay/` | Branding, the Kyber Fox component (shield, workspaces, themes, welcome page), tests | Low; they use Firefox APIs that can change |
| Kyber Fox patches | `patches/kyber/` | Registering the component, Settings panes, private browsing logo | Each patch can fail when Firefox changes the code around it |
| LibreWolf patches | `patches/librewolf-keep.txt` | Removing telemetry, crash reporting, AI features; XDG profile paths | Maintained by LibreWolf; Kyber Fox re-pins its tag |

A new LibreWolf patch must be classified as kept or dropped before assembly
continues, so nothing from upstream is applied unreviewed.

## Kyber Fox's own code

All Kyber Fox features live in one browser component,
`browser/components/kyberfox/` (from `overlay/`), registered by
`patches/kyber/0001-register-component.patch`. It contains the shield, the
workspaces, the theme engine and picker, the privacy presets and the welcome
page, each with browser tests under `test/`.

## Build and release

- Builds run on GitHub Actions free runners: Linux natively, Windows by
  cross-compiling from Linux. See [build-linux.md](build-linux.md) and
  [build-gate.md](build-gate.md).
- A release is one workflow run plus the owner's approval: build, test, sign
  the Windows update with Kyber Fox's MAR key, publish the GitHub Release, and
  update the Windows update manifest and the signed pacman repository. See
  [release.md](release.md).
- The upstream watch opens a pull request for each Firefox release. See
  [upstream-updates.md](upstream-updates.md).

## Profile and identity

The binary and app ID are `kyberfox`. On Linux the profile is in
`~/.config/kyberfox` and the cache in `~/.cache/kyberfox`
([ADR 0002](adr/0002-xdg-profile-directories.md)), so Kyber Fox runs beside
Firefox without touching its profile.

## Release or ESR

Checked on 2026-11-04 against Mozilla's own pages; sources and the items
that could not be confirmed are in
[research/2026-11-04-base-and-licensing.md](research/2026-11-04-base-and-licensing.md).

| | Release | ESR |
|---|---|---|
| Current version | 159.0.1 (2026-11-03) | 153.6 (153.0 shipped 2026-07-21) |
| Major versions | Every two weeks since Firefox 155 on 2026-09-01 ([Mozilla](https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/)) | One a year ([admin docs](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/)); next line 175, listed for 2027-06-29 |
| Security fixes | Every fix, in each major and dot release | Fixes Mozilla chooses to backport (security and high-severity stability) ([ESR landing process](https://wiki.mozilla.org/Release_Management/ESR_Landing_Process)) |
| New features | Immediately | At the yearly jump only |
| Forks on it | LibreWolf, Floorp, Zen | Tor Browser, Mullvad Browser stable |

What it means for Kyber Fox (analysis, not a sourced claim):

- **For release:** Kyber Fox's patches sit on top of LibreWolf's, and LibreWolf
  tracks release, so staying on release keeps that layer cheap. New Firefox
  features and fixes to the interface Kyber Fox builds on arrive without
  waiting up to a year. Every security fix ships, not a chosen subset.
- **Against release:** a new base every two weeks, so patches break more often.
  The upstream watch and the small patch count are what keep that affordable.
- **For ESR:** one rebase a year; better for a project that cannot keep up.
- **Against ESR:** LibreWolf's patches would have to be backported or
  replaced, features lag by up to a year, and the yearly jump is one large,
  risky rebase.

If keeping up with the two-week cadence ever fails repeatedly, switching to ESR
is the fallback, recorded in ADR 0003.

## Open decisions

- **Security-list hosting.** Security lists (certificate revocation, add-on
  blocklist) come from Mozilla's servers. Hosting copies is more private but
  adds a server users' security depends on. Revisit before any public release.
- **Built-in content blocking.** Planned: Firefox's in-tree adblock-rust fork
  as a second layer next to uBlock Origin. Still open: how lists reach users,
  and element hiding. See
  [content-blocking-research.md](content-blocking-research.md).
- **Sync.** Word-code sync on Firefox's sync code and `syncstorage-rs`, with the
  account login replaced. Designed, not started.
- **Windows installer signing.** Needed before a public release; provider not
  chosen.
- **Faster release builds.** PGO and LTO need bigger runners than the free ones.
