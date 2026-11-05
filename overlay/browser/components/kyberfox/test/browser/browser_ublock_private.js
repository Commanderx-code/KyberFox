/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// uBlock Origin is allowed in private windows once per profile. Turning that
// off in Add-ons and themes stands, because the grant does not run again.

const { KyberUBlockBridge } = ChromeUtils.importESModule(
  "resource:///modules/KyberUBlockBridge.sys.mjs"
);
const { ExtensionPermissions } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionPermissions.sys.mjs"
);

const UBLOCK_ID = "uBlock0@raymondhill.net";
const DIR = "/browser/browser/components/kyberfox/test/browser/";
const GRANTED_PREF = "kyberfox.ublock.privateGranted";
const PRIVATE_PERMS = {
  permissions: ["internal:privateBrowsingAllowed"],
  origins: [],
};

async function privateAllowed() {
  let { permissions } = await ExtensionPermissions.get(UBLOCK_ID);
  return permissions.includes(PRIVATE_PERMS.permissions[0]);
}

async function installUblock() {
  // No network in the harness: point uBlock at a local asset list.
  Services.policies.wrappedJSObject.setExtensionPolicies({
    [UBLOCK_ID]: {
      adminSettings: JSON.stringify({
        assetsBootstrapLocation: `https://example.com${DIR}shield_assets.json`,
        userSettings: { autoUpdate: false },
        selectedFilterLists: ["user-filters"],
      }),
    },
  });
  let file = Services.dirsvc.get("GreD", Ci.nsIFile);
  file.append("distribution");
  file.append("extensions");
  file.append(`${UBLOCK_ID}.xpi`);
  let install = await AddonManager.getInstallForFile(file);
  await install.install();
  return AddonManager.getAddonByID(UBLOCK_ID);
}

add_setup(async function () {
  Services.prefs.setBoolPref(GRANTED_PREF, false);
  registerCleanupFunction(async () => {
    await (await AddonManager.getAddonByID(UBLOCK_ID))?.uninstall();
    Services.policies.wrappedJSObject.setExtensionPolicies({});
    Services.prefs.clearUserPref(GRANTED_PREF);
  });
});

add_task(async function test_waits_for_ublock_to_be_installed() {
  Assert.ok(!(await AddonManager.getAddonByID(UBLOCK_ID)), "no uBlock yet");
  await KyberUBlockBridge.allowInPrivateOnce();
  Assert.ok(
    !Services.prefs.getBoolPref(GRANTED_PREF),
    "the grant is still pending"
  );
});

add_task(async function test_grants_private_access_once() {
  await installUblock();
  await TestUtils.waitForCondition(
    () => KyberUBlockBridge.running,
    "uBlock runs"
  );
  Assert.ok(!(await privateAllowed()), "a new install is not allowed yet");
  Assert.ok(!KyberUBlockBridge.privateAllowed, "nor is the running uBlock");

  await KyberUBlockBridge.allowInPrivateOnce();
  Assert.ok(await privateAllowed(), "uBlock is allowed in private windows");
  Assert.ok(Services.prefs.getBoolPref(GRANTED_PREF), "the grant is recorded");
  await TestUtils.waitForCondition(
    () => KyberUBlockBridge.privateAllowed,
    "the reloaded uBlock runs in private windows"
  );

  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let policy = WebExtensionPolicy.getByID(UBLOCK_ID);
  Assert.ok(
    policy.canAccessWindow(win),
    "uBlock can access the private window"
  );
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_turning_it_off_stands() {
  let addon = await AddonManager.getAddonByID(UBLOCK_ID);
  await ExtensionPermissions.remove(
    UBLOCK_ID,
    PRIVATE_PERMS,
    WebExtensionPolicy.getByID(UBLOCK_ID)?.extension
  );
  await addon.reload();
  await TestUtils.waitForCondition(
    () => KyberUBlockBridge.running,
    "uBlock runs again"
  );

  await KyberUBlockBridge.allowInPrivateOnce();
  let win = await BrowserTestUtils.openNewBrowserWindow();
  await BrowserTestUtils.closeWindow(win);
  Assert.ok(!(await privateAllowed()), "uBlock stays off in private windows");
  Assert.ok(!KyberUBlockBridge.privateAllowed, "the running uBlock too");
});
