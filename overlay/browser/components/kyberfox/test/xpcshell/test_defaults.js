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
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);

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

add_task(function test_cfg_is_loaded() {
  Assert.equal(
    Services.prefs.getStringPref("general.config.filename", ""),
    "kyberfox.cfg",
    "local-settings.js names the autoconfig file"
  );
  Assert.notEqual(
    Services.prefs.getStringPref("kyberfox.cfg.version", ""),
    "",
    "kyberfox.cfg was read"
  );
});

add_task(function test_private_defaults() {
  checkPrefs({
    "network.cookie.cookieBehavior": 1,
    "privacy.resistFingerprinting": false,
    "privacy.fingerprintingProtection": true,
    "browser.safebrowsing.downloads.remote.enabled": false,
    "browser.safebrowsing.malware.enabled": true,
    "dom.push.enabled": false,
    "identity.fxaccounts.enabled": false,
    "media.eme.enabled": false,
    "extensions.blocklist.enabled": true,
    "security.remote_settings.crlite_filters.enabled": true,
    "browser.startup.page": 3,
    "privacy.sanitize.sanitizeOnShutdown": false,
  });
});

add_task(function test_strict_is_a_default_not_a_lock() {
  const category = "browser.contentblocking.category";
  Assert.equal(
    Services.prefs.getDefaultBranch(null).getStringPref(category, ""),
    "strict",
    "strict is the default content blocking category"
  );
  Assert.ok(!Services.prefs.prefIsLocked(category), `${category} is not locked`);
  Assert.ok(
    !Services.prefs.prefHasUserValue(category),
    `${category} is not forced with a user value`
  );
});

// A new profile gets its category from matching the feature prefs, so the
// defaults in kyberfox.cfg must line up with the strict feature list.
add_task(function test_new_profile_resolves_to_strict() {
  const { ContentBlockingPrefs } = ChromeUtils.importESModule(
    "moz-src:///browser/components/protections/ContentBlockingPrefs.sys.mjs"
  );
  ContentBlockingPrefs.init();
  try {
    Assert.equal(
      Services.prefs.getStringPref("browser.contentblocking.category"),
      "strict"
    );
  } finally {
    ContentBlockingPrefs.uninit();
    Services.prefs.clearUserPref("browser.contentblocking.category");
  }
});

add_task(function test_security_lists_stay_reachable() {
  let allowed = Services.prefs
    .getStringPref("kyberfox.services.settings.allowedCollections", "")
    .split(",");
  for (let collection of [
    "security-state/*",
    "blocklists/addons-bloomfilters",
    "main/tracking-protection-lists",
  ]) {
    Assert.ok(allowed.includes(collection), `${collection} is allowed`);
  }
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

  Assert.equal((await Services.search.getDefault()).name, "DuckDuckGo");
  Assert.equal((await Services.search.getDefaultPrivate()).name, "DuckDuckGo");
  let visible = (await Services.search.getVisibleEngines()).map(e => e.name);
  for (let name of ["DuckDuckGo", "Startpage", "Brave Search", "Wikipedia (en)"]) {
    Assert.ok(visible.includes(name), `${name} is offered`);
  }
  for (let name of ["Google", "Bing"]) {
    Assert.ok(!visible.includes(name), `${name} is not offered by default`);
    Assert.ok(
      Services.search.getEngineByName(name)?.hidden,
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
