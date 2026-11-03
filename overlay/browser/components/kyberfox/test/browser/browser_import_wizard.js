/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The Sync category is hidden while accounts are off, so File > Import From
// Another Browser must open the migration wizard on its own.

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
// Closing the window right away destroys the wizard actor mid-query.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Actor 'MigrationWizard' destroyed/
);

add_task(async function test_file_menu_import_opens_wizard() {
  Assert.ok(
    !Services.prefs.getBoolPref("identity.fxaccounts.enabled"),
    "accounts are off"
  );
  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null, win =>
    win.document.documentURI.includes("migration-dialog-window")
  );
  document.getElementById("cmd_file_importFromAnotherBrowser").doCommand();
  let win = await opened;
  Assert.ok(win, "the migration wizard window opened");
  await BrowserTestUtils.closeWindow(win);
});
