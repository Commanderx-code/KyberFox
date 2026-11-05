/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Private windows get their own window class only when the desktop has a
// kyberfox-private.desktop file to give that class its icon.

const { KyberPrivateWindow } = ChromeUtils.importESModule(
  "resource:///modules/KyberPrivateWindow.sys.mjs"
);

const saved = {
  XDG_DATA_HOME: Services.env.get("XDG_DATA_HOME"),
  XDG_DATA_DIRS: Services.env.get("XDG_DATA_DIRS"),
};

registerCleanupFunction(() => {
  for (let [name, value] of Object.entries(saved)) {
    Services.env.set(name, value);
  }
  KyberPrivateWindow._resetForTests();
});

async function dataDir(withDesktopFile) {
  let dir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "kf-private-class"
  );
  registerCleanupFunction(() => IOUtils.remove(dir, { recursive: true }));
  if (withDesktopFile) {
    await IOUtils.writeUTF8(
      PathUtils.join(dir, "applications", "kyberfox-private.desktop"),
      "[Desktop Entry]\nType=Application\n",
      { mode: "create", createAncestors: true }
    );
  }
  return dir;
}

function found(home, dirs) {
  Services.env.set("XDG_DATA_HOME", home);
  Services.env.set("XDG_DATA_DIRS", dirs);
  KyberPrivateWindow._resetForTests();
  return KyberPrivateWindow.desktopFileInstalled();
}

add_task(async function test_finds_the_desktop_file() {
  let empty = await dataDir(false);
  let full = await dataDir(true);
  Assert.ok(found(full, empty), "in XDG_DATA_HOME");
  Assert.ok(found(empty, `${empty}:${full}`), "in a later XDG_DATA_DIRS entry");
  Assert.ok(!found(empty, empty), "not installed");
  Assert.ok(!found(empty, "relative/path"), "relative entries are skipped");
});
