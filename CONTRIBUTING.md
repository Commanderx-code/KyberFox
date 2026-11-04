# Contributing

Kyber Fox is maintained by one person, for themselves and close friends, and is
in alpha. Issues and pull requests are welcome, but there is no promise of a
quick review.

## Before you start

- Read [README.md](README.md), [ROADMAP.md](ROADMAP.md) and
  [docs/architecture.md](docs/architecture.md).
- Report security problems privately, as described in [SECURITY.md](SECURITY.md).
- For anything larger than a fix, open an issue first, so the work fits the
  roadmap.

## How the code is organized

Kyber Fox is not a copy of the Firefox tree. The repository holds the pieces
that turn a pinned Firefox source tarball into Kyber Fox:

| Path | What it is |
|---|---|
| `pins.toml` | Pinned Firefox, LibreWolf and uBlock Origin versions and hashes |
| `patches/librewolf-keep.txt`, `patches/librewolf-drop.txt` | Which LibreWolf patches are applied, and why the others are not |
| `patches/kyber/` | Kyber Fox's own patches, applied in the order of `series.txt` |
| `overlay/` | Files copied into the Firefox tree at the same paths, including the Kyber Fox component and its tests |
| `settings/` | `kyberfox.cfg` (prefs) and `policies.json` (enterprise policies) |
| `themes/` | Palettes, the shared theme stylesheet and the vendored skins |
| `branding/` | The logo sources (from PR #12) |
| `tools/` | Python and shell tools: assembly, checks, signing, upstream watch |
| `tests/` | Python tests for the tools and settings |
| `packaging/arch/` | The PKGBUILD and the pacman repository scripts |
| `.github/workflows/` | Builds, tests, smoke tests, release and upstream watch |

## Making a change

1. Prefer the lightest tool: a pref in `settings/kyberfox.cfg`, a policy, or a
   file in `overlay/`. Write a patch only when Firefox code itself must change,
   and keep it to one purpose. Every patch has to be repaired when Firefox
   changes the code around it.
2. Run the Python tests: `.venv/bin/python -m pytest tests -q`. They also run
   on every pull request.
3. For browser changes, add or update a test under
   `overlay/browser/components/kyberfox/test/`, and check the change on an
   artifact build as in [docs/build-gate.md](docs/build-gate.md). Do not run a
   full Firefox build unless you have the machine for it; CI does full builds.
4. Lint workflow changes with `actionlint`, and shell scripts with
   `shellcheck`.

## Rules

- Use US English in code, the interface and the docs.
- Don't add telemetry, remote content, sponsored content or AI features. The
  forbidden-code check fails the release if they appear.
- Don't weaken security to make something work: no turning off the sandbox,
  certificate checks or site isolation.
- Only add code or assets under a license that allows it, and record where
  third-party material came from in `themes/NOTICES.md` or the relevant notice
  file.
- Don't use Firefox, Mozilla or other browsers' names and logos as branding.
- Commit messages are plain: what changed and why.
