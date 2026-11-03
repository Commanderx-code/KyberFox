# Arch Linux packaging

`PKGBUILD` packages the prebuilt Linux tarball (release workflow output) into
`/opt/kyberfox`, with `/usr/bin/kyberfox`, a desktop file, hicolor icons and the
MPL-2.0 license text. `publish-repo.sh` signs a built package and adds it to the
pacman repo directory. See `docs/arch-repo.md` for the signing key and hosting
steps.

## User repo definition

Add to `/etc/pacman.conf`:

```
[kyberfox]
SigLevel = Required DatabaseOptional
Server = https://commanderx-code.github.io/KyberFox/arch/$arch
```

Then import the project key (`kyberfox-signing.pub`, added at release time):

```
sudo pacman-key --add kyberfox-signing.pub
sudo pacman-key --lsign-key <fingerprint>
sudo pacman -Sy kyberfox
```

## Local build

Copy the tarball next to the `PKGBUILD` as
`kyberfox-<pkgver>-<pkgrel>.linux-x86_64.tar.xz` and run
`makepkg --skipchecksums`. `pkgver` and `pkgrel` must match `pins.toml`
(`tests/test_arch_packaging.py` checks this).
