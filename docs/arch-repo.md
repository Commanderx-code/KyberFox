# Arch repository

Kyber Fox updates on Arch Linux come only through pacman (the updater is
disabled in the build). The repo is the set of assets of one GitHub Release,
tagged `arch-repo`, signed with a project key. pacman reads it from
`https://github.com/Commanderx-code/KyberFox/releases/download/arch-repo`.
It is not on the `gh-pages` branch: the package is over git's 100 MB file
limit, and a push with it is refused. Release assets can be up to 2 GB and do
not count against the Pages bandwidth.

## Owner steps (one time)

1. Generate a signing key with no expiry and **no passphrase**:
   `gpg --batch --passphrase '' --quick-generate-key "Kyber Fox Arch repo" ed25519 sign never`
   (or `rsa4096`). The publish job signs unattended through `gpg --use-agent`
   with no loopback pinentry, so a key with a passphrase makes signing fail.
   Keep the key in `~/github/projects/kyber-fox-private/keys/` (step 3); a copy
   lives in the `release` environment secret, which needs the owner's approval
   to read.
2. Export the public key to `packaging/arch/kyberfox-signing.pub`:
   `gpg --export --armor <fingerprint> > packaging/arch/kyberfox-signing.pub`.
3. Store the private key in `~/github/projects/kyber-fox-private/keys/`:
   `gpg --export-secret-keys --armor <fingerprint>`. Never commit it.
4. In the GitHub repository settings, create (or open) the `release`
   environment and add two secrets: `PACMAN_GPG_KEY` (the armored private key)
   and `PACMAN_GPG_KEY_ID` (the fingerprint).

The first publish creates the `arch-repo` Release (a pre-release, so it is
never shown as the latest release).

## Release flow

The release workflow imports `PACMAN_GPG_KEY`, builds the package with
`makepkg` (the Linux tarball is renamed to the PKGBUILD's source name and
`updpkgsums` fills its checksum first), then runs

```
packaging/arch/publish-to-release.sh kyberfox-<ver>-<pkgrel>-x86_64.pkg.tar.zst <work dir>
```

A real name is `kyberfox-159.0-1-x86_64.pkg.tar.zst`. The script:

1. creates the `arch-repo` Release if it is missing and downloads its assets;
2. runs `sign-and-publish.sh` in the pinned `archlinux` container, which
   imports the key and runs `publish-repo.sh`: it signs the package, updates
   the signed database and keeps the newest two package versions. It refuses,
   before changing anything, to add a version older than the two newest,
   because the prune would delete the file the database points at. It
   replaces the database symlinks with copies, because a Release asset cannot
   be a symlink;
3. uploads the packages, then the database, then deletes the assets of the
   pruned version, so the published database never names a missing package.

To publish the package of an existing release again (for example after that
step failed), run `gh workflow run publish-arch.yml -f tag=v159.0-1`. It
checks the package against the release's `SHA256SUMS`, runs the same script,
and waits for the owner's approval like the release does.

## User setup

See `packaging/arch/README.md` for the `[kyberfox]` section and the
`pacman-key` commands.

## Smoke test

`.github/workflows/smoke-arch.yml` builds the package from a Build Linux
artifact in an `archlinux` container, installs it from an unsigned local repo
and checks `kyberfox --version`. Signing is exercised only by the release flow.
