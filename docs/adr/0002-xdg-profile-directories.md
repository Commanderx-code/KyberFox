# Profiles live in XDG directories on Linux

On Linux the profile lives under `~/.config/kyberfox` and the cache under `~/.cache/kyberfox`, through LibreWolf's `xdg-dir.patch`, instead of Firefox's `~/.kyberfox` dotfolder. Moving profiles after friends install would mean a migration, so this is decided before the first release. On Windows the profile stays in `%APPDATA%`.
