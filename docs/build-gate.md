# Build gate

Results of the full-build gate are recorded here by the Linux build workflow
work. This file also holds the local development loop below.

## Gate results (2026-11-03, cold builds, commit 3c99103)

Free GitHub-hosted `ubuntu-latest` runners (4 cores, 15 GB RAM, 145 GB disk) build Kyber Fox. Both builds needed `--disable-debug-symbols` and a 12 GB swapfile: with debug symbols on and the stock 3 GB swap, every attempt (three Linux, two Windows) died 15 to 62 minutes into compiling, reported by GitHub as "The operation was canceled" with no cancelling user, which is how a hosted runner reports memory exhaustion.

| Target | Run | Build step | Package | Job total | Peak disk | Artifact |
|---|---|---|---|---|---|---|
| Linux x86_64 | 41575126157 | 94.5 min | 1 min | 99.8 min | 59.6 GB | `kyberfox-linux-x86_64`, 91.9 MB |
| Windows x86_64 (cross) | 41575126071 | 66.8 min | 1.7 min | 74.5 min | 72.1 GB | `kyberfox-windows-x86_64`, 96.4 MB installer |

Both are well inside the 6 hour job limit and the disk, so the gate passes and the owner pays nothing for build minutes (public repository). The Windows smoke job installed the installer silently on a `windows-latest` runner, checked the install directory and version, and took a headless screenshot in 39 s. sccache was cold for both runs; the warm-cache time is measured on the next push to `build-gate`.

## Local dev loop

Full builds are not run on the development laptop. Front-end tests run
against an artifact build instead: Mozilla's prebuilt compiled parts are
downloaded and only the front-end (JS, CSS, XHTML, prefs, jars) is built from
the Kyber tree.

Artifact mode needs a VCS checkout, so `work/tree` (a tarball tree with no
`.git`) cannot be used. Use a shallow clone of the release tag:

```
git clone --depth 1 --branch FIREFOX_159_0_RELEASE \
  https://github.com/mozilla-firefox/firefox work/dev
```

### Applying the assembly

`tools/assemble.py` extracts the tarball and then patches it in the same
function, so it cannot be pointed at an existing checkout directly. A small
git-ignored script under `work/` calls the module's own steps in the same
order as `assemble()`, skipping only the tarball extraction:

1. LibreWolf kept patches (`classify` over `patches.txt` with the keep and drop
   lists), applied with `tools.assemble._apply`.
