/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Checks the shipped kyberfox.cfg and distribution/policies.json in a built
// browser. Run with ./mach xpcshell-test browser/components/kyberfox/test/xpcshell/

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { Preferences } = ChromeUtils.importESModule(
  "resource://gre/modules/Preferences.sys.mjs"
);
const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);
const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);

// Autoconfig does not run here, so prefs kyberfox.cfg sets are read from the
// shipped file itself.
function shippedCfg() {
  let cfg = Services.dirsvc.get("GreD", Ci.nsIFile);
  cfg.append("kyberfox.cfg");
  return Cu.readUTF8File(cfg);
}

// The kept LibreWolf Remote Settings patch serves dumps (the search
// configuration among them) only for the collections kyberfox.cfg allows.
function applyCfgRemoteSettingsAllowLists() {
  let found = 0;
  for (let [, name, value] of shippedCfg().matchAll(
    /defaultPref\(\s*"(kyberfox\.services\.settings\.allowedCollections(?:FromDump)?)",\s*"([^"]*)"\s*\)/g
  )) {
    Services.prefs.getDefaultBranch("").setStringPref(name, value);
    found++;
  }
  Assert.equal(found, 2, "kyberfox.cfg sets both Remote Settings allow lists");
}
applyCfgRemoteSettingsAllowLists();

updateAppInfo({
  name: "XPCShell",
  ID: "xpcshell@tests.mozilla.org",
  version: "48",
  platformVersion: "48",
});
do_get_profile();
SearchTestUtils.init(this);

Cc["@mozilla.org/enterprisepolicies;1"]
  .getService(Ci.nsIObserver)
  .observe(null, "policies-startup", null);

function checkPrefs(expected) {
  for (let [name, value] of Object.entries(expected)) {
    Assert.strictEqual(Preferences.get(name), value, name);
  }
}

// Autoconfig does not run under xpcshell, so everything that kyberfox.cfg sets
// is checked in test/browser/browser_defaults.js.
add_task(function test_cfg_is_loaded() {
  Assert.equal(
    Services.prefs.getStringPref("general.config.filename", ""),
    "kyberfox.cfg",
    "local-settings.js names the autoconfig file"
  );
});

add_task(function test_display_version_has_build_counter() {
  Assert.stringMatches(
    AppConstants.MOZ_APP_VERSION_DISPLAY,
    new RegExp(`^${AppConstants.MOZ_APP_VERSION.replace(/\./g, "\\.")}-\\d+$`)
  );
});

add_task(async function test_shipped_policies() {
  let file = Services.dirsvc.get("GreD", Ci.nsIFile);
  file.append("distribution");
  file.append("policies.json");
  Assert.ok(file.exists(), `${file.path} is installed`);

  await EnterprisePolicyTesting.setupPolicyEngineWithJsonForSearch(file.path);
  await TestUtils.waitForTick();
  Assert.equal(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.ACTIVE,
    "policies.json is valid"
  );

  Assert.equal((await SearchService.getDefault()).name, "DuckDuckGo");
  Assert.equal((await SearchService.getDefaultPrivate()).name, "DuckDuckGo");
  let visible = (await SearchService.getVisibleEngines()).map(e => e.name);
  // The spec ships these six; the first-run page offers the first five as
  // the default.
  for (let name of [
    "DuckDuckGo",
    "Google",
    "Brave Search",
    "Startpage",
    "Ecosia",
    "Wikipedia (en)",
  ]) {
    Assert.ok(visible.includes(name), `${name} is offered`);
  }
  for (let name of ["Bing"]) {
    Assert.ok(!visible.includes(name), `${name} is not offered by default`);
    Assert.ok(
      SearchService.getEngineByName(name)?.hidden,
      `${name} is hidden, so the user can restore it`
    );
  }

  checkPrefs({
    "browser.ai.control.translations": "available",
    "browser.translations.enable": true,
    "browser.ai.control.sidebarChatbot": "blocked",
    "browser.ml.chat.enabled": false,
    "browser.ai.control.pdfjsAltText": "blocked",
    "browser.ai.control.smartTabGroups": "blocked",
    "browser.ai.control.linkPreviewKeyPoints": "blocked",
    "browser.ai.control.smartWindow": "blocked",
    "browser.newtabpage.activity-stream.feeds.topsites": true,
    "browser.newtabpage.activity-stream.showSponsoredTopSites": false,
    "browser.newtabpage.activity-stream.showSponsored": false,
    "browser.newtabpage.activity-stream.showWeather": false,
    "browser.newtabpage.activity-stream.feeds.section.topstories": false,
    "browser.newtabpage.activity-stream.feeds.section.highlights": false,
  });
});

add_task(function test_distribution_addons_are_enabled() {
  // The bundled uBlock Origin is installed into the profile scope (1) from
  // distribution/extensions, so that scope must stay enabled. kyberfox.cfg
  // must not narrow it, and the add-on is not a detected sideload, so
  // extensions.autoDisableScopes does not disable it.
  let [, value] = shippedCfg().match(
    /defaultPref\("extensions\.enabledScopes",\s*(\d+)\)/
  );
  let scopes = Number(value);
  Assert.ok(scopes & 1, "the profile scope is enabled");
  Assert.ok(scopes & 4, "the application scope is enabled");
});
