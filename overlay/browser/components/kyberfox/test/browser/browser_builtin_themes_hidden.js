/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Firefox's built-in Light, Dark and Alpenglow themes stay installed (the
// profile manager uses Light and Dark) but are hidden from Add-ons and themes,
// which lists only the default theme and themes the user added.

const HIDDEN = [
  "firefox-compact-light@mozilla.org",
  "firefox-compact-dark@mozilla.org",
  "firefox-alpenglow@mozilla.org",
];
const DEFAULT = "default-theme@mozilla.org";

async function openThemesView() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:addons",
    true
  );
  let win = tab.linkedBrowser.contentWindow;
  await TestUtils.waitForCondition(
    () => win.gViewController,
    "about:addons ready"
  );
  // about:addons reopens on the last view, so the theme view may already be
  // loading; wait for its cards rather than for a view-loaded event.
  win.gViewController.loadView("addons://list/theme");
  await TestUtils.waitForCondition(
    () =>
      win.document.querySelector(
        `addon-list[type="theme"] addon-card[addon-id="${DEFAULT}"]`
      ),
    "the theme list shows"
  );
  return { tab, win };
}

add_task(async function test_builtin_themes_are_hidden_addons() {
  for (let id of HIDDEN) {
    let addon = await AddonManager.getAddonByID(id);
    Assert.ok(addon, `${id} is installed`);
    Assert.ok(addon.hidden, `${id} is hidden`);
  }
  let def = await AddonManager.getAddonByID(DEFAULT);
  Assert.ok(!def.hidden, "the default theme is not hidden");
});

add_task(async function test_addons_page_lists_only_the_default_theme() {
  let { tab, win } = await openThemesView();
  let ids = [...win.document.querySelectorAll("addon-card")].map(c =>
    c.getAttribute("addon-id")
  );
  Assert.ok(ids.includes(DEFAULT), "the default theme has a card");
  for (let id of HIDDEN) {
    Assert.ok(!ids.includes(id), `${id} has no card`);
  }
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_hidden_active_theme_can_be_switched_back() {
  let dark = await AddonManager.getAddonByID(HIDDEN[1]);
  await dark.enable();
  info("Dark is active");
  registerCleanupFunction(async () =>
    (await AddonManager.getAddonByID(DEFAULT)).enable()
  );
  let { tab, win } = await openThemesView();
  info("theme view loaded");
  let card = win.document.querySelector(`addon-card[addon-id="${DEFAULT}"]`);
  Assert.ok(card, "the default theme still has a card");
  let enable = card.querySelector(".theme-enable-button");
  Assert.ok(enable && !enable.hidden, "it has an Enable button");
  let enabled = new Promise(resolve => {
    let listener = {
      onEnabled(addon) {
        if (addon.id == DEFAULT) {
          AddonManager.removeAddonListener(listener);
          resolve();
        }
      },
    };
    AddonManager.addAddonListener(listener);
  });
  enable.click();
  await enabled;
  Assert.ok(
    (await AddonManager.getAddonByID(DEFAULT)).isActive,
    "the default theme is active again"
  );
  BrowserTestUtils.removeTab(tab);
});
