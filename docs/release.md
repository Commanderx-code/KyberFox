# Releasing Kyber Fox

A release is one workflow run, `.github/workflows/release.yml`, plus one approval click. It builds Windows and Linux, runs every gate, signs the Windows update, creates the GitHub Release, and updates the update manifests and the pacman repository.

## Cut a release

1. In `pins.toml`, set `[firefox] version` and `[kyber] build`. Raise `build` for every release of the same Firefox version. Keep `packaging/arch/PKGBUILD` (`pkgver`, `pkgrel`) in step; a test checks it. Merge to `main`.
2. Start the run from the Actions tab (Release, Run workflow) or:

   ```
   gh workflow run release.yml -f version=159.0 -f channel=release
   ```

   `version` must equal `pins.toml`. The run fails in seconds if it does not, or if the tag `v<version>-<build>` already exists.
3. Wait for build and verify (about an hour with warm caches; the front-end tests are the long pole). The `publish` job then pauses at "Review deployments".
4. Approve it. The release is live when the run ends.

| Input | Meaning |
|---|---|
| `version` | Firefox version, must match `pins.toml`. |
| `channel` | `release` (default) or `test`. It only selects the Pages path of the manifest (below). |
| `set-disabled-skin` | Comma-separated skin ids to ship disabled. Empty ships the committed `themes/status.json`; otherwise the input replaces its list. |
| `dry-run` | Publish a `test` manifest and a pre-release; leave the release manifest and the pacman repo alone. |
| `update-from-run-id` | Run id of the previous Release run (or any run that uploaded `kyberfox-windows-x86_64` for the older version). When set, the signed update is applied to that install after publishing. Artifacts expire after the repository's retention period (90 days by default), so an older run cannot be used. The first release has none; leave it empty. |

## What each job does

