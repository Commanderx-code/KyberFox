# Kyber UI implementation

## Repository inspection and approach

This repository assembles pinned Firefox sources, selected LibreWolf patches,
Kyber patches and an overlay. It is not a checked-in Firefox fork. Gecko and
Firefox's browser UI remain the foundation. Native XHTML, JavaScript modules,
Fluent localization, Lit controls and CSS registered as user sheets provide the
interface; there is no separate web application framework.

Existing features include workspaces, Firefox tab groups and split view, native
horizontal and vertical tabs, a theme picker and custom CSS import, Standard and
Strict privacy presets, a per-site Shield connected to bundled uBlock Origin,
and a first-run search/add-on chooser. A native integrated adblock-rust layer
and Kyber Sync remain future work.

The implementation extends the existing shared theme sheets rather than adding
replacement new-tab or settings applications. Relevant source locations:

| Area | Source |
|---|---|
| Assembly and pinned inputs | `tools/assemble.py`, `pins.toml` |
| Theme registration and picker | `overlay/browser/components/kyberfox/KyberThemes.sys.mjs`, `content/theme-pane.mjs` |
| Toolbar, tabs and private indicator | `themes/base.css`, `themes/kyber/chrome.css` |
| Normal/private new tabs | `themes/kyber/pages.css` |
| Settings presentation and colors | `themes/kyber/settings.css` |
| Responsive native search/preset layout | `overlay/browser/components/kyberfox/content/settings-layout.mjs`, `patches/kyber/preferences-style.patch` |
| Theme tokens | `themes/skins/kyber-*/colors.css` and `skin.json` |
| Private heading and explanation | `patches/kyber/private-window-page.patch`, `overlay/browser/locales/en-US/browser/kyberfox.ftl` |
| Actual privacy controls | `KyberPrivacyPresets.sys.mjs`, `KyberShield.sys.mjs`, `content/privacy-presets.mjs` in the component |
| Browser regression tests | `overlay/browser/components/kyberfox/test/browser/browser_kyber_look.js` |

## Implemented and retained

- Deep navy surfaces, cyan/violet outlines, existing wave backgrounds, PNG fox
  artwork, wordmark, native search and editable native shortcuts. User-selected
  wallpapers still win. No sample shortcut destinations are added.
- The supplied masked fox PNG on private new tabs, with a Private Window heading,
  accurate limits on privacy and retained Firefox help links. All three Kyber
  themes use the same original masked illustration; the window icon retains the
  small badged PNG designed for that size.
- Persistent private toolbar label, rounded active tabs and address bar. The
  redundant tab-strip brand is hidden below 700 px to leave room for navigation.
  Native horizontal/vertical tabs and browser shortcuts remain available.
- Existing privacy and permission controls retain their behavior. Settings now
  uses the active Kyber theme's colors; high contrast keeps system colors.
- Visible keyboard focus, responsive private heading/search sizing, and reduced
  motion rules that remove decorative glow and page transitions.
- Native search handoff and its localized text remain intact, including the
  configured private search engine. No search endpoint or data store is added.

The supplied references were inspected in `/home/commander/Downloads/kyberfox/`.
They are visual references, not embedded page screenshots. The masked illustration
is copied unchanged from `kyber_fox_private_new_tab.png` into
`themes/kyber/foxes/masked-fox.png`. It is owner-supplied branding, consistent with
`docs/branding.md`; no third-party asset license was supplied for it. The existing
MPL code and SIL OFL font notices remain intact. No auto-traced fox SVG is used.

## Remaining design work

Settings now follows the reference's branded sidebar, sidebar search, outlined
cards, accent colors and wave details. Its precise grouping and illustrations
are not reproduced.
Its tracker count, Kyber Search, Sync and hypothetical privacy switches are not
added. Firefox's real settings and permission dialogs are retained. Crimson and
Azure already implement the red/black and blue/silver directions using the shared
UI; additional Dark Side/Jedi Order theme names or duplicate implementations are
not introduced. Exact mockup wave shapes, bespoke icons and full platform/native
menu matching remain polish work. The application menu and context menus retain
their previous appearance and placement. New strings currently have only en-US
coverage.

## Run and preview

For an existing assembled artifact checkout, copy changed overlay files and the
`themes/` directory to their corresponding locations in `work/dev/` (themes go
in `work/dev/browser/components/kyberfox/themes/`), then:

```sh
cd work/dev
MOZCONFIG=$PWD/mozconfig-artifact ./mach build faster
preview_profile=$(mktemp -d /tmp/kyber-preview.XXXXXX)
obj-artifact/dist/bin/firefox --no-remote --profile "$preview_profile" about:newtab
```

The commands above use Bash syntax. In Fish, launch the built preview from the
repository root with:

```fish
set preview_profile (mktemp -d /tmp/kyber-preview.XXXXXX)
work/dev/obj-artifact/dist/bin/firefox --no-remote --profile "$preview_profile" about:newtab
```