2. The LibreWolf icons copy.
3. Kyber patches from `patches/kyber/series.txt`.
4. `tools.assemble.apply_librewolf_l10n` (LibreWolf's en-US strings), then
   `overlay/` copied over the tree.
5. `tools.assemble._finish_tree` (settings, staged uBlock XPI, removed paths,
   Glean ping pref, Cargo checksums, static pref order, display version).

The script took about one second. Result: 161 entries in
`git -C work/dev status --short`, and `browser/branding/kyberfox/` is present.
A refactor of `assemble()` that accepts an existing tree would replace the
script; it is not needed for this loop.

The script only works on a pristine tree: run `git reset --hard && git clean -fd`
in `work/dev` before each rerun (`obj-artifact` and the mozconfig are ignored
and survive), or the patches fail as already applied. Run the Python suite as
`python -m pytest tests` from the repo root after
`.venv/bin/pip install -r requirements-dev.txt` (pytest and PyYAML, pinned); a bare `pytest` also collects
`work/dev` and never finishes.

### mozconfig

`work/dev/mozconfig-artifact`:

```
ac_add_options --enable-artifact-builds
ac_add_options --enable-application=browser
ac_add_options --with-branding=browser/branding/kyberfox
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-artifact
```

Do not add `--disable-updater`. Mozilla's prebuilt binary expects
`resource://gre/modules/UpdateServiceStub.sys.mjs`; with the updater disabled
the front-end build omits that file and the browser crashes at startup
("Missing chrome or resource URLs", SIGSEGV in `libxul.so`).

### Build

```
cd work/dev
MOZCONFIG=$PWD/mozconfig-artifact ./mach build
```

Wall time: 44.7 s for the first build (download of about 600 MB of
artifacts into `obj-artifact`, the objdir total), 16.5 s for the rebuild after
the mozconfig change. This is far under the 30 minute target. The shallow
clone itself took 2 min 20 s.

The result is Mozilla's compiled `firefox` binary in
`obj-artifact/dist/bin/`, not a `kyber fox` binary. Pass it to the test
runners explicitly (`mochitest --app obj-artifact/dist/bin/firefox`).

### Patched C++ not reflected

The binary is Mozilla's, so these files are patched in the tree but not in the
running browser:

- `caps/nsScriptSecurityManager.cpp`
- `dom/canvas/CanvasRenderingContext2D.cpp`, `dom/canvas/ClientWebGLContext.cpp`
- `dom/ipc/BrowserParent.cpp`, `dom/ipc/BrowserParent.h`, `dom/ipc/ProcessIsolation.cpp`
- `dom/media/eme/MediaKeySystemAccessManager.cpp`, `dom/media/gmp/ChromiumCDMAdapter.cpp`
- `extensions/pref/autoconfig/src/nsReadConfig.cpp`
- `media/gmp-clearkey/0.1/gmp-clearkey.cpp`
- `netwerk/protocol/http/nsHttpHandler.cpp`
- `third_party/rust/glean-core/src/core/mod.rs`, `third_party/rust/glean-core/src/lib.rs`
- `toolkit/components/remote/nsDBusRemoteClient.cpp`, `toolkit/components/remote/nsDBusRemoteServer.cpp`
- `toolkit/components/telemetry/core/Telemetry.cpp`
- `toolkit/xre/nsAppRunner.cpp`, `toolkit/xre/nsXREDirProvider.cpp` (the profile directory change), `xpcom/build/nsXULAppAPI.h`

Behavior that depends on these (profile location, remote/DBus names, user
agent and network handling, autoconfig reading) must be verified on a full
build.

### Running the tests

- Use `--exclude-extension=uBlock0@raymondhill.net.xpi` on every mochitest
  run. The harness copies `distribution/extensions/*.xpi` into its profile
  itself, and the bundled uBlock Origin then fetches filter lists, which the
  harness treats as a fatal non-local connection.
- Add `export MOZ_REQUIRE_SIGNING=` to the scratch `mozconfig-artifact` and
  run `./mach build faster`. The release default makes Marionette refuse to
  install the unsigned SpecialPowers add-on (`ERROR_SIGNEDSTATE_REQUIRED`).
  Release mozconfigs must never carry this line.
- A test browser left over from a timed-out run keeps Marionette port 2828 and
  makes later runs hang. Kill it first: `pkill -f obj-artifact/dist/bin/firefox`.
- `kyberfox.cfg` and `policies.json` no longer need to be moved aside:
  harness-relevant prefs (`browser.dom.window.dump.enabled`,
  `devtools.console.stdout.chrome`, `dom.security.https_only_mode`) are
  `defaultPref`s, so the harness profile can override them.
- The first-run welcome page never opens while `Cu.isInAutomation` is true
  (mochitest, upstream test runs). `browser_welcome.js` turns that off through
  `KyberAddons._ignoreAutomationForTests`, and the kyberfox `browser.toml` also
  sets `kyberfox.welcome.shown=true`. To see the page in the artifact build,
  start it without the test harness (a plain Marionette session has no
  automation flag, so the page opens there).
- Command:
  `./mach mochitest --headless --app obj-artifact/dist/bin/firefox --exclude-extension=uBlock0@raymondhill.net.xpi browser/components/kyberfox/test/browser/`.

### Test results

xpcshell, `./mach xpcshell-test browser/components/kyberfox/test/xpcshell/`:
`test_cfg_is_loaded` (the `local-settings.js` filename),
`test_display_version_has_build_counter` and the policies file check pass.
`test_shipped_policies` then crashed, on the artifact build and on the first
full-build run of `front-end-tests.yml` alike, with
`Mozilla crash reason: Missing chrome or resource URLs: resource:///modules/policies/schema.sys.mjs`.
The cause: the harness reads the app dir from the key `<appname>-appdir`, and
the appname is `kyberfox` (`kyber fox` on the artifact build), so
`firefox-appdir` was ignored and `resource:///` pointed at `dist/bin` instead
of `dist/bin/browser`. `xpcshell.toml` now also sets `kyberfox-appdir`; for a
local artifact run add `"kyber fox-appdir" = "browser"` to the assembled copy.
The test reads the Remote Settings allow lists and `extensions.enabledScopes`
from the shipped `kyberfox.cfg`, because the search configuration dump is
served only for allowed collections. Autoconfig does not run under xpcshell, so everything
`kyberfox.cfg` sets is checked in `browser_defaults.js` instead.

Browser tests, whole directory, `--exclude-extension=uBlock0@raymondhill.net.xpi`:
`Passed: 56  Failed: 5`. `browser_defaults.js` (21/21), `browser_workspaces.js`
(34/36, 0 unexpected) and `browser_ublock_bundled.js` pass. The 5 failures are
all `browser_identity.js`. Three (application name, vendor, binary name) fail
because the artifact build runs Mozilla's binary; they need a full build. The
other two were the profile root checks, which no mochitest run can pass:
mozrunner sets `MOZ_APP_DATA` and `MOZ_LOCAL_APP_DATA`
(`testing/mozbase/mozrunner/mozrunner/base/browser.py`), and
`nsXREDirProvider::GetUserDataDirectory` returns those before any XDG logic,
so the harness sees a temporary `*.moz-appdata` folder. `test_profile_root`
now records a todo when `MOZ_APP_DATA` is set, and `smoke-arch.yml` checks the
XDG profile and cache folders by starting the installed package with a fresh
`HOME`.

Earlier findings on the mochitest harness:

mochitest, `./mach mochitest --app obj-artifact/dist/bin/firefox
browser/components/kyberfox/test/browser/browser_identity.js`:

- Without `--app`: `Binary expected at .../obj-artifact/dist/bin/kyber fox does not exist.`
- With `--disable-updater` in the mozconfig: browser crashes at startup,
  `Mozilla crash reason: Missing chrome or resource URLs: resource://gre/modules/UpdateServiceStub.sys.mjs`
  (SIGSEGV; 2 minutes until the harness gave up). Fixed by removing the flag.
- With the flag removed: the browser starts and the test page loads, then the
  harness kills it: `FATAL ERROR: Non-local network connections are disabled and a connection attempt to pgl.yoyo.org (...) was made.`
  `pgl.yoyo.org` is one of uBlock Origin's default filter lists, so the bundled
  uBlock fetches lists during the run. Result: `Ran 0 checks`, exit code 1. The
  test did not execute.
