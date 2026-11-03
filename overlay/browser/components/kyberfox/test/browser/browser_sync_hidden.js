/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// With accounts off, Settings has no Account and sync pane: not in the nav,
// not reachable by URL, and not in search results.

add_task(async function test_no_sync_pane() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      let doc = content.document;
      await ContentTaskUtils.waitForCondition(
        () => doc.getElementById("searchInput") && doc.querySelector("setting-pane"),
        "the panes exist"
      );
      Assert.ok(!doc.getElementById("category-sync")?.offsetParent, "no sync nav button");
      let swap = doc.getElementById("toggleButton");
      Assert.ok(
        !swap || (swap.hidden && !swap.offsetParent),
        "no Swap settings design button in the nav"
      );
      Assert.ok(
        !doc.querySelector('setting-pane[data-category="paneSync"]'),
        "no sync pane"
      );
      Assert.notEqual(doc.location.hash, "#sync", "the URL fell back from #sync");

      let visibleText = () =>
        [...doc.querySelectorAll("#mainPrefPane setting-pane")]
          .filter(p => !p.hidden)
          .map(p => p.innerText)
          .join("\n");

      for (let query of ["sync", "account", "backup", "import"]) {
        let done = new Promise(resolve =>
          content.addEventListener(
            "PreferencesSearchCompleted",
            e => e.detail == query && resolve(),
            { once: false }
          )
        );
        let input = doc.getElementById("searchInput");
        input.value = query;
        input.dispatchEvent(new content.Event("input", { bubbles: true }));
        await done;
        let text = visibleText();
        Assert.ok(
          !doc.querySelector('setting-pane[data-category="paneSync"]'),
          `search "${query}": no sync pane was rendered`
        );
        Assert.ok(
          !/Account and sync/i.test(text) && !/Import browser data/i.test(text),
          `search "${query}" shows no Account and sync results`
        );
      }
    });
  });
});
