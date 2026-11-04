/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Firefox's password manager and form autofill are locked off, and every way
// into them is gone: the Settings page, the main menu, the toolbar button,
// the context menu on login forms and the address bar quick action.

const { ActionsProviderQuickActions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/ActionsProviderQuickActions.sys.mjs"
);
const { QuickActionsLoaderDefault } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/QuickActionsLoaderDefault.sys.mjs"
);

const { CustomizableUITestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/CustomizableUITestUtils.sys.mjs"
);
const gCUITestUtils = new CustomizableUITestUtils(window);

const LOCKED_OFF = [
  "signon.rememberSignons",
  "signon.autofillForms",
  "signon.generation.enabled",
  "extensions.formautofill.addresses.enabled",
  "extensions.formautofill.creditCards.enabled",
];

add_task(async function test_prefs_locked_off() {
  for (let pref of LOCKED_OFF) {
    Assert.ok(!Services.prefs.getBoolPref(pref), `${pref} is off`);
    Assert.ok(Services.prefs.prefIsLocked(pref), `${pref} is locked`);
  }
});

add_task(async function test_no_settings_page() {
  await BrowserTestUtils.withNewTab(
    "about:preferences#privacy-logins",
    async browser => {
      let doc = browser.contentDocument;
      await TestUtils.waitForCondition(
        () => doc.querySelector("setting-pane"),
        "the panes exist"
      );
      Assert.ok(
        !doc.getElementById("category-passwords-autofill")?.offsetParent,
        "no Passwords and autofill nav button"
      );
      Assert.ok(
        !doc.querySelector('setting-pane[data-category="panePasswordsAutofill"]'),
        "no Passwords and autofill pane"
      );
    }
  );
});

add_task(async function test_no_main_menu_entry() {
  await gCUITestUtils.openMainMenu();
  let button = PanelMultiView.getViewNode(document, "appMenu-passwords-button");
  Assert.ok(button, "the main menu is built");
  Assert.ok(
    button.hidden && !button.getBoundingClientRect().height,
    "no Passwords entry in the main menu"
  );
  await gCUITestUtils.hideMainMenu();
});

add_task(async function test_no_toolbar_button() {
  let ids = CustomizableUI.getUnusedWidgets(gNavToolbox.palette).map(w => w.id);
  Assert.ok(
    !ids.includes("logins-button"),
    "no Passwords button to add to the toolbar"
  );
  Assert.ok(!CustomizableUI.getPlacementOfWidget("logins-button"), "not placed");
});

add_task(async function test_no_quick_action() {
  await QuickActionsLoaderDefault.ensureLoaded();
  let action = ActionsProviderQuickActions.getAction("logins");
  Assert.ok(
    !action || action.isUnsupported?.(),
    "the address bar offers no Passwords action"
  );
});

add_task(async function test_no_login_items_in_context_menu() {
  await BrowserTestUtils.withNewTab(
    "https://example.com/document-builder.sjs?html=" +
      encodeURIComponent(
        '<form><input id="user" name="username"><input id="pass" type="password"></form>'
      ),
    async browser => {
      let menu = document.getElementById("contentAreaContextMenu");
      let shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#pass",
        { type: "contextmenu", button: 2 },
        browser
      );
      await shown;
      for (let id of [
        "fill-login",
        "manage-saved-logins",
        "fill-login-generated-password",
      ]) {
        Assert.ok(
          document.getElementById(id).hidden,
          `${id} is not in the context menu`
        );
      }
      let hidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
      menu.hidePopup();
      await hidden;
    }
  );
});
