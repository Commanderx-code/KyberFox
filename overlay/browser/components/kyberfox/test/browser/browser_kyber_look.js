/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The Kyber look: the Kyber Crystal, Crimson and Azure themes, the default
// and fallback rules, the one-time move from Ember, and the glow switch.
const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);

const ID_PREF = "kyberfox.theme.id";
const DISABLED_PREF = "kyberfox.theme.disabled";
const MOVED_PREF = "kyberfox.theme.movedToKyber";
const GLOW_PREF = "kyberfox.theme.reduceGlow";
const KYBER = {
  "kyber-crystal": "Kyber Crystal",
  "kyber-crimson": "Crimson",
  "kyber-azure": "Azure",
};
const hadId = Services.prefs.prefHasUserValue(ID_PREF);
const oldId = Services.prefs.getStringPref(ID_PREF, "kyber-crystal");

registerCleanupFunction(() => {
  for (let pref of [DISABLED_PREF, GLOW_PREF]) {
    Services.prefs.clearUserPref(pref);
  }
  KyberThemes._skinSheetFailsForTests = false;
  KyberThemes.apply(oldId);
  if (!hadId) {
    Services.prefs.clearUserPref(ID_PREF);
  }
  Services.prefs.setBoolPref(MOVED_PREF, true);
});

/** Runs init() as on a start with the given stored state. */
function restart({ id, moved }) {
  KyberThemes._resetForTests();
  if (id === undefined) {
    Services.prefs.clearUserPref(ID_PREF);
  } else {
    Services.prefs.setStringPref(ID_PREF, id);
  }
  if (moved === undefined) {
    Services.prefs.clearUserPref(MOVED_PREF);
  } else {
    Services.prefs.setBoolPref(MOVED_PREF, moved);
  }
  KyberThemes.init();
}

function glowStrength(win = window) {
  return win
    .getComputedStyle(win.document.documentElement)
    .getPropertyValue("--kyber-glow-strength")
    .trim();
}

add_task(function test_three_kyber_themes_listed() {
  let listed = Object.fromEntries(
    KyberThemes.available()
      .filter(t => KyberThemes.isKyber(t.id))
      .map(t => [t.id, [t.name, t.kind]])
  );
  Assert.deepEqual(
    listed,
    Object.fromEntries(
      Object.entries(KYBER).map(([id, name]) => [id, [name, "skin"]])
    )
  );
  Assert.ok(!KyberThemes.isKyber("ember"), "ember is not a Kyber theme");
});

add_task(function test_default_is_kyber_crystal() {
  restart({});
  Assert.equal(KyberThemes.current(), "kyber-crystal");
  Assert.ok(Services.prefs.getBoolPref(MOVED_PREF), "the move is recorded");
});

add_task(function test_ember_moves_once() {
  restart({ id: "ember" });
  Assert.equal(KyberThemes.current(), "kyber-crystal", "ember was moved");
  KyberThemes.apply("ember");
  restart({ id: "ember", moved: true });
  Assert.equal(KyberThemes.current(), "ember", "a second start keeps ember");
});

add_task(function test_other_saved_theme_kept() {
  restart({ id: "frost" });
  Assert.equal(KyberThemes.current(), "frost");
  Assert.ok(Services.prefs.getBoolPref(MOVED_PREF));
});

add_task(function test_disabled_kyber_falls_back_to_ember() {
  Services.prefs.setStringPref(DISABLED_PREF, "kyber-crystal");
  KyberThemes.apply("kyber-crystal");
  Assert.equal(KyberThemes.current(), "ember");
  Services.prefs.clearUserPref(DISABLED_PREF);
});

add_task(function test_failing_kyber_skin_falls_back_to_ember() {
  KyberThemes._skinSheetFailsForTests = true;
  KyberThemes.apply("kyber-azure");
  KyberThemes._skinSheetFailsForTests = false;
  Assert.equal(KyberThemes.current(), "ember");
});

add_task(async function test_reduce_glow() {
  KyberThemes.apply("kyber-crystal");
  Assert.equal(glowStrength(), "1", "full glow by default");
  KyberThemes.setReduceGlow(true);
  Assert.ok(KyberThemes.reduceGlow());
  Assert.equal(glowStrength(), "0.25");
  KyberThemes.setReduceGlow(false);
  Assert.equal(glowStrength(), "1");
  Services.prefs.setBoolPref(GLOW_PREF, true);
  await TestUtils.waitForCondition(() => glowStrength() == "0.25");
  Services.prefs.clearUserPref(GLOW_PREF);
  await TestUtils.waitForCondition(() => glowStrength() == "1");
});
