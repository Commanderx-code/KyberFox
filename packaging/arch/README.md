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
Server = https://github.com/Commanderx-code/KyberFox/releases/download/arch-repo
```

Then download the project key (`kyberfox-signing.pub` in this folder) and check it. `gpg --show-keys` must print the fingerprint `83A5C867BD3096DE6A8B5D615502539280228E76`; if it prints anything else, stop:

```
curl -fLO https://raw.githubusercontent.com/Commanderx-code/KyberFox/main/packaging/arch/kyberfox-signing.pub
gpg --show-keys kyberfox-signing.pub
```

Import it from the same folder, and install:

```
sudo pacman-key --add kyberfox-signing.pub
sudo pacman-key --lsign-key 83A5C867BD3096DE6A8B5D615502539280228E76
sudo pacman -Syu kyberfox
```

## Local build

Copy the tarball next to the `PKGBUILD` as
`kyberfox-<pkgver>-<pkgrel>.linux-x86_64.tar.xz` and run
`makepkg --skipchecksums`. `pkgver` and `pkgrel` must match `pins.toml`
(`tests/test_arch_packaging.py` checks this).
