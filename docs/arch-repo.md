# Arch repository

Kyber Fox updates on Arch Linux come only through pacman (the updater is
disabled in the build). The repo is a static directory, `arch/x86_64/`, on the
`gh-pages` branch, served by GitHub Pages and signed with a project key.

## Owner steps (one time)

1. Generate a signing key with no expiry and **no passphrase**:
   `gpg --batch --passphrase '' --quick-generate-key "Kyber Fox Arch repo" ed25519 sign never`
   (or `rsa4096`). The publish job signs unattended through `gpg --use-agent`
   with no loopback pinentry, so a key with a passphrase makes signing fail.
   The key is safe because it lives only in the `release` environment secret,
   which needs the owner's approval to read.
2. Export the public key to `packaging/arch/kyberfox-signing.pub`:
   `gpg --export --armor <fingerprint> > packaging/arch/kyberfox-signing.pub`.
3. Store the private key in `~/github/projects/kyber-fox-private/keys/`:
   `gpg --export-secret-keys --armor <fingerprint>`. Never commit it.
4. In the GitHub repository settings, create (or open) the `release`
   environment and add two secrets: `PACMAN_GPG_KEY` (the armored private key)
   and `PACMAN_GPG_KEY_ID` (the fingerprint).
5. Enable GitHub Pages from the `gh-pages` branch, root folder.

## Release flow

The release workflow imports `PACMAN_GPG_KEY`, builds the package with
`makepkg` (the Linux tarball is renamed to the PKGBUILD's source name and
`updpkgsums` fills its checksum first), runs

```
KYBERFOX_PACMAN_KEY_ID=<fingerprint> packaging/arch/publish-repo.sh \
  kyberfox-<ver>-<pkgrel>-x86_64.pkg.tar.zst gh-pages/arch/x86_64
```

and commits the result to `gh-pages`. A real name is
`kyberfox-159.0-1-x86_64.pkg.tar.zst`. The script signs the package, updates the
signed database, keeps the newest two package versions and never commits or
pushes. It refuses, before changing anything, to add a version older than the
two newest already in the directory, because the prune would delete the file
the database points at. It replaces the database symlinks with copies because GitHub Pages does
not serve symlinks.

## User setup

See `packaging/arch/README.md` for the `[kyberfox]` section and the
`pacman-key` commands.

## Smoke test

`.github/workflows/smoke-arch.yml` builds the package from a Build Linux
artifact in an `archlinux` container, installs it from an unsigned local repo
and checks `kyberfox --version`. Signing is exercised only by the release flow.
