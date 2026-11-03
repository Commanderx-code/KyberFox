/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The Standard and Strict presets in the Privacy pane of about:preferences.
const { KyberPrivacyPresets } = ChromeUtils.importESModule(
  "resource:///modules/KyberPrivacyPresets.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

// LibreWolf's additions to the Privacy pane still have two faults that this
// task does not touch: its "Break websites" group names settings nobody
// registered, and its IPv6 and JIT getters assign to a number. Each fault
// rejects a promise when the pane renders; see the task 10 report.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /No Setting with id "kyberfoxWebGLPrompt(Hide)?"/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /can't assign to property "value" on (true|false)/
);

const { PRESETS } = KyberPrivacyPresets;
const CATEGORY = "browser.contentblocking.category";
const ALL_PREFS = [
  ...new Set([
    ...Object.keys(PRESETS.standard),
    ...Object.keys(PRESETS.strict),
  ]),
];
const RECORD_PREF = "kyberfox.privacy.preset";

// Every pref a preset touches, so each test starts from the same state and
// registerCleanupFunction can put the profile back.
const saved = new Map();
for (let name of [...ALL_PREFS, RECORD_PREF]) {
  saved.set(name, {
    hasUser: Services.prefs.prefHasUserValue(name),
    type: Services.prefs.getPrefType(name),
  });
  if (saved.get(name).hasUser) {
    saved.get(name).value = readUser(name);
  }
}

function readUser(name) {
  switch (Services.prefs.getPrefType(name)) {
    case Services.prefs.PREF_BOOL:
      return Services.prefs.getBoolPref(name);
    case Services.prefs.PREF_INT:
      return Services.prefs.getIntPref(name);
    default:
      return Services.prefs.getStringPref(name);
  }
}

const openTabs = [];

registerCleanupFunction(() => {
  // A failed assertion must not leave a tab behind.
  for (let tab of openTabs.splice(0)) {
    BrowserTestUtils.removeTab(tab);
  }
  for (let [name, state] of saved) {
    if (!state.hasUser) {
      Services.prefs.clearUserPref(name);
    } else if (typeof state.value == "boolean") {
      Services.prefs.setBoolPref(name, state.value);
    } else if (typeof state.value == "number") {
      Services.prefs.setIntPref(name, state.value);
    } else {
      Services.prefs.setStringPref(name, state.value);
    }
  }
});

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

// The harness profile overrides a few prefs for its own sake (browser.toml);
// put those back to the shipped values so the profile reads as fresh. The
// content blocking category is a user value kyberfox.cfg seeds once, so it
// stays.
// The prefs are cleared directly: pushPrefEnv would snapshot the current
// values and write them back after the cleanup function ran.
function freshProfile() {
  for (let name of ALL_PREFS) {
    if (name != CATEGORY) {
      Services.prefs.clearUserPref(name);
    }
  }
}

function closePane() {
  BrowserTestUtils.removeTab(openTabs.pop());
}

async function openPane() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#privacy"
  );
  openTabs.push(tab);
  let doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () => doc.getElementById("kyberfoxPrivacyPreset"),
    "the preset radio group is in the pane"
  );
  await doc.getElementById("kyberfoxPrivacyPreset").updateComplete;
  return doc;
}

function radio(doc, preset) {
  return doc.getElementById(
    `kyberfoxPrivacyPreset${preset[0].toUpperCase()}${preset.slice(1)}`
  );
}

function selected(doc) {
  return doc.getElementById("kyberfoxPrivacyPreset").value;
}

function warning(doc) {
  return doc.getElementById("kyberfoxPrivacyPresetStrictWarning");
}

add_task(async function test_standard_matches_defaults() {
  freshProfile();
  Assert.equal(KyberPrivacyPresets.current(), "standard", "fresh is Standard");
  for (let [name, value] of Object.entries(PRESETS.standard)) {
    Assert.strictEqual(
      name == CATEGORY ? readUser(name) : readDefault(name),
      value,
      `Standard ${name} is the shipped value`
    );
  }

  let doc = await openPane();
  Assert.equal(selected(doc), "standard", "the pane selects Standard");

  let before = ALL_PREFS.map(name => readUserOrDefault(name));
  KyberPrivacyPresets.apply("standard");
  Assert.deepEqual(
    ALL_PREFS.map(name => readUserOrDefault(name)),
    before,
    "applying Standard changes no value"
  );
  Assert.equal(KyberPrivacyPresets.current(), "standard", "still Standard");
  closePane();
});

function readUserOrDefault(name) {
  return Services.prefs.prefHasUserValue(name)
    ? readUser(name)
    : readDefault(name);
}

add_task(async function test_strict_sets_resist_fingerprinting() {
  freshProfile();
  let doc = await openPane();
  Assert.ok(warning(doc).hidden, "no warning under Standard");

  let radioEl = radio(doc, "strict");
  await radioEl.updateComplete;
  let input = radioEl.inputEl;
  input.click();
  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref("privacy.resistFingerprinting"),
    "resistFingerprinting turned on"
  );

  for (let [name, value] of Object.entries(PRESETS.strict)) {
    Assert.strictEqual(readUserOrDefault(name), value, name);
  }
  Assert.strictEqual(
    Services.prefs.getBoolPref("privacy.resistFingerprinting.letterboxing"),
    true,
    "letterboxing is on"
  );
  Assert.equal(KyberPrivacyPresets.current(), "strict", "current is Strict");
  Assert.equal(
    Services.prefs.getStringPref(RECORD_PREF),
    "strict",
    "the preset is recorded"
  );
  Assert.equal(selected(doc), "strict", "the pane selects Strict");
  closePane();
});

add_task(async function test_manual_change_reports_custom() {
  freshProfile();
  KyberPrivacyPresets.apply("strict");
  let doc = await openPane();
  Assert.equal(selected(doc), "strict", "the pane starts on Strict");

  Services.prefs.setBoolPref("webgl.disabled", false);
  Assert.equal(KyberPrivacyPresets.current(), "custom", "current is Custom");
  await TestUtils.waitForCondition(
    () => selected(doc) == "custom",
    "the radio follows to Custom"
  );
  Assert.ok(radio(doc, "custom").disabled, "Custom cannot be picked");
  Assert.ok(warning(doc).hidden, "no Strict warning under Custom");
  closePane();
});

add_task(async function test_strict_warns_about_timezone() {
  freshProfile();
  KyberPrivacyPresets.apply("strict");
  let doc = await openPane();
  let bar = warning(doc);
  await TestUtils.waitForCondition(
    () => !bar.hidden && bar.message,
    "the warning shows under Strict"
  );
  Assert.ok(
    /some sites may break/i.test(bar.message),
    `the warning says sites may break: ${bar.message}`
  );
  Assert.ok(
    /UTC/.test(bar.message),
    `the warning says the clock reads as UTC: ${bar.message}`
  );
  closePane();
});