Use Settings > Appearance > Kyber Crystal. Open a private window with
Ctrl+Shift+P, and Settings > Privacy and security. Also inspect at 600 px wide,
with vertical tabs, keyboard-only navigation and the OS reduced-motion/high
contrast settings. Use a disposable preview profile to leave browsing data alone.
See [build-gate.md](build-gate.md) for first-time artifact setup and its compiled
code limitations. Do not use a bare `pytest`, which collects the upstream tree.

From the repository root:

```sh
.venv/bin/python -m pytest tests -q
cd work/dev
MOZCONFIG=$PWD/mozconfig-artifact ./mach mochitest --headless \
  --app obj-artifact/dist/bin/firefox \
  --exclude-extension=uBlock0@raymondhill.net.xpi \
  browser/components/kyberfox/test/browser/browser_kyber_look.js
```

Local logs and screenshots are in the ignored `artifacts/` directory. Artifact
builds validate the front end against Mozilla's compiled engine; they do not
validate patched C++, Windows/native menus or real-machine update delivery.

## Validation on 2026-11-04

- Python tool/configuration suite: 222 passed.
- Artifact front-end rebuild: successful, no compiler warnings.
- UI, privacy preset and settings browser suites: 126 checks, zero unexpected
  results. The settings color test explicitly selects normal contrast; system
  high contrast intentionally bypasses the theme colors.
- Headless visual previews inspected at 1280×900 and 600×700. Fixed missing
  wordmark/search paint and the narrow Nova grid alignment found during preview.
  Screenshots are local artifacts, not embedded UI.
- No release, push, system-wide setting change or real-profile migration.

## Settings design pass

The shared Kyber skin manifests now load `kyber/settings.css`, so Crystal,
Crimson and Azure share the presentation and supply their own colors. Settings
styles moved out of `pages.css`; Firefox's controls, navigation, permission
dialogs and search remain the implementation.

Settings adds a larger existing PNG fox, a shaded sidebar, a cyan selection
marker and violet selection fill, readable muted navigation text, softly edged
cards, and a subtle background gradient. The narrow layout keeps the native
icon navigation with its labels/tooltips. System high contrast bypasses these
colors, and reduced motion removes control transitions.

The experimental menu stylesheet and decorative menu header were removed at
the owner's request. The menu keeps its previous appearance and its existing
right-hand toolbar button and placement. Existing theme colors from `base.css`
are unchanged.

Restart the preview browser to load the updated shared sheets, then open
`about:preferences#privacy` and the top-right application menu. Local Settings
screenshots are `artifacts/settings-after-1280.png` and
`artifacts/settings-after-600.png`.

After restoring the previous menu appearance, the artifact rebuild, 222 Python
tests and 207 browser checks passed. The menu checks cover a usable width,
window bounds, absence of the added fox header, keyboard navigation and Escape
dismissal. Settings previews were inspected at 1280×900 and 600×700. Windows
and macOS native menus still need platform validation.

## Reference layout refinement

The wider Settings layout now includes a 112 px PNG fox, the existing outlined
wordmark, the real native search field under the branding, compact navigation,
and subtle theme-colored waves. The content column grows to 1100 px, with thin
cyan outlines, a larger native page heading and native Standard/Strict/Custom
preset controls arranged side by side. Custom remains a disabled status option;
no additional protection level or counter is fabricated. Cards stack when the
window is narrower than 951 px.

`settings-layout.mjs` moves the existing search element into the navigation's
supported subheading slot rather than copying it. It restores the element and
vertical radio orientation on narrow windows, high contrast, safe mode and
non-Kyber themes. Search value, focus and native event handlers are preserved.
An observer handles panes loaded after startup; all listeners are removed on
unload. Security/organization notices stay in the main pane and remain visible.
The Settings stylesheet also applies to the existing permissions and search
pages; their real grouping and controls remain native.

Previews: `artifacts/settings-reference-1460.png`,
`artifacts/settings-reference-1280.png`, `artifacts/settings-reference-600.png`,
and `artifacts/settings-reference-vertical-1460.png`. Vertical tabs in the latter
are enabled only in its disposable preview profile; both tab layouts remain
available and no user preference is forced by the theme.

Reference refinement validation: 222 Python tests and 255 browser checks passed.
The checks include working native Settings search after relocation, focus
preservation on resize, horizontal/vertical preset orientation, disabled-skin
fallback, high contrast and the restored menu. The artifact rebuild and patch
application dry run passed. Previews were inspected at 1460×960, 1280×900 and
600×700, with both horizontal and vertical tabs. Neither the main pane nor the
page overflows horizontally at these sizes.

ESLint passes for the layout module and Settings tests. A broader lint run also
found three existing errors in `KyberThemes.sys.mjs` (a missing parameter doc and
two preference try/catch warnings); those unrelated sections were left unchanged.
This UI pass does not install a package or publish a release.
