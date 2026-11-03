/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The theme engine: user sheets that restyle the browser window.
const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);

const ID_PREF = "kyberfox.theme.id";
const DISABLED_PREF = "kyberfox.theme.disabled";
const hadId = Services.prefs.prefHasUserValue(ID_PREF);
const oldId = Services.prefs.getStringPref(ID_PREF, "ember");

// Apply the old theme first, so the id pref is rewritten before it is restored.
registerCleanupFunction(() => {
  Services.prefs.clearUserPref(DISABLED_PREF);
  KyberThemes.apply(oldId);
  if (!hadId) {
    Services.prefs.clearUserPref(ID_PREF);
  }
});

function bg(win, selector) {
  return win.getComputedStyle(win.document.querySelector(selector))
    .backgroundColor;
}

add_task(async function test_available_lists_the_seven() {
  let ids = KyberThemes.available()
    .filter(t => t.kind == "color")
    .map(t => t.id)
    .sort();
  Assert.deepEqual(
    ids,
    [
      "catppuccin",
      "ember",
      "frost",
      "paper",
      "starry",
      "terminal",
      "tokyo-night",
    ],
    "seven color themes"
  );
  Assert.ok(KyberThemes.palette("paper").vars["--kf-bg"], "palette accessor");
});

add_task(async function test_apply_changes_toolbar_color() {
  KyberThemes.apply("ember");
  let ember = bg(window, "#nav-bar");
  KyberThemes.apply("paper");
  let paper = bg(window, "#nav-bar");
  Assert.notEqual(ember, paper, "the toolbar color changed");
  Assert.equal(paper, "rgb(250, 245, 234)", "paper toolbar color");
  Assert.equal(KyberThemes.current(), "paper", "current()");
  Assert.equal(
    getComputedStyle(document.documentElement).colorScheme,
    "light",
    "light color scheme on the chrome root"
  );
  KyberThemes.apply("ember");
  Assert.equal(
    getComputedStyle(document.documentElement).colorScheme,
    "dark",
    "dark color scheme on the chrome root"
  );
});

add_task(async function test_apply_persists_after_new_window() {
  KyberThemes.apply("frost");
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    Assert.equal(
      bg(win, "#nav-bar"),
      "rgb(44, 53, 66)",
      "a new window shows the applied theme"
    );
    Assert.equal(Services.prefs.getStringPref("kyberfox.theme.id"), "frost");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_apply_restyles_an_open_window() {
  KyberThemes.apply("ember");
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    let before = bg(win, "#nav-bar");
    KyberThemes.apply("paper");
    let after = bg(win, "#nav-bar");
    Assert.notEqual(before, after, "the second window changed");
    Assert.equal(after, "rgb(250, 245, 234)", "paper toolbar color");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_paper_uses_serif() {
  KyberThemes.apply("paper");
  let font = getComputedStyle(
    document.getElementById("navigator-toolbox")
  ).fontFamily;
  Assert.ok(font.includes("Georgia"), `serif font: ${font}`);
});

add_task(async function test_terminal_has_square_corners() {
  KyberThemes.apply("terminal");
  let radius = getComputedStyle(
    gBrowser.selectedTab.querySelector(".tab-background")
  ).borderTopLeftRadius;
  Assert.equal(radius, "0px", "tab corners are square");
  let urlbar = getComputedStyle(
    gURLBar.querySelector(".urlbar-background")
  ).borderTopLeftRadius;
  Assert.equal(urlbar, "0px", "urlbar corners are square");
});

add_task(async function test_unknown_id_falls_back_to_ember() {
  KyberThemes.apply("no-such-theme");
  Assert.equal(KyberThemes.current(), "ember", "current() is ember");
  Assert.equal(
    Services.prefs.getStringPref("kyberfox.theme.id"),
    "ember",
    "ember is written back"
  );
  Assert.equal(bg(window, "#nav-bar"), "rgb(43, 42, 51)", "ember toolbar");
});

add_task(async function test_status_disabled_skin_falls_back_to_ember() {
  Services.prefs.setStringPref("kyberfox.theme.disabled", "starry");
  Assert.ok(
    KyberThemes.available().find(t => t.id == "starry").disabled,
    "starry is listed as disabled"
  );
  KyberThemes.apply("starry");
  Assert.equal(KyberThemes.current(), "ember", "disabled id gives ember");
  Assert.equal(Services.prefs.getStringPref("kyberfox.theme.id"), "ember");
  Services.prefs.clearUserPref("kyberfox.theme.disabled");
  KyberThemes.apply("starry");
  Assert.equal(KyberThemes.current(), "starry", "enabled again");
});
