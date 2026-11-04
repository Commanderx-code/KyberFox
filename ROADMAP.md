# Roadmap

Kyber Fox is a Firefox fork in **alpha**. Release 159.0-1 went to the owner and
close friends on Windows and Arch Linux on 2026-11-04. This file tracks what is
done, what is next, and what is only an idea. The design behind release 1 is
[docs/superpowers/specs/2026-11-02-kyber-fox-design.md](docs/superpowers/specs/2026-11-02-kyber-fox-design.md).

Status labels:

- **complete**: shipped and checked, by an automated test or a recorded manual check
- **in review**: done in an open pull request
- **in progress**: being worked on
- **planned**: agreed, not started
- **blocked**: waiting on something named in the item
- **research**: feasibility not shown yet; no promise to ship

Kyber Fox stays an alpha until the update path has been checked on real
machines (Phase 1 exit criteria). It is not called stable or production-ready
before then.

## Phase 0: Foundation (release 159.0-1)

Exit criteria: a signed, installable build on Windows and Arch that updates
itself, with no telemetry or AI code. **Met on 2026-11-04.**

- [x] Built from the pinned Firefox release tarball plus a reviewed subset of LibreWolf patches (complete; `pins.toml`, `patches/`)
- [x] Own name, binary, app ID and profile: `kyberfox`, profile in `~/.config/kyberfox`, runs beside Firefox (complete; [ADR 0002](docs/adr/0002-xdg-profile-directories.md))
- [x] Version shows the Firefox base: `159.0-1` (complete; [ADR 0001](docs/adr/0001-version-tracks-firefox.md))
- [x] Repeatable builds on GitHub Actions from pinned hashes (complete; [docs/build-gate.md](docs/build-gate.md))
- [x] Telemetry, studies, crash reporting and AI features removed, with a release check that fails if they return (complete; `tools/check_forbidden.py`)
- [x] First-run network audit (complete; [docs/network-audit.md](docs/network-audit.md))
- [x] uBlock Origin bundled, per-site shield, Standard and Strict privacy presets (complete; browser tests)
- [x] Workspaces, theme picker, color themes, GX-style and One-style skins (complete; browser tests)
- [x] Welcome page: pick a search engine and optional add-ons, nothing pre-ticked (complete)
- [x] Signed automatic updates on Windows (MAR signing) and a signed pacman repository (complete; [docs/update-signing.md](docs/update-signing.md), [docs/arch-repo.md](docs/arch-repo.md))
- [x] Upstream watch opens a pull request for each Firefox release (complete; [docs/upstream-watch.md](docs/upstream-watch.md))

## Phase 1: Dependable friends release

Exit criteria: an update from one Kyber Fox release to the next has been
installed on a real Windows PC and a real Arch or Garuda machine; the release
checklist in [docs/testing.md](docs/testing.md) has been run once by hand; the
signing keys have an offline backup.

- [ ] Release 159.0.1 (planned; waits on the owner's go)
- [ ] Final logo and private-browsing logo (in review, PR #12)
- [ ] Python tests on every pull request (in review, PR #11)
- [ ] Update from 159.0-1 to 159.0.1 on a real Windows PC (blocked: needs the owner's machine)
- [ ] Install and update on a real Garuda machine (blocked: needs the owner's machine)
- [ ] Offline backup of `kyber-fox-private/keys/` (blocked: owner task)
- [ ] KDE Plasma checks: file picker through the XDG portal, notifications, fractional scaling, Wayland and X11 sessions (planned; [docs/testing.md](docs/testing.md))
- [ ] About dialog shows the Kyber Fox version and the Firefox version it is built from (planned; check the current dialog first)
- [ ] Decide on `aus5.mozilla.org` system add-on checks, listed as unexpected in the network audit (planned)
- [ ] Project documents: roadmap, vision, architecture, privacy defaults, testing, branding, licensing (in progress, this pull request)

## Phase 2: Transparent privacy

Exit criteria: every default in [docs/privacy-defaults.md](docs/privacy-defaults.md)
has a stated reason and a verification status, and the Settings page explains
the compatibility cost of each Strict option.

- [ ] Explanations and compatibility notes under each option on the Privacy page (planned)
- [ ] A short "this site is broken" path from the shield panel to the fixes (planned)
- [ ] Self-hosted SearXNG as a search engine: document the steps with Firefox's "Add search engine" in Settings, then decide whether the welcome page needs a field for it (planned)
- [ ] Network audit rerun on every major Firefox update, compared with the last one (planned)
- [ ] Mirror the security lists on project hosting instead of Mozilla's (research; the spec asks to revisit this before any public release)

## Phase 3: Power-user features

Exit criteria per feature: it can be turned off, it has a browser test, and it
survives a Firefox major update without code changes or ships disabled.

- [ ] Command palette driven by the keyboard (planned)
- [ ] Custom keyboard shortcuts (planned; check what Firefox itself offers first)
- [ ] Session snapshots: save and restore a set of windows by name (planned)
- [ ] Workspace templates, for example Development, Homelab and Research, with optional starter shortcuts (planned; workspaces stay tabs only and do not separate cookies or logins)
- [ ] New tab: optional clock, background image and local notes, with no remote content (planned)
- [ ] UI density options beyond Firefox's compact mode (planned)
- [ ] Separate logins per workspace through containers (research; would be the first real isolation, and must be tested before it is described as isolation)

## Phase 4: Sync (release 2 in the spec)

- [ ] Word-code sync, end-to-end encrypted, on the project's own server (planned; design in the spec, section Sync)

## Phase 5: Looks

- [ ] Glass theme, an original remake (planned)
- [ ] Neon or cyberpunk palette with optional glow, built on the existing theme engine (planned)
- [ ] A palette inspired by the owner's Jedi mockups (planned; the name and wording need the trademark check in [docs/licensing.md](docs/licensing.md))
- [ ] The masked fox illustration on the private window page (planned; needs a larger render, see [docs/branding.md](docs/branding.md))

## Research tracks

These have no ship date. Each ends in a written result, not necessarily a
feature.

- [ ] Built-in content blocking in the style of Brave Shields (research; [docs/content-blocking-research.md](docs/content-blocking-research.md)). Firefox 159 already contains a fork of Brave's adblock-rust engine, off by default. Proposal: keep uBlock Origin, and try the in-tree engine on a development profile only, as a possible second layer
- [ ] Name check before any public release: Mozilla's trademark guidelines give "[Something]-fox" as an example of a name to avoid, and "Kyber" has other owners and meanings (research; [docs/licensing.md](docs/licensing.md))
- [ ] Windows installer code signing (research; needed before any public release)
- [ ] Flatpak or AUR package in addition to the pacman repository (research)

## Later ideas, not commitments

- Android app, likely based on IronFox; iOS companion on WebKit
- macOS
- Built-in RSS reader
- Shortcuts to the owner's other tools (Helix Toolbox, Command Center, Config Bible), always optional; Kyber Fox must stay useful on its own
- Public release, which needs installer signing, the name check, the security-list decision above and a public support plan
