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

add_task(async function test_kyber_fonts_load() {
  KyberThemes.apply("kyber-crystal");
  for (let face of ['700 16px "Kyber Sora"', '400 16px "Kyber Inter"']) {
    let loaded = await document.fonts.load(face);
    Assert.equal(loaded.length, 1, `${face} loads from the bundled file`);
  }
  KyberThemes.apply("ember");
  let none = await document.fonts.load('700 16px "Kyber Sora"');
  Assert.equal(none.length, 0, "the fonts are gone with a non-Kyber theme");
});

// The window skin (themes/kyber/chrome.css).

function urlbarShadow(win = window) {
  return win.getComputedStyle(
    win.document.querySelector("#urlbar .urlbar-background")
  ).boxShadow;
}

function blurRadius(shadow) {
  // "rgba(…) 0px 0px 12px" or "0px 0px 12px rgba(…)": the third length.
  let lengths = shadow.match(/-?[\d.]+px/g) ?? [];
  return parseFloat(lengths[2] ?? "0");
}

add_task(async function test_urlbar_has_glow() {
  KyberThemes.apply("ember");
  let stock = urlbarShadow();
  KyberThemes.apply("kyber-crystal");
  Assert.notEqual(urlbarShadow(), "none", "the address bar glows");
  Assert.notEqual(urlbarShadow(), stock, "the glow is the skin's");
  Assert.greaterOrEqual(blurRadius(urlbarShadow()), 10, "a full glow");
  KyberThemes.apply("ember");
  Assert.equal(urlbarShadow(), stock, "no glow under ember");
});

add_task(function test_reduce_glow_shrinks_shadow() {
  KyberThemes.apply("kyber-crystal");
  KyberThemes.setReduceGlow(true);
  Assert.greater(blurRadius(urlbarShadow()), 0, "still a glow");
  Assert.lessOrEqual(blurRadius(urlbarShadow()), 3, "reduced glow");
  KyberThemes.setReduceGlow(false);
});

add_task(function test_selected_tab_rounded() {
  let bg = gBrowser.selectedTab.querySelector(".tab-background");
  KyberThemes.apply("ember");
  let stock = getComputedStyle(bg).boxShadow;
  KyberThemes.apply("kyber-crystal");
  Assert.equal(getComputedStyle(bg).borderTopLeftRadius, "10px");
  Assert.notEqual(getComputedStyle(bg).boxShadow, stock, "outlined glow");
  Assert.greater(blurRadius(getComputedStyle(bg).boxShadow), 0, "it glows");
});

add_task(function test_tabstrip_logo() {
  KyberThemes.apply("kyber-crystal");
  let items = document.querySelector("#TabsToolbar .toolbar-items");
  let before = getComputedStyle(items, "::before");
  Assert.ok(before.content.includes("Kyber Fox"), "name at the tab strip");
  Assert.ok(before.backgroundImage.includes("icon32.png"), "the real logo");
  KyberThemes.apply("ember");
  Assert.equal(
    getComputedStyle(items, "::before").content,
    "none",
    "gone under ember"
  );
});

add_task(async function test_private_pill() {
  KyberThemes.apply("kyber-crystal");
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let pill = win.document.querySelector(
    "#nav-bar > .private-browsing-indicator-with-label"
  );
  Assert.notEqual(win.getComputedStyle(pill).display, "none", "pill shown");
  Assert.equal(
    win.getComputedStyle(pill.querySelector("label")).textTransform,
    "uppercase"
  );
  let button = win.document.querySelector(
    "#nav-bar > .private-browsing-indicator-button"
  );
  if (button) {
    Assert.equal(win.getComputedStyle(button).display, "none", "no second mask");
  }
  await BrowserTestUtils.closeWindow(win);
});
