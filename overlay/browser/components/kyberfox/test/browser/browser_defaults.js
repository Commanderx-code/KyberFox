/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// kyberfox.cfg is read by autoconfig, which only runs in a real browser.

// The defaultPrefs kyberfox.cfg sets. The harness profile puts user values on
// some prefs, so these read the default branch.
function readDefault(name) {
  let branch = Services.prefs.getDefaultBranch("");
  switch (branch.getPrefType(name)) {
    case branch.PREF_BOOL:
      return branch.getBoolPref(name);
    case branch.PREF_INT:
      return branch.getIntPref(name);
    default:
      return branch.getStringPref(name, undefined);
  }
}

function checkPrefs(expected) {
  for (let [name, value] of Object.entries(expected)) {
    Assert.strictEqual(readDefault(name), value, name);
  }
}

add_task(function test_cfg_is_read() {
  Assert.equal(
    Services.prefs.getCharPref("kyberfox.cfg.version"),
    "1",
    "kyberfox.cfg was read"
  );
});

add_task(function test_cfg_defaults() {
  checkPrefs({
    "toolkit.telemetry.enabled": false,
    "dom.security.https_only_mode": true,
  });
});

// kyberfox.cfg sets this one with pref(), so it is a user value.
add_task(function test_pref_entries() {
  Assert.strictEqual(
    Services.prefs.getBoolPref("browser.safebrowsing.downloads.remote.enabled"),
    false,
    "remote download checks are off"
  );
});

add_task(function test_private_defaults() {
  checkPrefs({
    "network.cookie.cookieBehavior": 1,
    "privacy.resistFingerprinting": false,
    "privacy.fingerprintingProtection": true,
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

add_task(function test_strict_is_seeded_not_a_lock() {
  const category = "browser.contentblocking.category";
  // kyberfox.cfg seeds "strict" once as a user value, so the default branch
  // keeps Firefox's "standard".
  Assert.ok(
    Services.prefs.getBoolPref("kyberfox.cfg.categorySeeded", false),
    "kyberfox.cfg ran its one-time category seed"
  );
  Assert.ok(
    !Services.prefs.prefIsLocked(category),
    `${category} is not locked`
  );
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
