# Testing

Kyber Fox is tested at three levels: Python tests for the tooling, browser
tests that run inside a built Kyber Fox, and smoke tests that install the real
release artifacts. A manual checklist covers what automation cannot reach yet.
Nothing on this page counts as passed until it has been run on the build in
question.

## Automated tests

| Suite | Where | What it covers | When it runs |
|---|---|---|---|
| Python tests | `tests/` | Assembly and patch classification, cfg and policies, presets, themes and skins, update manifests and MAR signing, the Arch packaging and repo scripts, upstream watch, the forbidden-code check, doc rules | Every pull request and push to main (the Checks workflow, PR #11), and in the release workflow |
| xpcshell | `overlay/browser/components/kyberfox/test/xpcshell/` | Shipped prefs and policies on a fresh profile: search engines, AI switches, telemetry, cookies, DRM, push, display version | Front-end tests workflow |
| Browser tests (mochitest) | `overlay/browser/components/kyberfox/test/browser/` | Defaults, identity, import wizard, privacy presets, Settings styling, shield logic and panel, skins, hidden sync UI, theme picker and themes, bundled uBlock, welcome page, workspaces logic and UI | Front-end tests workflow; every release |
| Forbidden-code check | `tools/check_forbidden.py`, rules in `rules/forbidden.toml` | Telemetry, studies, ads, crash reporting and AI code must not return after a Firefox update | Every release |
| Arch smoke test | `.github/workflows/smoke-arch.yml` | Builds the pacman package, installs it in an Arch container from a local repo, checks the installed files and that `kyberfox --version` prints the expected version | Every Linux build and release |
| Windows smoke test | `.github/workflows/smoke-windows.yml` | Silent install, install directory, version, a headless start | Every Windows build and release |
| Windows update test | `.github/workflows/smoke-update.yml` | The updater refuses a MAR signed with the wrong key and keeps working; after publishing, it applies the real signed MAR and the version changes | Every release |

### Running them locally

- Python: `.venv/bin/python -m pytest tests -q` from the repo root (after
  `.venv/bin/pip install --require-hashes -r requirements-release.txt -r requirements-dev.txt`).
- Browser tests run on the artifact build in `work/dev`, described in
  [build-gate.md](build-gate.md). On a desktop session they need a display; the
  owner runs them in a virtual KWin session so they do not take over the screen.
  Pass `--appname` with the path to the built `firefox` binary, because the
  binary is named `kyberfox`.
- Full builds are not run on the development laptop; CI builds them.

## Release checklist (manual)

Run this on the release candidate, with a new profile unless the item says
otherwise. Use `kyberfox --profile <empty dir>` or `-P` with a dedicated
profile; never the everyday profile.

### Basics

- [ ] Starts with a new profile; the welcome page appears once
- [ ] Browse a few common sites; open, close, reorder and pin tabs; reopen a closed tab
- [ ] Bookmarks and history: add, search, delete
- [ ] Download a file; open it from the downloads panel
- [ ] Session restore: quit with several windows and workspaces, start again, everything comes back
- [ ] Workspaces: create, rename, switch, delete; tabs stay in their workspace after a restart
- [ ] Themes: switch between each color theme and skin; switching back to the default theme restores the default look

### Privacy and permissions

- [ ] Shield: blocked count shows on a page with ads; turning the shield off for a site reloads it unblocked, and the choice survives a restart; a private window's shield change is gone after the window closes
- [ ] Standard and Strict presets switch the options listed in [privacy-defaults.md](privacy-defaults.md); changing one option shows Custom
- [ ] Site permissions (location, camera, microphone, notifications, autoplay) prompt, can be changed from the address bar's site panel, and can be cleared
- [ ] Clear cookies and site data for one site from the site panel
- [ ] HTTPS-Only: an HTTP-only local service shows the error page, and the exception works
- [ ] No unexpected hosts on first run, compared with [network-audit.md](network-audit.md) (each major Firefox update)

### Logins and media

- [ ] Log in to a site with a password manager add-on, and with two-factor authentication
- [ ] A passkey or hardware security key login on a site that supports WebAuthn (record which authenticator was used)
- [ ] Video playback on a common video site; a video call in the browser (camera, microphone, screen share)
- [ ] Protected media after enabling DRM: Netflix, Disney+, Spotify, as in [streaming.md](streaming.md); record resolution limits, which are documented, not release blockers

### Extensions and developer tools

- [ ] Install an add-on from the welcome page and one from addons.mozilla.org; both work after a restart
- [ ] Developer tools: inspector, console, debugger and network panel open and work

### Linux desktop

`tools/plasma_check/run.sh` covers most of this list in virtual KWin
sessions; see [KDE Plasma checks](#kde-plasma-checks). Check the rest on a
real Plasma desktop.

- [ ] KDE Plasma on Wayland, and Kyber Fox started with `MOZ_ENABLE_WAYLAND=0` (X11 through XWayland): the window opens, scales correctly at 100%, 125% and 150%, and clipboard and drag and drop work
- [ ] The file picker (save a page, upload a file) uses the KDE dialog through the XDG desktop portal
- [ ] A site notification (after allowing notifications for the site) appears as a Plasma notification from Kyber Fox
- [ ] The app menu entry, icon and window grouping use Kyber Fox's name and logo; a private window gets its own taskbar entry with the mask icon

### Updates

- [ ] Windows: install the previous release, let it update to the candidate, check the version and that the profile is intact
- [ ] Arch or Garuda: `pacman -Syu` from the previous release to the candidate; same checks

### Accessibility

- [ ] Every Kyber Fox panel (shield, workspaces, theme picker, welcome page) can be used with the keyboard alone, and shows a focus ring
- [ ] Text in each theme stays readable; check contrast of body text and buttons

### Homelab services

- [ ] A service on a local address with a self-signed or private CA certificate: import the CA under Settings, Certificates, then load it without errors
- [ ] A common homelab dashboard loads with the shield on

## KDE Plasma checks

`tools/plasma_check/run.sh OUT_DIR [KYBERFOX_BINARY]` starts the installed
Kyber Fox (`/opt/kyberfox/kyberfox` by default) with a new profile in five
virtual KWin sessions: Wayland at 100%, 125% and 150%, and XWayland at 100%
and 150%. Nothing opens on the real desktop. Each session's settings and
KWin's saved output scales stay in `OUT_DIR`. The script prints, for each
session:

- the window protocol and device pixel ratio;
- the app ID KWin sees (resource class and desktop file);
- whether text copied in Kyber Fox can be pasted on the desktop, and the
  other way round.

Each session then opens a private window and starts Plasma's task manager
applet (`plasmawindowed org.kde.plasma.icontasks`). The `*-taskbar.png`
screenshot shows the icon each window gets: the fox for the normal window,
the mask for the private one. The applet reads the installed desktop files.
To check changed ones before a release, copy them into
`OUT_DIR/data/applications/` before running the script.

The 100% Wayland session also sends a notification and opens the Save dialog.
It prints whether the dialog went through the portal (`SaveFile`) and which
window KWin shows for it. Screenshots go to `OUT_DIR`.

In a virtual session, plasmashell has no panel and does not take the
notification service name. `tools/plasma_check/notify_server.py` stands in
for it and logs what Kyber Fox sends. The script cannot check drag and drop
or the notification popup itself.

Firefox does not send a desktop notification when a download finishes, so
the notification check uses a site notification instead.

### Results on 2026-11-05

Kyber Fox 159.0.1-4 from the pacman repository, Plasma 6.8.2, KWin 6.8.2,
xdg-desktop-portal 1.22.1 with xdg-desktop-portal-kde 6.8.2.

| Check | Result |
|---|---|
| Wayland window | Opens on the Wayland protocol; resource class and desktop file `kyberfox` |
| XWayland window (`MOZ_ENABLE_WAYLAND=0`) | Opens on XWayland; resource class `kyberfox` |
| Scaling | Device pixel ratio 1, 1.25 and 1.5 at 100%, 125% and 150% on both; text and icons sharp in the screenshots |
| Clipboard | Both ways, at every scale, on both |
| File picker | `SaveFile` goes through the portal and the KDE dialog opens (window `org.freedesktop.impl.portal.desktop.kde`) |
| Notification | Sent over `org.freedesktop.Notifications` with app name "Kyber Fox" and hint `desktop-entry: kyberfox`, so Plasma shows it under Kyber Fox |
| Private window entry | Resource class and desktop file `kyberfox-private`, checked on the development build of PR #49 (159.0.1-6 and later) |
| Drag and drop, popup | Not checked yet; need a real Plasma desktop |

The Plasma 6.8 install used here has no X11 session, so XWayland is the X11
path that was checked.

### Taskbar, 2026-11-06

With 159.0.1-7 installed, a private window showed the fox in the real
taskbar instead of the mask. The cause was `StartupWMClass=kyberfox` in
`kyberfox.desktop` ([branding.md](branding.md)). With that line removed, the
task manager applet shows the fox for normal windows and the mask for
private ones, on Wayland and XWayland and at 100%, 125% and 150%.

## When a privacy setting breaks a site

1. Turn the shield down for that site and reload.
2. If it still fails, test with the Standard preset.
3. If Standard fails but stock Firefox works, file an issue with the site, the
   Kyber Fox version and which setting fixed it.
