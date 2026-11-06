"""Drives Kyber Fox inside one virtual KWin session; started by session.sh."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import time

from marionette_driver.marionette import Marionette

OUT = os.environ["PLASMA_CHECK_OUT"]
TAG = os.environ["PLASMA_CHECK_TAG"]
FULL = os.environ["PLASMA_CHECK_FULL"] == "1"
APP = os.environ["PLASMA_CHECK_APP"]
PORT = 2836


def sh(*args):
    return subprocess.run(list(args), capture_output=True, text=True, timeout=30)


def kwin_windows():
    """(resourceName, resourceClass, desktopFile) of every window KWin's window
    runner finds."""
    found = set()
    for query in ("Kyber", "New Tab", "Save", "Private"):
        reply = sh("dbus-send", "--session", "--print-reply", "--dest=org.kde.KWin",
                   "/WindowsRunner", "org.kde.krunner1.Match", f"string:{query}").stdout
        for uuid in set(re.findall(r"0_(\{[0-9a-f-]+\})", reply)):
            info = sh("qdbus6", "org.kde.KWin", "/KWin", "org.kde.KWin.getWindowInfo", uuid).stdout
            fields = dict(line.split(": ", 1) for line in info.splitlines() if ": " in line)
            found.add((fields.get("resourceName"), fields.get("resourceClass"),
                       fields.get("desktopFile")))
    return sorted(found)


def screenshot(name):
    sh("spectacle", "-b", "-n", "-f", "-o", os.path.join(OUT, f"{name}.png"))


profile = tempfile.mkdtemp(prefix="plasma-check-", dir=OUT)
with open(os.path.join(profile, "user.js"), "w") as f:
    for key, value in {"marionette.port": PORT, "kyberfox.welcome.shown": True,
                       "browser.shell.checkDefaultBrowser": False}.items():
        f.write(f"user_pref({json.dumps(key)}, {json.dumps(value)});\n")
browser = subprocess.Popen(
    [APP, "--marionette", "--no-remote", "--profile", profile],
    env=dict(os.environ, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS="1"),
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    m = Marionette(host="127.0.0.1", port=PORT)
    m.start_session()
    m.set_context("chrome")
    time.sleep(3)
    print("display", m.execute_script("""
      const info = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo);
      return {protocol: info.windowProtocol, devicePixelRatio: window.devicePixelRatio};"""))
    print("windows", kwin_windows())
    screenshot(TAG)

    m.execute_script("""Cc["@mozilla.org/widget/clipboardhelper;1"]
      .getService(Ci.nsIClipboardHelper).copyString(arguments[0]);""", script_args=[f"out-{TAG}"])
    time.sleep(1)
    print("clipboard to desktop", sh("wl-paste", "-n").stdout == f"out-{TAG}")
    subprocess.Popen(["wl-copy", f"in-{TAG}"])
    time.sleep(1)
    pasted = m.execute_script("""
      gURLBar.focus(); gURLBar.value = ""; goDoCommand("cmd_paste"); return gURLBar.value;""")
    print("clipboard from desktop", pasted == f"in-{TAG}")

    # The real task manager applet, with a normal and a private window open:
    # the screenshot shows which icon each window gets in the taskbar.
    m.execute_script("OpenBrowserWindow({private: true});")
    time.sleep(4)
    print("windows with private window", kwin_windows())
    tasks = subprocess.Popen(["plasmawindowed", "org.kde.plasma.icontasks"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(8)
    screenshot(f"{TAG}-taskbar")
    tasks.terminate()

    if FULL:
        m.execute_script("""
          const alert = Cc["@mozilla.org/alert-notification;1"]
            .createInstance(Ci.nsIAlertNotification);
          alert.init("plasma-check", "", "Kyber Fox notification", "plasma-check", false, "");
          Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService).showAlert(alert);""")
        m.execute_script("""
          const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
          picker.init(window.browsingContext, "Save Page As", Ci.nsIFilePicker.modeSave);
          picker.defaultString = "plasma-check.html";
          picker.open(() => {});""")
        time.sleep(8)
        print("windows with file picker", kwin_windows())
        with open(os.path.join(OUT, f"{TAG}-dbus.log")) as log:
            print("file picker through the portal", "member=SaveFile" in log.read())
        screenshot(f"{TAG}-file-picker")
    m.delete_session()
finally:
    browser.terminate()
    browser.wait(20)
    shutil.rmtree(profile, ignore_errors=True)
