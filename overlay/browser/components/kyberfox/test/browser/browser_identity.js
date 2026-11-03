/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

add_task(function test_app_identity() {
  is(Services.appinfo.name, "Kyber Fox", "application name");
  is(Services.appinfo.vendor, "Kyber Fox", "vendor");
  is(AppConstants.MOZ_APP_NAME, "kyberfox", "binary name");
});

add_task(function test_profile_root() {
  let root = Services.dirsvc.get("DefProfRt", Ci.nsIFile);
  let localRoot = Services.dirsvc.get("DefProfLRt", Ci.nsIFile);
  if (AppConstants.platform == "win") {
    is(root.leafName, "Profiles", "profiles folder");
    is(root.parent.leafName, "Kyber Fox", "under %APPDATA%\\Kyber Fox");
  } else if (AppConstants.platform == "linux") {
    // A fresh install uses XDG folders; an existing ~/.kyberfox keeps the legacy path.
    let legacy = root.path == PathUtils.join(Services.env.get("HOME"), ".kyberfox");
    if (!legacy) {
      let config =
        Services.env.get("XDG_CONFIG_HOME") ||
        PathUtils.join(Services.env.get("HOME"), ".config");
      is(root.path, PathUtils.join(config, "kyberfox", "kyberfox"), "XDG config root");
    }
    let cache =
      Services.env.get("XDG_CACHE_HOME") ||
      PathUtils.join(Services.env.get("HOME"), ".cache");
    is(localRoot.path, PathUtils.join(cache, "kyberfox"), "XDG cache root");
  }
});
