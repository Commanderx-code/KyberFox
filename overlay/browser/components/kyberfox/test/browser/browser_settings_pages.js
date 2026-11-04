/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /can't assign to property "value" on (true|false)/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /No Setting with id "kyberfoxWebGLPrompt(Hide)?"/
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

async function withPane(pane, readyId, task) {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `about:preferences#${pane}`
  );
  try {
    let doc = tab.linkedBrowser.contentDocument;
    await TestUtils.waitForCondition(
      () => doc.getElementById(readyId),
      `${pane} controls loaded`
    );
    await doc.getElementById(readyId).updateComplete;
    await task(doc, doc.defaultView);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

add_task(async function test_theme_gallery_keyboard_skips_disabled_cards() {
  await SpecialPowers.pushPrefEnv({
    set: [["kyberfox.theme.disabled", "kyber-crimson,gx,one"]],
  });
  try {
    await withPane("appearance", "kyberfoxTheme", async (doc, win) => {
      let picker = doc.getElementById("kyberfoxTheme");
      let cards = () => [...picker.shadowRoot.querySelectorAll("button.card")];
      Assert.deepEqual(
        cards()
          .slice(0, 3)
          .map(c => c.dataset.themeId),
        ["kyber-crystal", "kyber-crimson", "kyber-azure"]
      );
      Assert.equal(
        cards().filter(c => c.tabIndex == 0).length,
        1,
        "one tab stop for the gallery"
      );
      cards()
        .find(c => c.dataset.themeId == "kyber-crystal")
        .focus();
      let shortcut = new win.KeyboardEvent("keydown", {
        key: "Home",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      picker.shadowRoot.activeElement.dispatchEvent(shortcut);
      Assert.ok(
        !shortcut.defaultPrevented,
        "theme navigation leaves Alt+Home to the browser"
      );
      EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
      await TestUtils.waitForCondition(
        () =>
          KyberThemes.current() == "kyber-azure" &&
          picker.shadowRoot.activeElement?.dataset.themeId == "kyber-azure",
        "arrow navigation skips a disabled theme and applies Azure"
      );
      Assert.equal(
        cards().find(c => c.tabIndex == 0).dataset.themeId,
        "kyber-azure"
      );
      EventUtils.synthesizeKey("KEY_End", {}, win);
      await TestUtils.waitForCondition(
        () =>
          KyberThemes.current() == "starry" &&
          picker.shadowRoot.activeElement?.dataset.themeId == "starry",
        "End reaches the last enabled theme"
      );
      EventUtils.synthesizeKey("KEY_Home", {}, win);
      await TestUtils.waitForCondition(
        () =>
          KyberThemes.current() == "kyber-crystal" &&
          picker.shadowRoot.activeElement?.dataset.themeId == "kyber-crystal",
        "Home returns to Crystal"
      );
      Assert.equal(
        cards().filter(c => c.getAttribute("aria-checked") == "true").length,
        1
      );
    });
  } finally {
    await SpecialPowers.popPrefEnv();
    KyberThemes.apply("kyber-crystal");
  }
});

add_task(async function test_search_controls_change_real_default_engines() {
  await SearchService.init();
  let normal = SearchService.defaultEngine;
  let privateEngine = SearchService.defaultPrivateEngine;
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.separatePrivateDefault", true],
      ["browser.search.separatePrivateDefault.ui.enabled", true],
    ],
  });
  try {
    await withPane("search", "defaultPrivateEngine", async (doc, win) => {
      let engine = SearchService.getEngineByName("Brave Search");
      Assert.ok(engine, "the existing policy search engine is available");
      let regular = doc.getElementById("defaultEngineNormal");
      regular.value = engine.id;
      regular.dispatchEvent(new win.Event("change", { bubbles: true }));
      await TestUtils.waitForCondition(
        () => SearchService.defaultEngine.id == engine.id,
        "the regular search choice reaches the search service"
      );
      let privateChoice = doc.getElementById("defaultPrivateEngine");
      let privateTarget = (await SearchService.getVisibleEngines()).find(
        candidate =>
          candidate.id != SearchService.defaultPrivateEngine.id &&
          candidate.id != engine.id
      );
      Assert.ok(privateTarget, "a separate private provider is available");
      privateChoice.value = privateTarget.id;
      privateChoice.dispatchEvent(new win.Event("change", { bubbles: true }));
      await TestUtils.waitForCondition(
        () => SearchService.defaultPrivateEngine.id == privateTarget.id,
        "the private search choice reaches the search service"
      );
      Assert.equal(
        SearchService.defaultEngine.id,
        engine.id,
        "private selection leaves the regular provider intact"
      );
    });
  } finally {
    await SearchService.setDefault(normal, SearchService.CHANGE_REASON.USER);
    await SearchService.setDefaultPrivate(
      privateEngine,
      SearchService.CHANGE_REASON.USER
    );
    await SpecialPowers.popPrefEnv();
  }
});

