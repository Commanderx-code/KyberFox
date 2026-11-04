/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);
const savedTheme = KyberThemes.current();
registerCleanupFunction(() => KyberThemes.apply(savedTheme));

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.display.document_color_use", 1],
      ["ui.prefersContrast", 0],
    ],
  });
  KyberThemes.apply("kyber-crystal");
});

async function settingsTab(task) {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#privacy"
  );
  try {
    let doc = tab.linkedBrowser.contentDocument;
    await TestUtils.waitForCondition(
      () => doc.getElementById("kyberfoxRecommendedAddonsLink"),
      "privacy controls loaded"
    );
    await task(doc, doc.defaultView);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

add_task(async function test_settings_navigation_and_theme_switch() {
  await settingsTab(async (doc, win) => {
    let search = doc.getElementById("searchInput");
    let wide = win.matchMedia("(min-width: 951px)").matches;
    Assert.equal(
      search.parentElement.id,
      wide ? "categories" : "search-container",
      "the real search control follows the layout"
    );
    let presets = doc.getElementById("kyberfoxPrivacyPreset");
    await TestUtils.waitForCondition(
      () => presets.orientation == (wide ? "horizontal" : "vertical"),
      "native preset controls follow the visual orientation"
    );
    let card = doc.querySelector(
      'setting-group[groupid="kyberfoxPrivacyPresets"] moz-card'
    );
    Assert.equal(
      win.getComputedStyle(card).borderTopWidth,
      "1px",
      "Kyber cards have a thin outline"
    );
    let privacy = doc.getElementById("category-privacy");
    let selected = privacy.shadowRoot.querySelector("button");
    Assert.equal(selected.getAttribute("aria-selected"), "true");
    let style = win.getComputedStyle(doc.getElementById("categories"));
    Assert.equal(
      style.getPropertyValue("--page-nav-button-indicator-width").trim(),
      "3px"
    );
    Assert.notEqual(
      win.getComputedStyle(selected).color,
      "rgb(0, 0, 0)",
      "selected navigation uses light text"
    );

    let appearance = doc.getElementById("category-appearance");
    appearance.shadowRoot.querySelector("button").click();
    await TestUtils.waitForCondition(
      () => doc.getElementById("kyberfoxThemeImport"),
      "real Appearance controls are reachable"
    );
    Assert.equal(
      appearance.shadowRoot
        .querySelector("button")
        .getAttribute("aria-selected"),
      "true"
    );

    KyberThemes.apply("kyber-crimson");
    await TestUtils.waitForCondition(
      () =>
        win
          .getComputedStyle(doc.documentElement)
          .getPropertyValue("--kf-accent")
          .trim() == KyberThemes.palette("kyber-crimson").vars["--kf-accent"],
      "settings follow another Kyber theme without reloading"
    );
    KyberThemes.apply("ember");
    Assert.equal(
      search.parentElement.id,
      "search-container",
      "native search position is restored with other themes"
    );
    Assert.notEqual(
      win
        .getComputedStyle(doc.getElementById("categories"))
        .getPropertyValue("--page-nav-button-indicator-width")
        .trim(),
      "3px",
      "custom navigation styling is removed with the skin"
    );
    KyberThemes.apply("kyber-crystal");
  });
});

add_task(async function test_application_menu_keyboard() {
  KyberThemes.apply("kyber-crystal");
  let popup = document.getElementById("appMenu-popup");
  let shown = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  PanelUI.show();
  await shown;
  try {
    let rect = popup.getBoundingClientRect();
    Assert.greaterOrEqual(
      rect.width,
      200,
      "the native menu has room for its commands"
    );
    Assert.lessOrEqual(
      rect.right,
      window.innerWidth,
      "the menu fits the window"
    );
    let header = getComputedStyle(
      document.querySelector("#appMenu-mainView > .panel-subview-body"),
      "::before"
    );
    Assert.ok(
      !header.backgroundImage.includes("icon64.png"),
      "no added fox header"
    );
    EventUtils.synthesizeKey("KEY_ArrowDown");
    Assert.ok(
      popup.contains(document.activeElement),
      "keyboard navigation focuses a real menu control"
    );
    let hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
    EventUtils.synthesizeKey("KEY_Escape");
    await hidden;
    Assert.equal(popup.state, "closed", "Escape dismisses the menu");
  } finally {
    if (popup.state != "closed") {
      let hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
      PanelUI.hide();
      await hidden;
    }
  }
});

add_task(async function test_settings_respects_high_contrast() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.display.document_color_use", 2]],
  });
  try {
    await settingsTab(async (doc, win) => {
      let style = win.getComputedStyle(doc.getElementById("categories"));
      Assert.notEqual(
        style.getPropertyValue("--page-nav-button-indicator-width").trim(),
        "3px",
        "custom navigation styling gives way to high contrast"
      );
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_settings_search_and_responsive_layout() {
  KyberThemes.apply("kyber-crystal");
  let width = window.outerWidth;
  let height = window.outerHeight;
  try {
    await settingsTab(async (doc, win) => {
      let search = doc.getElementById("searchInput");
      search.value = "cookies";
      search.dispatchEvent(new win.Event("input", { bubbles: true }));
      await TestUtils.waitForCondition(
        () => !doc.getElementById("header-searchResults").hidden,
        "native settings search still finds results"
      );
      Assert.equal(
        doc.getElementById("searchInput"),
        search,
        "search uses the same native control"
      );
      search.value = "";
      search.dispatchEvent(new win.Event("input", { bubbles: true }));
      await TestUtils.waitForCondition(
        () => doc.getElementById("header-searchResults").hidden,
        "native search results have cleared before resizing"
      );
      search.focus();
      await TestUtils.waitForCondition(
        () => doc.activeElement == search,
        "the search field is focused before resizing"
      );
      window.resizeTo(600, 700);
      await TestUtils.waitForCondition(
        () => search.parentElement.id == "search-container",
        "narrow windows restore the search field to the main pane"
      );
      await TestUtils.waitForCondition(
        () => doc.activeElement == search,
        "focused search survives the layout change"
      );
      Assert.equal(
        doc.getElementById("kyberfoxPrivacyPreset").orientation,
        "vertical",
        "narrow preset controls keep vertical keyboard navigation"
      );
      let main = doc.querySelector(".main-content");
      Assert.lessOrEqual(
        main.scrollWidth,
        main.clientWidth + 1,
        "the main pane has no horizontal overflow"
      );
      Assert.lessOrEqual(
        doc.documentElement.scrollWidth,
        win.innerWidth,
        "settings fit the narrow viewport"
      );
    });
  } finally {
    window.resizeTo(width, height);
  }
});

add_task(async function test_disabled_skin_restores_native_search_position() {
  KyberThemes.apply("kyber-crystal");
  await settingsTab(async doc => {
    await SpecialPowers.pushPrefEnv({
      set: [["kyberfox.theme.disabled", "kyber-crystal"]],
    });
    try {
      KyberThemes.apply("kyber-crystal");
      Assert.equal(KyberThemes.current(), "ember");
      Assert.equal(
        doc.getElementById("searchInput").parentElement.id,
        "search-container",
        "fallback restores native layout even when the stored choice is kept"
      );
    } finally {
      await SpecialPowers.popPrefEnv();
      KyberThemes.apply("kyber-crystal");
    }
  });
});
