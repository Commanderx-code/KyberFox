/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// uBlock Origin ships in distribution/extensions and is installed on the
// first run of a clean profile, with no network access.
const UBLOCK_ID = "uBlock0@raymondhill.net";

add_task(async function test_ublock_is_installed_and_active() {
  let addon = await AddonManager.getAddonByID(UBLOCK_ID);
  Assert.ok(addon, "uBlock Origin is installed");
  Assert.ok(addon.isActive, "uBlock Origin is active");
  Assert.ok(!addon.userDisabled, "uBlock Origin is not disabled by the user");
  Assert.ok(!addon.appDisabled, "uBlock Origin is not disabled by the app");
  Assert.equal(
    addon.signedState,
    AddonManager.SIGNEDSTATE_SIGNED,
    "the bundled XPI keeps its signature"
  );
});

add_task(function test_xpi_is_packaged() {
  let file = Services.dirsvc.get("GreD", Ci.nsIFile);
  file.append("distribution");
  file.append("extensions");
  file.append(`${UBLOCK_ID}.xpi`);
  Assert.ok(file.exists(), `${file.path} is packaged`);
});
