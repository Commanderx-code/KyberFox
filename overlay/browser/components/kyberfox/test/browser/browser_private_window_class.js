/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// On Linux a private window has its own window class and icon,
// kyberfox-private, so the desktop shows it as a separate app with the
// private logo. Normal windows keep the default class.

const { KyberPrivateWindow } = ChromeUtils.importESModule(
  "resource:///modules/KyberPrivateWindow.sys.mjs"
);

const PREF = "browser.privateWindowSeparation.enabled";

registerCleanupFunction(() => KyberPrivateWindow._resetForTests());

async function rootOf(options) {
  let win = await BrowserTestUtils.openNewBrowserWindow(options);
  let root = win.document.documentElement;
  let attrs = {
    windowclass: root.getAttribute("windowclass"),
    icon: root.getAttribute("icon"),
  };
  await BrowserTestUtils.closeWindow(win);
  return attrs;
}

add_task(async function test_private_window_has_its_own_class() {
  KyberPrivateWindow._setDesktopFileForTests(true);
  Assert.deepEqual(await rootOf({ private: true }), {
    windowclass: "kyberfox-private",
    icon: "kyberfox-private",
  });
  Assert.deepEqual(
    await rootOf({}),
    { windowclass: null, icon: null },
    "a normal window keeps the default class"
  );
});

add_task(async function test_no_class_without_the_desktop_file() {
  KyberPrivateWindow._setDesktopFileForTests(false);
  Assert.deepEqual(
    await rootOf({ private: true }),
    { windowclass: null, icon: null },
    "no class the desktop cannot draw an icon for"
  );
});

add_task(async function test_the_pref_turns_it_off() {
  KyberPrivateWindow._setDesktopFileForTests(true);
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  Assert.deepEqual(await rootOf({ private: true }), {
    windowclass: null,
    icon: null,
  });
  await SpecialPowers.popPrefEnv();
});
