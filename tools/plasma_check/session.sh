#!/bin/bash
# The program of one virtual KWin session; started by run.sh.
set -u
out=$PLASMA_CHECK_OUT
tag=$PLASMA_CHECK_TAG
export XDG_CURRENT_DESKTOP=KDE XDG_SESSION_TYPE=wayland
# D-Bus starts the portal backends; without the display they cannot open a window.
dbus-update-activation-environment WAYLAND_DISPLAY DISPLAY XDG_CURRENT_DESKTOP \
  XDG_SESSION_TYPE XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME

if [ "$PLASMA_CHECK_SCALE" != current ]; then
  output=$(kscreen-doctor -j | python3 -c "import json, sys; print(json.load(sys.stdin)['outputs'][0]['name'])")
  kscreen-doctor "output.$output.scale.$PLASMA_CHECK_SCALE" > /dev/null 2>&1
  sleep 2
fi
if [ "$PLASMA_CHECK_FULL" = 1 ]; then
  dbus-monitor --session "interface='org.freedesktop.portal.FileChooser'" > "$out/$tag-dbus.log" 2>&1 &
  python3 "$PLASMA_CHECK_DIR/notify_server.py" "$out/$tag-notify.log" &
  sleep 2
fi
"$PLASMA_CHECK_MACH" python "$PLASMA_CHECK_DIR/drive.py" > "$out/$tag.log" 2>&1
