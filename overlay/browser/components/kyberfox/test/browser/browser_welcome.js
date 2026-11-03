/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The first-run welcome page: recommended add-ons and default search.
const { KyberAddons } = ChromeUtils.importESModule(
  "resource:///modules/KyberAddons.sys.mjs"
);

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

const SHOWN_PREF = "kyberfox.welcome.shown";
const URL = "chrome://kyberfox/content/welcome.xhtml";
const AMO = "https://addons.mozilla.org/firefox/downloads/latest/";

registerCleanupFunction(() => {
  KyberAddons._installForTests = null;
  KyberAddons._resetForTests();
  Services.prefs.setBoolPref(SHOWN_PREF, true);
});

function urlFor(slug) {
  return AMO + slug + "/latest.xpi";
}

async function withPage(task) {
  Services.prefs.setBoolPref(SHOWN_PREF, false);
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL);
  let doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () =>
      doc.querySelectorAll('input[type="checkbox"]').length ==
        KyberAddons.recommended().length &&
      doc.querySelector('input[name="search"]:checked'),
    "the page is built"
  );
  try {
    await task(doc, tab);
  } finally {
    if (tab.isConnected) {
      BrowserTestUtils.removeTab(tab);
    }
    KyberAddons._installForTests = null;
    Services.prefs.setBoolPref(SHOWN_PREF, true);
  }
}

function box(doc, slug) {
  let id = KyberAddons.recommended().find(a => a.slug == slug).id;
  return doc.querySelector(
    `input[type="checkbox"][data-addon-id="${CSS.escape(id)}"]`
  );
}

function stateOf(doc, slug) {
  return box(doc, slug).closest(".choice").querySelector(".state").textContent;
}

add_task(async function test_welcome_opens_once_on_first_run() {
  KyberAddons._resetForTests();
  KyberAddons._ignoreAutomationForTests = true;
  Services.prefs.setBoolPref(SHOWN_PREF, false);
  let tabs = gBrowser.tabs.length;
  let first = KyberAddons.maybeOpenWelcome(window);
  let second = KyberAddons.maybeOpenWelcome(window);
  Assert.ok(first, "the first call opens a tab");
  Assert.equal(second, null, "the second call does nothing");
  Assert.equal(gBrowser.tabs.length, tabs + 1, "exactly one tab was added");
  await BrowserTestUtils.browserLoaded(first.linkedBrowser, false, URL);
  Assert.equal(first.linkedBrowser.currentURI.spec, URL, "welcome page");
  BrowserTestUtils.removeTab(first);
});

add_task(async function test_welcome_not_opened_in_automation() {
  KyberAddons._resetForTests();
  Services.prefs.setBoolPref(SHOWN_PREF, false);
  let tabs = gBrowser.tabs.length;
  Assert.equal(KyberAddons.maybeOpenWelcome(window), null, "automation");
  Assert.equal(gBrowser.tabs.length, tabs, "no tab");
});

add_task(async function test_welcome_not_opened_when_shown() {
  KyberAddons._resetForTests();
  KyberAddons._ignoreAutomationForTests = true;
  Services.prefs.setBoolPref(SHOWN_PREF, true);
  let tabs = gBrowser.tabs.length;
  Assert.equal(KyberAddons.maybeOpenWelcome(window), null, "pref is true");
  Assert.equal(gBrowser.tabs.length, tabs, "no tab");
});

add_task(async function test_welcome_not_opened_in_private_window() {
  KyberAddons._resetForTests();
  KyberAddons._ignoreAutomationForTests = true;
  Services.prefs.setBoolPref(SHOWN_PREF, false);
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    Assert.equal(KyberAddons.maybeOpenWelcome(win), null, "private window");
  } finally {
    await BrowserTestUtils.closeWindow(win);
    Services.prefs.setBoolPref(SHOWN_PREF, true);
  }
});

add_task(async function test_nothing_preselected() {
  await withPage(async doc => {
    Assert.equal(
      doc.querySelectorAll('input[type="checkbox"]:checked').length,
      0,
      "no add-on is ticked"
    );
    Assert.equal(
      doc.querySelectorAll('input[type="checkbox"]').length,
      KyberAddons.recommended().length,
      "one checkbox per recommended add-on"
    );
    let radio = doc.querySelector('input[name="search"]:checked');
    Assert.equal(radio.value, "DuckDuckGo", "DuckDuckGo is preselected");
    Assert.deepEqual(
      [...doc.querySelectorAll('input[name="search"]')].map(r => r.value),
      ["DuckDuckGo", "Google", "Brave Search", "Startpage", "Ecosia"],
      "five engines"
    );
  });
});

