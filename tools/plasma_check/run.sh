#!/bin/bash
# Runs the KDE Plasma desktop checks from docs/testing.md in virtual KWin
# sessions, so nothing opens on the real desktop. Each run starts Kyber Fox
# with a new profile and records the window protocol, scale, app ID,
# clipboard both ways and the taskbar icons of a normal and a private window;
# the first session also checks a notification and the file picker.
#
# Usage: tools/plasma_check/run.sh OUT_DIR [KYBERFOX_BINARY]
# Needs kwin_wayland, kscreen-doctor, plasmawindowed, spectacle, wl-clipboard, qdbus6,
# dbus-monitor, xdg-desktop-portal-kde, python3 with PyGObject, and the
# work/dev checkout (its mach python provides the Marionette client).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
out=$(mkdir -p "$1" && cd "$1" && pwd)
app=${2:-/opt/kyberfox/kyberfox}
mach=${MACH:-$repo/work/dev/mach}
mkdir -p "$out/config" "$out/cache" "$out/data"
# KWin saves output scales in XDG_CONFIG_HOME/kwinoutputconfig.json, so every
# directory a session writes points into OUT_DIR, not the real desktop's config.

n=0
# run TAG SCALE WAYLAND FULL
run() {
  n=$((n + 1))
  env -u DBUS_SESSION_BUS_ADDRESS -u GTK_USE_PORTAL -u WAYLAND_DISPLAY -u DISPLAY \
    XDG_CONFIG_HOME="$out/config" XDG_CACHE_HOME="$out/cache" XDG_DATA_HOME="$out/data" \
    MOZ_ENABLE_WAYLAND="$3" PLASMA_CHECK_TAG="$1" PLASMA_CHECK_SCALE="$2" \
    PLASMA_CHECK_FULL="$4" PLASMA_CHECK_APP="$app" PLASMA_CHECK_OUT="$out" \
    PLASMA_CHECK_MACH="$mach" PLASMA_CHECK_DIR="$here" \
    timeout 180 dbus-run-session kwin_wayland --virtual --no-lockscreen --xwayland \
      --width 1600 --height 1000 --socket "kfplasma$$-$n" \
      --exit-with-session "$here/session.sh" > "$out/$1-kwin.log" 2>&1 || true
  echo "== $1"
  cat "$out/$1.log"
}

rm -f "$out/config/kwinoutputconfig.json"
run wayland-100 1 1 1
run wayland-125 1.25 1 0
run wayland-150 1.5 1 0
run xwayland-100 1 0 0
run xwayland-150 1.5 0 0
echo "== notifications"
cat "$out/wayland-100-notify.log"
echo "Screenshots: $out/*.png"
