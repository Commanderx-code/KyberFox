# Build gate

Results of the full-build gate are recorded here by the Linux build workflow
work. This file also holds the local development loop below.

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
4. `overlay/` copied over the tree.
5. `tools.assemble._finish_tree` (settings, staged uBlock XPI, removed paths,
   Glean ping pref, Cargo checksums, static pref order, display version).

The script took about one second. Result: 161 entries in
`git -C work/dev status --short`, and `browser/branding/kyberfox/` is present.
A refactor of `assemble()` that accepts an existing tree would replace the
script; it is not needed for this loop.

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

### Test results

xpcshell, `./mach xpcshell-test browser/components/kyberfox/test/xpcshell/`:
FAIL, 0 passed, 1 failed (2.7 s).

```
PASS test_cfg_is_loaded - [test_cfg_is_loaded : 48] local-settings.js names the autoconfig file - "kyberfox.cfg" == "kyberfox.cfg"
FAIL test_cfg_is_loaded - [test_cfg_is_loaded : 53] kyberfox.cfg was read - "" != ""
```

The autoconfig pref is set, but `kyberfox.cfg` is not evaluated under the
xpcshell harness (and the autoconfig reader, `nsReadConfig.cpp`, is a patched
C++ file). Whether the test can pass in this environment is open.

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
