/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// docs/searxng.md: a self-hosted search engine such as SearXNG is added with
// Firefox's own "Add search engine" in Settings. The search policy only adds
// and removes built-in engines, so this must keep working.

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const NAME = "SearXNG (test)";

add_task(async function test_add_engine_button_offered() {
  await BrowserTestUtils.withNewTab(
    "about:preferences#search",
    async browser => {
      let doc = browser.contentDocument;
      let button;
      await TestUtils.waitForCondition(
        () => (button = doc.getElementById("addEngineButton")),
        "the Search page has its Add search engine button"
      );
      Assert.ok(button.checkVisibility(), "it is shown");
      Assert.ok(!button.disabled, "and enabled");
    }
  );
});

add_task(async function test_user_engine_can_be_the_default() {
  let oldDefault = await SearchService.getDefault();
  let oldPrivate = await SearchService.getDefaultPrivate();
  let engine = await SearchService.addUserEngine({
    name: NAME,
    // The dialog turns the %s the user types into {searchTerms}.
    url: "https://searx.example.org/search?q={searchTerms}",
    alias: "@sx",
  });
  registerCleanupFunction(async () => {
    await SearchService.setDefault(
      oldDefault,
      SearchService.CHANGE_REASON.UNKNOWN
    );
    await SearchService.setDefaultPrivate(
      oldPrivate,
      SearchService.CHANGE_REASON.UNKNOWN
    );
    let added = SearchService.getEngineByName(NAME);
    if (added) {
      await SearchService.removeEngine(added);
    }
  });

  Assert.equal(
    engine.getSubmission("kyber fox").uri.spec,
    "https://searx.example.org/search?q=kyber+fox",
    "searches go to the instance"
  );
  Assert.ok(engine.aliases.includes("@sx"), "the keyword is kept");

  await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
  Assert.equal(
    (await SearchService.getDefault()).name,
    NAME,
    "it can be the default"
  );
  await SearchService.setDefaultPrivate(
    engine,
    SearchService.CHANGE_REASON.USER
  );
  Assert.equal(
    (await SearchService.getDefaultPrivate()).name,
    NAME,
    "and the private window default"
  );
});
