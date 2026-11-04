/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The About dialog and the About section of Settings name the Kyber Fox
// version and the Firefox version it is built from.

const KYBER = AppConstants.MOZ_APP_VERSION_DISPLAY;
const FIREFOX = AppConstants.MOZ_APP_VERSION;

add_task(async function test_about_dialog() {
  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => win.document.documentURI == "chrome://browser/content/aboutDialog.xhtml"
  );
  window.openAboutDialog();
  let dialog = await opened;
  let label = dialog.document.getElementById("version");
  await TestUtils.waitForCondition(
    () => label.textContent.includes(KYBER),
    "the version is filled in"
  );
  Assert.ok(
    label.textContent.includes(`based on Firefox ${FIREFOX}`),
    `the dialog names the Firefox version: ${label.textContent}`
  );
  await BrowserTestUtils.closeWindow(dialog);
});

add_task(async function test_settings_about_section() {
  await BrowserTestUtils.withNewTab("about:preferences#about", async browser => {
    let doc = browser.contentDocument;
    let info;
    await TestUtils.waitForCondition(() => {
      info = doc.querySelector("update-information");
      return info?.shadowRoot?.getElementById("label")?.textContent.includes(KYBER);
    }, "the version is filled in");
    let text = info.shadowRoot.getElementById("label").textContent;
    Assert.ok(
      text.includes(`based on Firefox ${FIREFOX}`),
      `Settings names the Firefox version: ${text}`
    );
  });
});