- **prepare**: checks the version against `pins.toml`, checks the tag is free, and validates the skin ids (`tools/set_disabled_skins.py`). It uploads the `themes/status.json` the release ships.
- **build-linux**, **build-windows**: the existing Build Linux and Build Windows workflows, called with `disabled-skins` and the `KYBERFOX_SAFEBROWSING_KEY` secret. Each writes `themes/status.json` into its checkout before assembling (nothing is committed). Build Linux ends with the Arch smoke; Build Windows ends with the Windows smoke and the update smoke `refuse` job, and compares the update certificates in the assembled tree with the committed ones.
- **front-end-tests**, **smoke-windows**, **smoke-arch**: the front-end test build and the two smokes, called again against the artifacts of this run.
- **verify**: assembles the release tree (with the shipped `status.json`), runs `check-forbidden`, and runs the `tests/` suite. `release.yml` does not call the update smoke `refuse` job a second time; the one inside Build Windows is the gate. `apply-update` calls `smoke-update.yml` with `skip-refuse: true` for the same reason.
- **publish**: needs `verify` and the owner's approval, and is the only job that reads the signing secrets. In order:
  1. refuses a placeholder update certificate (`docs/update-signing.md`);
  2. reads the build id from the MAR, signs the MAR with `MAR_SIGNING_KEY` (`tools/sign_mar.py`, verified against the committed primary certificate), and uploads it as the artifact `kyberfox-windows-signed-mar`;
  3. builds the Arch package in an `archlinux` container from the Linux tarball (renamed to the PKGBUILD's source name, checksum filled by `updpkgsums`);
  4. tags the release (a commit with the shipped `themes/status.json`, only when it differs from the dispatched commit) and creates the GitHub Release with the installer, tarball, signed MAR, package and `SHA256SUMS`;
  5. writes the manifest to `gh-pages` under `update/<channel>/WINNT_x86_64-msvc-x64/` and `.../WINNT_x86_64-msvc-aarch64/` (the updater reports the CPU it runs on, so x64 builds under Arm emulation need the second path);
  6. signs the package and updates the pacman repo in `arch/x86_64/` on `gh-pages` (release channel, not a dry run).

  The order matters: the Release assets exist before the manifest names them.
- **apply-update**: runs after publish when `update-from-run-id` is set. It installs the older build and applies the signed MAR (`smoke-update.yml`, `apply`).

## Channels and the dry run

Shipped browsers always ask for `update/release/...` (`%CHANNEL%` is fixed by the build) and every MAR carries the channel id `kyberfox-release`. The `channel` input only chooses where the manifest is written: `test` writes `update/test/WINNT_x86_64-msvc-x64/update.xml`, which no shipped browser reads. Do not stamp another channel id on a test MAR; the apply smoke would reject it.

A dry run publishes to `update/test/...`, creates the pre-release `v<version>-<build>-test`, and signs the package into a scratch repo to prove the key works. It never writes `update/release/...` or `arch/`. The test tag has a `-test` suffix, so it never collides with the real tag; delete the pre-release and tag afterwards if you want a clean list.

```
gh workflow run release.yml -f version=159.0 -f channel=test -f dry-run=true
```

The dry run cannot pass while the placeholder update certificates are committed: publish stops at its first step.

## Disable a skin for a security release

If a skin is broken, ship the release with it disabled instead of waiting for a fix:

```
gh workflow run release.yml -f version=159.0 -f channel=release -f set-disabled-skin=gx
```

The builds ship `themes/status.json` with `{"disabled": ["gx"]}`, so the browser falls back to Ember for that skin (`docs/themes.md`). The release tag points at a commit carrying that file. The list replaces the committed one, so name every skin that must stay off. Fix `main` afterwards.

## Recovering from a failed publish

Publish can fail partway (a bad secret, a push race). Re-running the failed job from the Actions page is safe: the tag step keeps a tag that is already on the remote, and the Release step uploads the assets again with `--clobber` when the Release exists. A new dispatch fails in `prepare` while the tag exists. To start over:

1. Delete the Release and its tag: `gh release delete <tag> --cleanup-tag --yes` (for example `v159.0-1-test`).
2. If the manifest or pacman commit reached `gh-pages`, revert it: clone `gh-pages`, `git revert <commit>` (the commits are named "Update manifest for ..." and "Pacman repo: ..."), push.
3. Dispatch the workflow again.

## Updating the Arch image

`release.yml` runs `makepkg` and the signing steps in `archlinux:base-devel`, pinned by digest in `ARCH_IMAGE` because the signing steps hand that image the pacman key. To update it, look up the digest of the tag (`docker pull archlinux:base-devel`, then `docker inspect --format '{{index .RepoDigests 0}}' archlinux:base-devel`), put it in `ARCH_IMAGE` and update the date in the comment above it.

## Roll back

- **Windows**: publish the previous manifest again. On `gh-pages`, revert the commit "Update manifest for v...", or write the old release's manifest with `python -m tools.update_manifest` (its `--mar` is the signed MAR attached to the old Release), for both `WINNT_x86_64-msvc-x64` and `...-aarch64`. To stop updates entirely, write `python -m tools.update_manifest --empty --out update.xml`. Browsers that already updated do not go back; ship a new build number with the fix.
- **Arch**: the repo keeps the newest two packages and its database lists the newest. Users downgrade with `sudo pacman -U` on the previous package (from `arch/x86_64/` while it is kept, or from the old GitHub Release). To roll the repo back, remove the new package from `arch/x86_64/` on `gh-pages` and re-run `repo-add` for the old one, or publish a new build number with the fix. `publish-repo.sh` refuses to add a version older than the two newest.

## Owner setup

Done once, in the GitHub repository settings. Nothing here is in the repository.

1. **Environment**: Settings, Environments, New environment, named `release`.
   - Required reviewers: the owner.
   - Deployment branches: selected branches, `main` and `build-gate` (the latter only while workflows run from it).
   - Secrets (Environment secrets):
     - `MAR_SIGNING_KEY`: the primary update-signing private key, PEM. From the private keys folder: `gh secret set MAR_SIGNING_KEY --env release < release_primary.key` (`docs/update-signing.md`, Owner steps).
     - `PACMAN_GPG_KEY`: the armored private repo key, with no passphrase.
     - `PACMAN_GPG_KEY_ID`: its fingerprint. Steps in `docs/arch-repo.md`.
2. **Safe Browsing key**: obtain a Google Safe Browsing API key (Google Cloud console, a project with the Safe Browsing API enabled, an API key restricted to that API), then save it as a repository secret, not an environment secret, so the push-triggered build-gate runs get it too: `gh secret set KYBERFOX_SAFEBROWSING_KEY`. Both build workflows write it to a file in `$RUNNER_TEMP` and pass it to the build through `KYBERFOX_SAFEBROWSING_KEYFILE`; without it they print a warning and the build ships without Safe Browsing lists.
3. **Real update certificates**: replace the two placeholder `.der` files and rebuild, as in `docs/update-signing.md`. Publish refuses placeholders.
4. **Pacman public key**: commit `packaging/arch/kyberfox-signing.pub` (`docs/arch-repo.md`).
5. **Pages**: enable GitHub Pages from the `gh-pages` branch, root folder. The first publish creates the branch.
6. **Dry run**: `gh workflow run release.yml -f version=159.0 -f channel=test -f dry-run=true`. Expect the run to stop at the approval; after you approve, check the pre-release `v159.0-1-test` and `update/test/WINNT_x86_64-msvc-x64/update.xml` on Pages. `workflow_dispatch` works only once `release.yml` is on `main`.
