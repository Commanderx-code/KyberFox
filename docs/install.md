# Install Kyber Fox

Release 1 runs on Windows (x86_64) and on Linux. Garuda and other Arch-based
systems install it from a pacman repository. Sync is not in this release.

Downloads are on the project's
[Releases page](https://github.com/Commanderx-code/KyberFox/releases). A
version reads like `159.0-1`: Firefox 159.0, Kyber Fox build 1.

## Windows

1. From the latest release, download `kyberfox-<version>.installer.exe`.
2. Run it. The installer is not code-signed yet, so Windows SmartScreen shows
   "Windows protected your PC". Click **More info**, then **Run anyway**. Check
   the file name first, and check the download against `SHA256SUMS` on the same
   release if you like.
3. Follow the installer. It installs for your user only, into
   `%LOCALAPPDATA%\Kyber Fox`, so it needs no administrator rights.

Updates arrive automatically. The browser checks for a new version in the
background, downloads it, and applies it when you restart. Every update is
signed, and the browser refuses one that is not.

## Garuda and Arch Linux

Kyber Fox updates through pacman only; the browser's own updater is turned off.

1. Add the repository to `/etc/pacman.conf`:

   ```
   [kyberfox]
   SigLevel = Required DatabaseOptional
   Server = https://commanderx-code.github.io/KyberFox/arch/$arch
   ```

2. Download the project's public signing key,
   `packaging/arch/kyberfox-signing.pub`, from the repository, and import it:

   ```
   sudo pacman-key --add kyberfox-signing.pub
   gpg --show-keys kyberfox-signing.pub
   sudo pacman-key --lsign-key <fingerprint>
   ```

   Use the fingerprint that `gpg --show-keys` prints for the key you just
   downloaded.

3. Install it:

   ```
   sudo pacman -Syu kyberfox
   ```

Later versions arrive with your normal system update. The signing key and how
the repository is built are described in [arch-repo.md](arch-repo.md).

## Other Linux

Each release also has a tarball. Unpack it anywhere and run `kyberfox`. There
is no automatic update for the tarball.

## First run

The first window is a welcome page. Pick a default search engine and tick any
add-ons you want from the recommended list; nothing is selected for you, and
nothing is downloaded until you choose **Install selected**. Add-ons come from
addons.mozilla.org. You can skip the page and find it again later under Privacy
& Security in Settings. uBlock Origin is already included.

## Settings

- **Privacy:** Settings, Privacy & Security. The Kyber Fox privacy preset at
  the top switches between Standard and Strict. Changing any option under it
  turns the preset into Custom. Strict resists fingerprinting and turns off
  WebGL, which can break some sites.
- **Themes:** Settings, Appearance. Click a theme to apply it. You can also
  import your own CSS file there.
- **Shield:** the shield button in the toolbar sets the protections for the
  current site.
- **Workspaces:** the dropdown at the left of the tab bar.

## If a theme breaks the window

Press Ctrl+Shift+Alt+T in any browser window. It removes imported CSS and
switches back to the Ember theme. Starting in safe mode also leaves the theme
engine off. See [themes.md](themes.md).

## Not in this release

Sync of bookmarks and browser data, phone apps and macOS builds. See the
[README](../README.md).