add_task(
  async function test_camera_permissions_dialog_preserves_site_permission() {
    let principal =
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(
        "https://settings.example"
      );
    Services.perms.addFromPrincipal(
      principal,
      "camera",
      Services.perms.ALLOW_ACTION
    );
    try {
      await withPane(
        "permissionsData",
        "cameraSettingsButton",
        async (doc, win) => {
          doc
            .getElementById("cameraSettingsButton")
            .shadowRoot.querySelector("button")
            .click();
          await TestUtils.waitForCondition(
            () =>
              win.gSubDialog?._topDialog?._frame?.contentDocument?.getElementById(
                "permissionsBox"
              )?.itemCount > 0,
            "the native camera permissions dialog contains the site"
          );
          let dialogDoc = win.gSubDialog._topDialog._frame.contentDocument;
          Assert.stringContains(dialogDoc.documentURI, "sitePermissions.xhtml");
          Assert.equal(
            Services.perms.testPermissionFromPrincipal(principal, "camera"),
            Services.perms.ALLOW_ACTION
          );
          Assert.equal(
            dialogDoc.defaultView
              .getComputedStyle(dialogDoc.documentElement)
              .getPropertyValue("--background-color-canvas")
              .trim(),
            "#0a0f2d",
            "permission dialogs use the Kyber surface"
          );
          dialogDoc.querySelector("dialog").getButton("cancel").click();
          Assert.equal(
            Services.perms.testPermissionFromPrincipal(principal, "camera"),
            Services.perms.ALLOW_ACTION,
            "Cancel preserves the existing permission"
          );
        }
      );
    } finally {
      Services.perms.removeFromPrincipal(principal, "camera");
    }
  }
);

add_task(async function test_pages_fit_narrow_windows() {
  let width = window.outerWidth;
  let height = window.outerHeight;
  try {
    window.resizeTo(600, 700);
    for (let [pane, ready] of [
      ["appearance", "kyberfoxTheme"],
      ["search", "defaultEngineNormal"],
      ["permissionsData", "cameraSettingsButton"],
    ]) {
      await withPane(pane, ready, async (doc, win) => {
        await TestUtils.waitForCondition(
          () => win.innerWidth <= 600,
          "the narrow viewport is ready"
        );
        let main = doc.querySelector(".main-content");
        Assert.lessOrEqual(
          main.scrollWidth,
          main.clientWidth + 1,
          `${pane} has no horizontal overflow`
        );
        if (pane == "search") {
          let before = (await SearchService.getVisibleEngines()).length;
          doc.getElementById("addEngineButton").click();
          await TestUtils.waitForCondition(
            () =>
              win.gSubDialog?._topDialog?._frame?.contentDocument?.documentURI.includes(
                "addEngine.xhtml"
              ),
            "the native search editor opens"
          );
          let frame = win.gSubDialog._topDialog._frame;
          let editor = frame.contentDocument;
          await TestUtils.waitForCondition(
            () =>
              editor.querySelector("dialog")?._buttons?.cancel &&
              frame.parentElement.getBoundingClientRect().right <=
                win.innerWidth,
            "the search editor fits the viewport"
          );
          editor.querySelector("dialog").getButton("cancel").click();
          Assert.equal(
            (await SearchService.getVisibleEngines()).length,
            before,
            "Cancel does not add a search engine"
          );
        }
        if (pane == "permissionsData") {
          doc
            .getElementById("cameraSettingsButton")
            .shadowRoot.querySelector("button")
            .click();
          await TestUtils.waitForCondition(
            () =>
              win.gSubDialog?._topDialog?._frame?.contentDocument?.getElementById(
                "permissionsBox"
              ),
            "the camera dialog opens in a narrow window"
          );
          let frame = win.gSubDialog._topDialog._frame;
          let dialogDoc = frame.contentDocument;
          await dialogDoc.fonts.ready;
          await TestUtils.waitForCondition(
            () => dialogDoc.querySelector("dialog")?._buttons?.accept,
            "the native dialog buttons are initialized"
          );
          await TestUtils.waitForCondition(
            () =>
              frame.parentElement.getBoundingClientRect().right <=
              win.innerWidth,
            "the dialog fits the narrow viewport"
          );
          Assert.greaterOrEqual(
            frame.parentElement.getBoundingClientRect().left,
            0,
            "the dialog stays inside the left edge"
          );
          let accept = dialogDoc.querySelector("dialog").getButton("accept");
          Assert.lessOrEqual(
            accept.getBoundingClientRect().right,
            dialogDoc.defaultView.innerWidth + 1,
            "Save changes remains visible"
          );
          dialogDoc.querySelector("dialog").getButton("cancel").click();
        }
      });
    }
  } finally {
    window.resizeTo(width, height);
  }
});
