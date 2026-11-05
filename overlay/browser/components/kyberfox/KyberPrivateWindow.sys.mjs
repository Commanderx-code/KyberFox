/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Private windows on Linux get their own window class (the Wayland app ID
 * and the X11 WM_CLASS), kyberfox-private. The desktop then groups them apart
 * from normal windows and shows the private logo that
 * kyberfox-private.desktop names. Without that desktop file the desktop has
 * no icon for the class, so the window keeps the default one.
 *
 * browser.privateWindowSeparation.enabled, Firefox's switch for the same
 * thing on the Windows taskbar, turns it off.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { FileUtils } from "resource://gre/modules/FileUtils.sys.mjs";
import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";

const WINDOW_CLASS = "kyberfox-private";
const DESKTOP_FILE = `${WINDOW_CLASS}.desktop`;
const PREF = "browser.privateWindowSeparation.enabled";

/** @type {boolean|undefined} whether the desktop file is installed */
let gInstalled;

/** The XDG data directories, most important first. */
function dataDirs() {
  let home = Services.env.get("XDG_DATA_HOME");
  if (!home) {
    let user = Services.env.get("HOME");
    home = user ? `${user}/.local/share` : "";
  }
  let dirs = Services.env.get("XDG_DATA_DIRS") || "/usr/local/share:/usr/share";
  return [home, ...dirs.split(":")].filter(d => d.startsWith("/"));
}

function findDesktopFile() {
  return dataDirs().some(dir => {
    try {
      return new FileUtils.File(`${dir}/applications/${DESKTOP_FILE}`).exists();
    } catch (e) {
      return false;
    }
  });
}

export const KyberPrivateWindow = {
  WINDOW_CLASS,

  /** Whether kyberfox-private.desktop is in an XDG data directory. */
  desktopFileInstalled() {
    if (gInstalled === undefined) {
      gInstalled = findDesktopFile();
    }
    return gInstalled;
  },

  /**
   * Gives a private browser window its own class and icon. Called before the
   * window's first layout, when the window reads these attributes.
   *
   * @param {Window} win
   */
  setup(win) {
    if (
      AppConstants.platform != "linux" ||
      !PrivateBrowsingUtils.isWindowPrivate(win) ||
      !Services.prefs.getBoolPref(PREF, true) ||
      !this.desktopFileInstalled()
    ) {
      return;
    }
    let root = win.document.documentElement;
    root.setAttribute("windowclass", WINDOW_CLASS);
    root.setAttribute("icon", WINDOW_CLASS);
  },

  /** @param {boolean} installed */
  _setDesktopFileForTests(installed) {
    gInstalled = installed;
  },

  _resetForTests() {
    gInstalled = undefined;
  },
};
