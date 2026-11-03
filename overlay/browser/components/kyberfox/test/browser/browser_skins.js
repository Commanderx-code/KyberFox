/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The GX-style and One-style skins: full user-sheet skins applied by the
// theme engine, with their prefs saved and restored.
const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);

const ID_PREF = "kyberfox.theme.id";
const DISABLED_PREF = "kyberfox.theme.disabled";
const BACKUP_PREF = "kyberfox.theme.skinPrefBackup";
const hadId = Services.prefs.prefHasUserValue(ID_PREF);
const oldId = Services.prefs.getStringPref(ID_PREF, "ember");

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref(DISABLED_PREF);
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
  KyberThemes.apply(oldId);
  if (!hadId) {
    Services.prefs.clearUserPref(ID_PREF);
  }
  Services.prefs.clearUserPref(BACKUP_PREF);
});

function manifest(id) {
  return JSON.parse(
    Cu.readUTF8URI(
      Services.io.newURI(
        `chrome://kyberfox/content/themes/skins/${id}/skin.json`
      )
    )
  );
}

function visibleSize(selector) {
  let el = document.querySelector(selector);
  let r = el?.getBoundingClientRect();
  return { found: !!el, w: r?.width ?? 0, h: r?.height ?? 0 };
}

add_task(async function test_skins_are_listed() {
  let skins = KyberThemes.available().filter(t => t.kind == "skin");
  Assert.deepEqual(
    skins.map(t => t.id),
    ["gx", "one"],
    "both skins are listed with kind skin"
  );
  for (let { id } of skins) {
    let p = KyberThemes.palette(id);
    Assert.equal(p.kind, "skin", `${id} palette kind`);
    Assert.ok(p.vars["--kf-bg"] && p.vars["--kf-accent"], `${id} preview vars`);
    let m = manifest(id);
    Assert.equal(m.sheets.at(-1), "userChrome.css", `${id} sheet list`);
    Assert.ok(
      !("toolkit.legacyUserProfileCustomizations.stylesheets" in m.prefs)
    );
  }
});

add_task(async function test_skin_applies_on_shipped_firefox() {
  for (let id of ["gx", "one"]) {
    KyberThemes.apply(id);
    Assert.equal(KyberThemes.current(), id, `${id} is current`);
    Assert.equal(Services.prefs.getStringPref(ID_PREF), id, `${id} is stored`);
    // Both skins draw the browser window; give layout a moment.
    await new Promise(r =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
    Assert.equal(
      getComputedStyle(document.documentElement).colorScheme,
      "dark",
      `${id}: color-scheme from the manifest`
    );
    for (let sel of ["#TabsToolbar", "#urlbar", "#PanelUI-menu-button"]) {
      let size = visibleSize(sel);
      Assert.ok(size.found, `${id}: ${sel} exists`);
      Assert.greater(size.w, 0, `${id}: ${sel} has width`);
      Assert.greater(size.h, 0, `${id}: ${sel} has height`);
    }
    Assert.notEqual(
      getComputedStyle(document.querySelector("#nav-bar")).backgroundColor,
      "rgba(0, 0, 0, 0)",
      `${id}: toolbar is painted`
    );

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );
    let size = visibleSize("#tabbrowser-tabs .tabbrowser-tab[selected]");
    Assert.greater(size.w, 0, `${id}: new tab has width`);
    Assert.greater(size.h, 0, `${id}: new tab has height`);
    // The skin must not reach web pages.
    let leaked = await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
      content
        .getComputedStyle(content.document.documentElement)
        .getPropertyValue("--general-color")
    );
    Assert.equal(leaked, "", `${id}: the page does not see the skin`);
    BrowserTestUtils.removeTab(tab);
  }
  KyberThemes.apply("ember");
});