add_task(async function test_ublock_shown_as_included() {
  await withPage(async doc => {
    let row = doc.querySelector(
      '.choice[data-addon-id="uBlock0@raymondhill.net"]'
    );
    Assert.ok(row, "uBlock Origin has a row");
    Assert.ok(!row.querySelector("input"), "no checkbox");
    Assert.ok(row.textContent.includes("uBlock Origin"), "named");
    await TestUtils.waitForCondition(
      () => row.querySelector(".state").textContent == "Included",
      "labeled Included"
    );
  });
});

add_task(async function test_install_selected_installs_only_ticked() {
  await withPage(async doc => {
    let urls = [];
    KyberAddons._installForTests = async url => {
      urls.push(url);
    };
    box(doc, "clearurls").click();
    box(doc, "darkreader").click();
    doc.getElementById("install").click();
    await TestUtils.waitForCondition(
      () => !doc.getElementById("install").disabled && urls.length,
      "install finished"
    );
    Assert.deepEqual(
      urls,
      [urlFor("clearurls"), urlFor("darkreader")],
      "exactly the two ticked add-ons, in list order"
    );
    Assert.equal(stateOf(doc, "clearurls"), "Installed");
    Assert.equal(stateOf(doc, "darkreader"), "Installed");
    Assert.equal(stateOf(doc, "tabliss"), "", "untouched rows stay empty");
    Assert.ok(Services.prefs.getBoolPref(SHOWN_PREF), "page marked as used");
  });
});

add_task(async function test_install_error_is_shown_and_others_continue() {
  await withPage(async doc => {
    let urls = [];
    KyberAddons._installForTests = async url => {
      urls.push(url);
      if (url == urlFor("clearurls")) {
        throw new Error("Download failed.");
      }
    };
    box(doc, "clearurls").click();
    box(doc, "darkreader").click();
    doc.getElementById("install").click();
    await TestUtils.waitForCondition(
      () => stateOf(doc, "darkreader") == "Installed",
      "second add-on installed"
    );
    Assert.equal(urls.length, 2, "both were tried");
    Assert.equal(stateOf(doc, "clearurls"), "Install failed.");
    let state = box(doc, "clearurls")
      .closest(".choice")
      .querySelector(".state");
    Assert.equal(state.title, "Download failed.", "the code is the tooltip");
    Assert.ok(state.classList.contains("error"), "error styling");
    Assert.ok(Services.prefs.getBoolPref(SHOWN_PREF), "pref is set");
  });
});

add_task(async function test_network_failure_and_cancel_texts() {
  await withPage(async doc => {
    KyberAddons._installForTests = async url => {
      if (url == urlFor("clearurls")) {
        let e = new Error("onDownloadFailed");
        e.addonErrorCode = AddonManager.ERROR_NETWORK_FAILURE;
        throw e;
      }
      let e = new Error("declined");
      e.canceled = true;
      throw e;
    };
    box(doc, "clearurls").click();
    box(doc, "darkreader").click();
    doc.getElementById("install").click();
    await TestUtils.waitForCondition(
      () => stateOf(doc, "darkreader") == "Canceled",
      "a declined prompt reads Canceled"
    );
    Assert.equal(
      stateOf(doc, "clearurls"),
      "Could not reach addons.mozilla.org. Check your connection and try again."
    );
    Assert.ok(
      !box(doc, "darkreader").closest(".choice").querySelector(".state.error"),
      "Canceled is not an error"
    );
    Assert.ok(Services.prefs.getBoolPref(SHOWN_PREF), "pref is set");
  });
});

add_task(async function test_installed_addons_are_marked_and_disabled() {
  let id = KyberAddons.recommended().find(a => a.slug == "darkreader").id;
  let original = KyberAddons.installed;
  KyberAddons.installed = async which => which == id;
  try {
    await withPage(async doc => {
      await TestUtils.waitForCondition(
        () => stateOf(doc, "darkreader") == "Installed",
        "marked installed"
      );
      Assert.ok(box(doc, "darkreader").disabled, "checkbox disabled");
      Assert.ok(!box(doc, "clearurls").disabled, "others stay enabled");
    });
  } finally {
    KyberAddons.installed = original;
  }
});

