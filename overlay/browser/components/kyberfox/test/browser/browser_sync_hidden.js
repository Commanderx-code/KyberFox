/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// With accounts off, Settings has no Account and sync pane: not in the nav,
// not reachable by URL, and not in search results.

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
// LibreWolf's kyberfoxIPv6 setting (privacy.mjs) throws while Settings
// initializes; it is unrelated to the Sync pane.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /can't assign to property "value" on false/
);

add_task(async function test_no_sync_pane() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      let doc = content.document;
      await ContentTaskUtils.waitForCondition(
        () => doc.getElementById("searchInput") && doc.querySelector("setting-pane"),
        "the panes exist"
      );
      Assert.ok(!doc.getElementById("category-sync")?.offsetParent, "no sync nav button");
      Assert.ok(!doc.querySelector("setting-pane[data-category=sync]"), "no sync pane");
      Assert.ok(doc.location.hash != "#sync", "the URL fell back from #sync");

      let input = doc.getElementById("searchInput");
      for (let query of ["sync", "account", "backup"]) {
        input.value = query;
        input.dispatchEvent(new content.Event("input", { bubbles: true }));
        await new Promise(r => content.setTimeout(r, 1500));
        let text = doc.getElementById("searchResults")?.innerText ?? "";
        Assert.ok(
          !/Account and sync/i.test(text) && !/Import browser data/i.test(text),
          `search "${query}" shows no Account and sync results`
        );
      }
    });
  });
});
