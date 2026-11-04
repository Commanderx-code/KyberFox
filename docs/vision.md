# Vision

This is the short version of where Kyber Fox is going. The full design for
release 1, with every decision and who made it, is the
[design document](superpowers/specs/2026-11-02-kyber-fox-design.md). The phased
plan is [ROADMAP.md](../ROADMAP.md).

## What it is

Kyber Fox is a Firefox fork with the classic Firefox layout (tabs across the
top, toolbar below), stronger privacy than stock Firefox, a few features from
other browsers, and built-in themes with some personality. The engine is Gecko;
Kyber Fox changes the interface, the defaults and the services.

## Who it is for

1. The owner, every day, on an Arch-based KDE Plasma desktop.
2. Close friends, on Windows and on Garuda Linux.
3. Possibly a wider public later, once the conditions in the roadmap are met.

People who run homelabs and write code are the main audience, but nothing in
Kyber Fox should require either.

## Principles

1. **Security updates come first.** A Kyber Fox build that falls behind Firefox
   security releases is worse than stock Firefox. The target is 72 hours from a
   Firefox security release. A feature or skin that breaks on an update ships
   disabled rather than delaying the update.
2. **Privacy you can read.** Every default that differs from Firefox has a
   reason written down in [privacy-defaults.md](privacy-defaults.md), and the user
   can change it. Kyber Fox does not claim anonymity, and does not call a feature
   isolation unless it actually separates data and has been tested.
3. **No telemetry, no AI features, no sponsored content.** These are removed at
   build time, and a release check fails if they return.
4. **Visible network use.** The hosts Kyber Fox contacts on its own are listed in
   [network-audit.md](network-audit.md), with what each one is for.
5. **Optional and reversible.** New features can be turned off, and themes,
   skins and privacy presets can be reset to the defaults.
6. **Stay close to Firefox.** Kyber Fox prefers preferences, policies and overlay
   files to patches, and small patches to large ones, so that each Firefox update
   stays cheap. See [architecture.md](architecture.md).
7. **Compatible with the normal web.** When a privacy setting breaks a site, the
   per-site shield lets the user turn protection down for that site only.
8. **Local first.** Features keep data on the device unless the user chooses
   otherwise. Planned sync is end-to-end encrypted.
9. **Its own identity.** No Firefox, Mozilla, Brave or Opera names or logos as
   branding, and no assets copied from projects without a license.

## Scope

In scope now: Windows and Linux on x86-64, desktop only.

Out of scope for now: macOS, phones, a new engine, a sidebar-first layout, and
public-scale infrastructure. Phone apps and sync are later, separate projects.

## Platforms

The owner's own setup is Linux, so Linux and KDE Plasma get the most day-to-day
testing. Windows was in release 1 from the start because friends use it, and
it has signed automatic updates. Both stay supported.