add_task(async function test_closing_the_tab_counts_as_skip() {
  await withPage(async (doc, tab) => {
    Assert.ok(!Services.prefs.getBoolPref(SHOWN_PREF), "not shown yet");
    BrowserTestUtils.removeTab(tab);
    Assert.ok(Services.prefs.getBoolPref(SHOWN_PREF), "pref is set on close");
  });
});

add_task(async function test_install_uses_fixed_amo_urls_only() {
  Assert.equal(KyberAddons.installURL("not-listed@example.com"), null);
  for (let a of KyberAddons.recommended()) {
    Assert.equal(KyberAddons.installURL(a.id), urlFor(a.slug), a.slug);
  }
  let results = await KyberAddons.install(["evil@example.com"]);
  Assert.equal(results[0].ok, false, "unlisted id is refused");
});

add_task(async function test_skip_sets_pref() {
  await withPage(async (doc, tab) => {
    KyberAddons._installForTests = async () => {
      Assert.ok(false, "skip installs nothing");
    };
    box(doc, "clearurls").click();
    Assert.ok(!Services.prefs.getBoolPref(SHOWN_PREF));
    let closed = BrowserTestUtils.waitForEvent(tab, "TabClose");
    doc.getElementById("skip").click();
    await closed;
    Assert.ok(Services.prefs.getBoolPref(SHOWN_PREF), "pref is set");
  });
});

add_task(async function test_search_choice_sets_default() {
  await SearchService.init();
  let before = SearchService.defaultEngine.name;
  let beforePrivate = SearchService.defaultPrivateEngine.name;
  Assert.ok(
    SearchService.getEngineByName("Brave Search"),
    "the shipped policy engines are present"
  );
  try {
    await withPage(async doc => {
      doc.querySelector('input[name="search"][value="Brave Search"]').click();
      doc.getElementById("install").click();
      await TestUtils.waitForCondition(
        () =>
          !doc.getElementById("install").disabled &&
          SearchService.defaultEngine.name == "Brave Search",
        "Brave Search is the default"
      );
      Assert.equal(SearchService.defaultPrivateEngine.name, "Brave Search");
    });

    // Reopened later: the current default is preselected, and DuckDuckGo
    // can be chosen again.
    await withPage(async doc => {
      Assert.equal(
        doc.querySelector('input[name="search"]:checked').value,
        "Brave Search",
        "the current default is preselected"
      );
      doc.querySelector('input[name="search"][value="DuckDuckGo"]').click();
      doc.getElementById("install").click();
      await TestUtils.waitForCondition(
        () =>
          !doc.getElementById("install").disabled &&
          SearchService.defaultEngine.name == "DuckDuckGo",
        "DuckDuckGo is the default again"
      );
    });
  } finally {
    await SearchService.setDefault(
      SearchService.getEngineByName(before),
      SearchService.CHANGE_REASON.USER
    );
    await SearchService.setDefaultPrivate(
      SearchService.getEngineByName(beforePrivate),
      SearchService.CHANGE_REASON.USER
    );
  }
});

add_task(async function test_privacy_pane_link_opens_the_page() {
  // LibreWolf's Privacy pane additions reject promises when they render; see
  // browser_privacy_presets.js.
  PromiseTestUtils.allowMatchingRejectionsGlobally(
    /can't assign to property "value" on (true|false)/
  );
  PromiseTestUtils.allowMatchingRejectionsGlobally(
    /No Setting with id "kyberfoxWebGLPrompt(Hide)?"/
  );
  let pane = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#privacy"
  );
  try {
    let doc = pane.linkedBrowser.contentDocument;
    let link = await TestUtils.waitForCondition(
      () => doc.getElementById("kyberfoxRecommendedAddonsLink"),
      "the link is in the Privacy pane"
    );
    await link.updateComplete;
    let opened = BrowserTestUtils.waitForNewTab(gBrowser, URL, true);
    link.click();
    let tab = await opened;
    Assert.ok(tab, "the welcome page opened");
    let tabs = gBrowser.tabs.length;
    gBrowser.selectedTab = pane;
    link.click();
    await TestUtils.waitForCondition(
      () => gBrowser.selectedTab == tab,
      "a second click switches to the open page"
    );
    Assert.equal(gBrowser.tabs.length, tabs, "no second welcome tab");
    BrowserTestUtils.removeTab(tab);
  } finally {
    BrowserTestUtils.removeTab(pane);
  }
});