add_task(async function test_skin_prefs_restored_on_switch() {
  let gx = manifest("gx").prefs;
  let one = manifest("one").prefs;
  let both = Object.keys(gx).filter(n => n in one);
  let onlyGx = Object.keys(gx).filter(n => !(n in one));
  Assert.ok(both.length && onlyGx.length, "the skins share some prefs");

  // One pref the user changed, the rest at their defaults.
  const MINE = "browser.tabs.delayHidingAudioPlayingIconMS";
  Assert.ok(MINE in gx && MINE in one, "test pref belongs to both skins");
  let mineBefore = Services.prefs.prefHasUserValue(MINE)
    ? Services.prefs.getIntPref(MINE)
    : null;
  Services.prefs.setIntPref(MINE, 321);
  for (let n of [...Object.keys(gx), ...Object.keys(one)]) {
    if (n != MINE) {
      Assert.ok(!Services.prefs.prefHasUserValue(n), `${n} starts at default`);
    }
  }

  KyberThemes.apply("gx");
  for (let [n, v] of Object.entries(gx)) {
    Assert.equal(readPref(n), v, `gx sets ${n}`);
  }
  let backup = JSON.parse(Services.prefs.getStringPref(BACKUP_PREF));
  Assert.deepEqual(backup[MINE], { had: true, value: 321 }, "user value saved");
  Assert.deepEqual(
    backup[onlyGx[0]],
    { had: false },
    "an unset pref is recorded as unset"
  );

  // gx -> one: gx's values go back before one's are set.
  KyberThemes.apply("one");
  for (let n of onlyGx) {
    Assert.ok(!Services.prefs.prefHasUserValue(n), `${n} restored on switch`);
  }
  for (let [n, v] of Object.entries(one)) {
    Assert.equal(readPref(n), v, `one sets ${n}`);
  }
  backup = JSON.parse(Services.prefs.getStringPref(BACKUP_PREF));
  Assert.deepEqual(
    backup[MINE],
    { had: true, value: 321 },
    "the second backup holds the user value, not gx's"
  );

  // Restart in the middle of a skin: the backup must not be taken again.
  KyberThemes._resetForTests();
  KyberThemes.init();
  Assert.equal(KyberThemes.current(), "one", "one comes back after a restart");
  Assert.deepEqual(
    JSON.parse(Services.prefs.getStringPref(BACKUP_PREF))[MINE],
    { had: true, value: 321 },
    "the backup was kept"
  );

  KyberThemes.apply("paper");
  for (let n of Object.keys(one)) {
    if (n == MINE) {
      Assert.equal(readPref(n), 321, "user value is back");
    } else {
      Assert.ok(!Services.prefs.prefHasUserValue(n), `${n} back at default`);
    }
  }
  Assert.ok(!Services.prefs.prefHasUserValue(BACKUP_PREF), "backup cleared");

  KyberThemes.apply("gx");
  KyberThemes.resetToDefault();
  Assert.ok(
    !Services.prefs.prefHasUserValue(BACKUP_PREF),
    "reset clears it too"
  );
  Assert.equal(readPref(MINE), 321, "reset restores the user value");
  Assert.equal(KyberThemes.current(), "ember", "reset applies ember");
  await KyberThemes.filesSettled();
  if (mineBefore === null) {
    Services.prefs.clearUserPref(MINE);
  } else {
    Services.prefs.setIntPref(MINE, mineBefore);
  }
});

add_task(async function test_disabled_skin_falls_back_to_ember() {
  Services.prefs.setStringPref(DISABLED_PREF, "gx");
  KyberThemes.apply("gx");
  Assert.equal(KyberThemes.current(), "ember", "gx is off");
  Assert.ok(
    !Services.prefs.prefHasUserValue("layout.css.corner-shape.enabled"),
    "no skin pref was set"
  );
  Assert.ok(!Services.prefs.prefHasUserValue(BACKUP_PREF), "nothing saved");
  Assert.ok(
    KyberThemes.available().find(t => t.id == "gx").disabled,
    "the card is marked off"
  );
  Services.prefs.clearUserPref(DISABLED_PREF);
  KyberThemes.apply("ember");
});

function readPref(name) {
  switch (Services.prefs.getPrefType(name)) {
    case Services.prefs.PREF_BOOL:
      return Services.prefs.getBoolPref(name);
    case Services.prefs.PREF_INT:
      return Services.prefs.getIntPref(name);
    default:
      return Services.prefs.getStringPref(name);
  }
}
