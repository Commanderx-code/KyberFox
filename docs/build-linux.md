# Building on Linux

There are three ways to build Kyber Fox, and they differ a lot in cost. Each
section says whether it has been verified, and where.

| Way | What you get | Verified |
|---|---|---|
| CI release build | The real Linux tarball and pacman package | Yes, on GitHub Actions, every release |
| Artifact build | A runnable Kyber Fox with Mozilla's prebuilt compiled parts and Kyber Fox's front end, for testing UI changes | Yes, on the owner's laptop |
| Full local build | The same as CI, on your own machine | No; not run on the owner's laptop on purpose |

## 1. CI release build (the one that ships)

`.github/workflows/build-linux.yml` assembles the tree from `pins.toml` and
builds it on a free `ubuntu-latest` runner. Measured on 2026-11-03 (cold
cache, commit `3c99103`, run 41575126157), recorded in
[build-gate.md](build-gate.md):

| Measure | Value |
|---|---|
| Runner | 4 cores, 15 GB RAM, 145 GB disk |
| Build step | 94.5 min |
| Whole job | 99.8 min |
| Peak disk | 59.6 GB |
| Output | `kyberfox-linux-x86_64`, 91.9 MB |

The build needs `--disable-debug-symbols` and a 12 GB swapfile on that runner;
without them it ran out of memory. Releases build without PGO or LTO, so
Kyber Fox is somewhat slower than official Firefox. The mozconfig is
`mozconfigs/linux`.

To start one: push to a branch the workflow runs on, or start it from the
Actions tab.

## 2. Artifact build (for front-end work)

An artifact build downloads Mozilla's prebuilt compiled libraries for the
matching Firefox revision and builds only the front end (JavaScript, CSS,
XHTML, prefs) from the Kyber Fox tree. It runs Kyber Fox's browser tests and is
how UI changes are checked before a pull request. The full procedure is in
[build-gate.md](build-gate.md#local-dev-loop); in short:

1. Shallow-clone the matching Firefox release tag into `work/dev`:
   `git clone --depth 1 --branch FIREFOX_159_0_RELEASE https://github.com/mozilla-firefox/firefox work/dev`
2. Apply the Kyber Fox assembly to it (LibreWolf patches, Kyber Fox patches,
   overlay, settings), as described in build-gate.md.
3. Use a mozconfig with `ac_add_options --enable-artifact-builds`,
   `--enable-application=browser` and `--with-branding=browser/branding/kyberfox`,
   and an object directory such as `obj-artifact`.
4. Build: `MOZCONFIG=$PWD/mozconfig-artifact ./mach build`. After that, front-end
   changes need only `./mach build faster`.
5. Run it with a throwaway profile:
   `obj-artifact/dist/bin/firefox -profile "$(mktemp -d)" -no-remote`.

Measured on the owner's laptop (16 threads, 62 GB RAM, Arch-based Garuda):

| Measure | Value |
|---|---|
| `work/dev` checkout with the object directory | 6.8 GB |
| Object directory alone | 831 MB |
| `~/.mozbuild` (toolchains and caches from `mach bootstrap`) | 3.6 GB |
| `./mach build faster` after a front-end change | about 7 s |

The artifact build's version matches the Firefox revision of the checkout, not
a Kyber Fox release, and it is never distributed.

## 3. Full local build (not verified)

A full build compiles everything, as CI does. It has not been run on the
owner's laptop: the CI build already proves the release, and a full local
build costs hours and tens of gigabytes. If you try it:

1. Assemble the tree: `make assemble`, which downloads the pinned Firefox
   tarball (about 780 MB) and writes `work/tree`.
2. Install the build dependencies with `./mach bootstrap` inside the tree.
   This installs packages system-wide through your package manager and a
   toolchain under `~/.mozbuild`; read what it proposes before agreeing.
3. Build and package from the repository root: `make build`, then
   `make package`. The Makefile points `MOZCONFIG` at `mozconfigs/linux`.
   Without a Safe Browsing key (`KYBERFOX_SAFEBROWSING_KEYFILE`, see
   `.env.example`) the build still works, but malware and phishing protection
   has no key.

Mozilla's [Building Firefox on Linux](https://firefox-source-docs.mozilla.org/setup/linux_build.html)
page asks for "4GB RAM minimum, 8GB+ recommended" and "At least 30GB of free
disk space" (read 2026-11-04), and gives no compile time. Kyber Fox's CI build
needed more than that: 59.6 GB of disk at its peak, and 15 GB of RAM plus a
12 GB swapfile on 4 cores. Plan for the CI figures. That page describes a git
checkout; Kyber Fox builds from the source tarball instead, as LibreWolf does,
and Mozilla's page does not cover that path.

## Profiles

Every way above runs Kyber Fox with its own profile directory, never your
Firefox profile. An installed Kyber Fox uses `~/.config/kyberfox`
([ADR 0002](adr/0002-xdg-profile-directories.md)). For testing, pass
`-profile <empty directory>` so nothing touches your everyday profile.
