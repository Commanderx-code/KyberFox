# Kyber Fox

Kyber Fox is a Firefox fork for people who like Firefox's interface but no
longer trust where Mozilla is heading: its funding, its default-on ads and AI
features, and its data practices. It keeps the classic layout (tabs across the
top, toolbar below), adds stronger privacy than stock Firefox, brings in a few
features from other browsers, and gives the window some personality through
built-in themes. The engine is still Gecko; "from the ground up" here means the
interface, the defaults and the services.

It is for the maintainer and close friends first. A wider public release may
come later.

## What is in release 1

- Workspaces: named sets of tabs in a window, switched from the dropdown at the
  left of the tab bar. Firefox's own tab groups and split view work inside them.
- Shield: a per-site switch for ad and tracker blocking, fingerprinting
  protection and cookie blocking.
- Privacy presets, Standard and Strict, at the top of the Privacy and security
  pane in Settings.
- Themes and skins: Ember, Paper, Frost, Terminal, Catppuccin Mocha, Tokyo
  Night, Starry, and two full skins (GX-style and One-style), picked in
  Settings under Appearance. Custom CSS can be imported there too.
- uBlock Origin, bundled and ready on first run.
- A welcome page where you pick a search engine and tick the add-ons you want
  from a short recommended list. Nothing is installed unless you choose it.
- No telemetry and no AI features.
- Signed automatic updates on Windows, and a signed pacman repository for Arch
  Linux and Garuda.

## What is not in release 1

- Sync. Bookmarks and browser data stay on your machine; there is no Kyber Fox
  sync yet.
- Phone apps. They would be separate, later projects.
- macOS, and a Glass-style look.

## Install

See [docs/install.md](docs/install.md) for Windows and for Arch Linux or
Garuda. The Windows installer is not code-signed, so Windows SmartScreen asks
you to confirm; the install guide shows the clicks.

## How it is built

The release is assembled from the pinned Firefox source tarball, a small subset
of LibreWolf's patches, the Kyber Fox patches in `patches/kyber/`, and the
files in `overlay/`, `settings/` and `themes/`. Builds run on hosted GitHub
Actions runners, not on a laptop. [docs/build-gate.md](docs/build-gate.md)
describes the build and the local front-end loop, and
[docs/release.md](docs/release.md) describes how a release is cut, signed and
published. New Firefox security releases are tracked by
[docs/upstream-watch.md](docs/upstream-watch.md), with a 72-hour target to
ship.

## Privacy

Kyber Fox sends no telemetry. The few hosts it contacts on its own (the update
manifest, the add-on blocklist and similar) are listed in
[docs/network-audit.md](docs/network-audit.md). How the shield works with
uBlock Origin is in [docs/shield-ublock-control.md](docs/shield-ublock-control.md).

## Other documents

- [docs/themes.md](docs/themes.md): the theme engine, skins and custom CSS
- [docs/arch-repo.md](docs/arch-repo.md): the Arch package repository
- [docs/update-signing.md](docs/update-signing.md): how Windows updates are signed
- [docs/streaming.md](docs/streaming.md): DRM and streaming checks
- [GLOSSARY.md](GLOSSARY.md): the words the project uses for its own concepts
- [SECURITY.md](SECURITY.md): how to report a vulnerability

## Credits

Kyber Fox stands on other people's work:

- [Mozilla Firefox](https://www.firefox.com/), the browser it is built from.
- [LibreWolf](https://librewolf.net/), whose patches and privacy defaults it
  builds on.
- [uBlock Origin](https://github.com/gorhill/uBlock) by Raymond Hill, bundled
  as the ad and tracker blocker.
- [firefox-gx](https://github.com/Godiesc/firefox-gx) and
  [firefox-one](https://github.com/Godiesc/firefox-one) by Godiesc, the basis of
  the GX-style and One-style skins.
- [starry-fox](https://github.com/sagars007/starry-fox), the source of the
  Starry colors.
- [Catppuccin](https://github.com/catppuccin/catppuccin) and
  [Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme), the source
  of two palettes.

What was taken from each, and under which license, is in
[themes/NOTICES.md](themes/NOTICES.md) and on the `about:license` page in the
browser. Kyber Fox is not made or endorsed by Mozilla.

## License

Kyber Fox's own code (tools, overlay, patches, themes) is under the
[Mozilla Public License 2.0](LICENSE), like Firefox. Bundled third-party pieces
keep their own licenses; see the credits above.
