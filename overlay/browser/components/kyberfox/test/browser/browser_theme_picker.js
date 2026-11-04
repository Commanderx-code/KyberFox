/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The theme group in the Appearance pane: card grid, custom CSS import,
// reset, and the safe-mode skip.
const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);
const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

// Pre-existing faults of the redesigned panes; see browser_privacy_presets.js.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /can't assign to property "value" on (true|false)/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /No Setting with id "kyberfoxWebGLPrompt(Hide)?"/
);

const ID_PREF = "kyberfox.theme.id";
const CUSTOM_PREF = "kyberfox.theme.custom";
const hadId = Services.prefs.prefHasUserValue(ID_PREF);
const oldId = Services.prefs.getStringPref(ID_PREF, "ember");
const customPath = PathUtils.join(
  PathUtils.profileDir,
  "chrome",
  "kyberfox-custom.css"
);
const tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile).path;
const fixtures = [];
const openTabs = [];

registerCleanupFunction(async () => {
  for (let tab of openTabs.splice(0)) {
    BrowserTestUtils.removeTab(tab);
  }
  try {
    MockFilePicker.cleanup();
  } catch (e) {
    // The picker was not mocked when a test failed early.
  }
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
  Services.prefs.clearUserPref("kyberfox.theme.disabled");
  KyberThemes.apply(oldId);
  if (!hadId) {
    Services.prefs.clearUserPref(ID_PREF);
  }
  for (let path of fixtures) {
    await IOUtils.remove(path, { ignoreAbsent: true, recursive: true });
  }
});

async function fixture(name, content) {
  let path = PathUtils.join(tmpDir, `kf-picker-${Date.now()}-${name}`);
  fixtures.push(path);
  if (typeof content == "string") {
    await IOUtils.writeUTF8(path, content);
  } else {
    await IOUtils.write(path, content);
  }
  return new FileUtils.File(path);
}

function navBg(win = window) {
  return win.getComputedStyle(win.document.getElementById("nav-bar"))
    .backgroundColor;
}

async function openPane() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#appearance"
  );
  openTabs.push(tab);
  let doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () => doc.getElementById("kyberfoxTheme"),
    "the theme picker is in the pane"
  );
  await doc.getElementById("kyberfoxTheme").updateComplete;
  return doc;
}

function closePane() {
  BrowserTestUtils.removeTab(openTabs.pop());
}

function cards(doc) {
  return [
    ...doc
      .getElementById("kyberfoxTheme")
      .shadowRoot.querySelectorAll("button.card"),
  ];
}

function errorBar(doc) {
  return doc.getElementById("kyberfoxThemeImportError");
}

async function rejects(promise, code) {
  try {
    await promise;
  } catch (e) {
    Assert.equal(e.code, code, `rejected with ${code}`);
    return;
  }
  Assert.ok(false, `expected a ${code} rejection`);
}

add_setup(() => {
  KyberThemes.resetToDefault();
});

add_task(async function test_picker_shows_all_with_previews() {
  let doc = await openPane();
  let shown = cards(doc);
  let available = KyberThemes.available();
  Assert.deepEqual(
    shown.map(c => c.dataset.themeId),
    available.map(t => t.id),
    "one card per available() entry, in order"
  );
  for (let card of shown) {
    let vars = KyberThemes.palette(card.dataset.themeId).vars;
    let preview = card.querySelector(".preview");
    let toolbar = card.querySelector(".toolbar");
    let accent = card.querySelector(".accent");
    let style = doc.defaultView.getComputedStyle.bind(doc.defaultView);
    let probe = doc.createElement("div");
    let expected = color => {
      probe.style.color = color;
      return style(probe).color;
    };
    doc.body.append(probe);
    Assert.equal(
      style(preview).backgroundColor,
      expected(vars["--kf-bg"]),
      `${card.dataset.themeId} preview uses --kf-bg`
    );
    Assert.equal(
      style(toolbar).backgroundColor,
      expected(vars["--kf-bg-toolbar"]),
      `${card.dataset.themeId} band uses --kf-bg-toolbar`
    );
    Assert.equal(
      style(accent).backgroundColor,
      expected(vars["--kf-accent"]),
      `${card.dataset.themeId} band uses --kf-accent`
    );
    probe.remove();
    Assert.ok(
      card.querySelector(".name").textContent.trim(),
      "the card has a name"
    );
  }
  let current = shown.filter(c => c.getAttribute("aria-checked") == "true");
  Assert.equal(current.length, 1, "exactly one current card");
  Assert.equal(
    current[0].dataset.themeId,
    KyberThemes.current(),
    "the current card matches current()"
  );
  closePane();
});

add_task(async function test_disabled_card_is_grayed() {
  Services.prefs.setStringPref("kyberfox.theme.disabled", "starry");
  let doc = await openPane();
  let card = cards(doc).find(c => c.dataset.themeId == "starry");
  Assert.ok(card.disabled, "the disabled theme's card is disabled");
  Assert.ok(card.querySelector("[data-l10n-id=kyberfox-theme-card-off]"));
  closePane();
  Services.prefs.clearUserPref("kyberfox.theme.disabled");
});

add_task(async function test_click_applies_immediately() {
  KyberThemes.apply("ember");
  let doc = await openPane();
  let before = navBg();
  cards(doc)
    .find(c => c.dataset.themeId == "paper")
    .click();
  await TestUtils.waitForCondition(
    () => KyberThemes.current() == "paper",
    "current() became paper"
  );
  Assert.notEqual(navBg(), before, "the toolbar color changed");
  Assert.equal(navBg(), "rgb(250, 245, 234)", "paper toolbar color");
  Assert.equal(Services.prefs.getStringPref(ID_PREF), "paper", "stored");
  await TestUtils.waitForCondition(
    () =>
      cards(doc).find(c => c.getAttribute("aria-checked") == "true")?.dataset
        .themeId == "paper",
    "the paper card is marked current"
  );
  closePane();
  KyberThemes.apply("ember");
});

add_task(async function test_import_valid_css() {
  KyberThemes.apply("ember");
  let file = await fixture(
    "good.css",
    "#nav-bar { background-color: rgb(1, 2, 3) !important; }"
  );
  await KyberThemes.importCustomCss(file);
  Assert.equal(navBg(), "rgb(1, 2, 3)", "the custom rule applies");
  Assert.ok(await IOUtils.exists(customPath), "copied into the profile");
  Assert.equal(
    await IOUtils.readUTF8(customPath),
    await IOUtils.readUTF8(file.path),
    "same bytes"
  );
  Assert.ok(Services.prefs.getBoolPref(CUSTOM_PREF), "custom pref set");

  KyberThemes.apply("paper");
  Assert.equal(navBg(), "rgb(1, 2, 3)", "custom CSS stays above a new theme");

  // A later start registers the stored file again.
  KyberThemes._resetForTests();
  Assert.notEqual(navBg(), "rgb(1, 2, 3)", "reset drops the sheets");
  await KyberThemes.init();
  Assert.equal(navBg(), "rgb(1, 2, 3)", "init() brings the custom file back");
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
});

add_task(async function test_import_through_the_button() {
  KyberThemes.apply("ember");
  let doc = await openPane();
  let file = await fixture(
    "button.css",
    "#nav-bar { background-color: rgb(9, 8, 7) !important; }"
  );
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  MockFilePicker.setFiles([file]);
  doc.getElementById("kyberfoxThemeImport").click();
  await TestUtils.waitForCondition(
    () => navBg() == "rgb(9, 8, 7)",
    "the picked file applied"
  );
  Assert.ok(errorBar(doc).hidden, "no error shown");
  MockFilePicker.cleanup();
  closePane();
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
});

add_task(async function test_import_over_1mb_rejected() {
  KyberThemes.apply("ember");
  let css = "#nav-bar { background-color: red !important; }\n";
  let big = new Uint8Array(1024 * 1024 + 1).fill(32);
  big.set(new TextEncoder().encode(css));
  let file = await fixture("big.css", big);
  await rejects(KyberThemes.importCustomCss(file), "too-large");
  Assert.ok(!Services.prefs.getBoolPref(CUSTOM_PREF, false), "pref unchanged");
  Assert.ok(!(await IOUtils.exists(customPath)), "nothing copied");
  Assert.equal(navBg(), "rgb(43, 42, 51)", "toolbar unchanged");

  // The limit itself is allowed.
  let exact = new Uint8Array(1024 * 1024).fill(32);
  exact.set(new TextEncoder().encode(css));
  await KyberThemes.importCustomCss(await fixture("exact.css", exact));
  Assert.equal(navBg(), "rgb(255, 0, 0)", "exactly 1 MB is accepted");
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();

  // And through the pane, the message names the limit.
  let doc = await openPane();
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  MockFilePicker.setFiles([file]);
  doc.getElementById("kyberfoxThemeImport").click();
  await TestUtils.waitForCondition(
    () => !errorBar(doc).hidden,
    "the error bar shows"
  );
  await TestUtils.waitForCondition(
    () =>
      errorBar(doc).getAttribute("data-l10n-id") ==
      "kyberfox-theme-error-too-large",
    "the too-large message"
  );
  MockFilePicker.cleanup();
  closePane();
});

add_task(async function test_import_rejects_non_css() {
  KyberThemes.apply("ember");
  await rejects(
    KyberThemes.importCustomCss(
      await fixture("style.txt", "#nav-bar { color: red; }")
    ),
    "not-css"
  );
  await rejects(
    KyberThemes.importCustomCss(
      await fixture("words.css", "this is not a style sheet at all")
    ),
    "not-css"
  );
  await rejects(
    KyberThemes.importCustomCss(
      await fixture("binary.css", new Uint8Array([0xff, 0xfe, 0x00, 0x80]))
    ),
    "not-css"
  );
  Assert.ok(!Services.prefs.getBoolPref(CUSTOM_PREF, false), "pref unchanged");
  Assert.ok(!(await IOUtils.exists(customPath)), "nothing copied");
});

add_task(async function test_import_unreadable_file_keeps_current() {
  KyberThemes.apply("ember");
  let good = await fixture(
    "keep.css",
    "#nav-bar { background-color: rgb(4, 5, 6) !important; }"
  );
  await KyberThemes.importCustomCss(good);
  let before = await IOUtils.readUTF8(customPath);

  let missing = new FileUtils.File(
    PathUtils.join(tmpDir, "kf-picker-no-such-file.css")
  );
  await rejects(KyberThemes.importCustomCss(missing), "unreadable");
  let dirPath = PathUtils.join(tmpDir, `kf-picker-dir-${Date.now()}.css`);
  fixtures.push(dirPath);
  await IOUtils.makeDirectory(dirPath);
  await rejects(
    KyberThemes.importCustomCss(new FileUtils.File(dirPath)),
    "unreadable"
  );

  Assert.ok(Services.prefs.getBoolPref(CUSTOM_PREF), "pref unchanged");
  Assert.equal(await IOUtils.readUTF8(customPath), before, "file unchanged");
  Assert.equal(navBg(), "rgb(4, 5, 6)", "the current sheet still applies");

  // Through the pane, the unreadable message shows and nothing changes.
  let doc = await openPane();
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  MockFilePicker.setFiles([missing]);
  doc.getElementById("kyberfoxThemeImport").click();
  await TestUtils.waitForCondition(
    () =>
      !errorBar(doc).hidden &&
      errorBar(doc).getAttribute("data-l10n-id") ==
        "kyberfox-theme-error-unreadable",
    "the unreadable message shows"
  );
  Assert.equal(navBg(), "rgb(4, 5, 6)", "still unchanged");
  MockFilePicker.cleanup();

  // A reset from the shortcut clears the stale error.
  EventUtils.synthesizeKey("T", {
    ctrlKey: true,
    shiftKey: true,
    altKey: true,
  });
  await TestUtils.waitForCondition(
    () => errorBar(doc).hidden,
    "the reset hides the old error"
  );
  await KyberThemes.filesSettled();
  closePane();
});

const ESCAPE_CSS =
  "#nav-bar { background-color: rgb(1, 2, 3) !important; }\n" +
  "} body, html { background: rgb(255, 0, 0) !important; }\n" +
  '@import url("https://example.com/x.css");\n';

async function contentBg(browser) {
  return SpecialPowers.spawn(
    browser,
    [],
    () =>
      content.getComputedStyle(content.document.documentElement).backgroundColor
  );
}

add_task(async function test_import_cannot_escape_the_browser_scope() {
  KyberThemes.apply("ember");
  await BrowserTestUtils.withNewTab("https://example.com/", async browser => {
    let before = await contentBg(browser);
    try {
      await KyberThemes.importCustomCss(
        await fixture("escape.css", ESCAPE_CSS)
      );
    } catch (e) {
      Assert.equal(e.code, "not-css", "rejected, or accepted below");
    }
    Assert.equal(await contentBg(browser), before, "the web page is unchanged");

    // A file that only holds the escape has no rules of its own.
    await rejects(
      KyberThemes.importCustomCss(
        await fixture(
          "escape2.css",
          "} body, html { background: rgb(255, 0, 0) !important; }"
        )
      ),
      "not-css"
    );
    Assert.equal(await contentBg(browser), before, "still unchanged");
  });
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
});

add_task(async function test_stored_file_is_scoped_again_on_start() {
  KyberThemes.apply("ember");
  await BrowserTestUtils.withNewTab("https://example.com/", async browser => {
    let before = await contentBg(browser);
    // A hand-edited file, as if someone wrote it into the profile.
    await IOUtils.makeDirectory(PathUtils.parent(customPath), {
      createAncestors: true,
    });
    await IOUtils.writeUTF8(customPath, ESCAPE_CSS);
    Services.prefs.setBoolPref(CUSTOM_PREF, true);
    KyberThemes._resetForTests();
    await KyberThemes.init();
    Assert.equal(await contentBg(browser), before, "the web page is unchanged");
    Assert.equal(navBg(), "rgb(1, 2, 3)", "its first rule still applies");

    // Only the escape, nothing of its own: nothing registers, pref cleared.
    KyberThemes.resetToDefault();
    await KyberThemes.filesSettled();
    await IOUtils.writeUTF8(
      customPath,
      "} body, html { background: rgb(255, 0, 0) !important; }"
    );
    Services.prefs.setBoolPref(CUSTOM_PREF, true);
    KyberThemes._resetForTests();
    await KyberThemes.init();
    Assert.equal(await contentBg(browser), before, "still unchanged");
    Assert.ok(!Services.prefs.getBoolPref(CUSTOM_PREF, false), "pref cleared");
  });
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
});

add_task(async function test_import_replaces_a_symlink_at_the_destination() {
  if (AppConstants.platform == "win") {
    return;
  }
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
  let victim = PathUtils.join(tmpDir, `kf-picker-victim-${Date.now()}.txt`);
  fixtures.push(victim);
  await IOUtils.writeUTF8(victim, "keep me");
  await IOUtils.makeDirectory(PathUtils.parent(customPath), {
    createAncestors: true,
  });
  let link = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  link.initWithPath(customPath);
  await IOUtils.remove(customPath, { ignoreAbsent: true });
  // No IOUtils.symlink; use the shell-free route through nsIFile.
  let proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  let ln = new FileUtils.File("/bin/ln");
  if (!ln.exists()) {
    return;
  }
  proc.init(ln);
  proc.run(true, ["-s", victim, customPath], 3);
  let file = await fixture(
    "link.css",
    "#nav-bar { background-color: rgb(7, 7, 7) !important; }"
  );
  await KyberThemes.importCustomCss(file);
  Assert.equal(await IOUtils.readUTF8(victim), "keep me", "target untouched");
  Assert.equal(
    await IOUtils.readUTF8(customPath),
    await IOUtils.readUTF8(file.path),
    "the profile file holds the copy"
  );
  KyberThemes.resetToDefault();
  await KyberThemes.filesSettled();
});

add_task(async function test_reset_button_available() {
  KyberThemes.apply("paper");
  await KyberThemes.importCustomCss(
    await fixture(
      "r.css",
      "#nav-bar { background-color: rgb(3, 3, 3) !important; }"
    )
  );
  let doc = await openPane();
  let button = doc.getElementById("kyberfoxThemeReset");
  Assert.ok(button, "there is a reset button");
  Assert.ok(!button.disabled, "it is enabled");
  button.click();
  await TestUtils.waitForCondition(
    () => KyberThemes.current() == "ember",
    "ember is current"
  );
  await KyberThemes.filesSettled();
  Assert.equal(navBg(), "rgb(43, 42, 51)", "ember toolbar");
  Assert.ok(!Services.prefs.getBoolPref(CUSTOM_PREF, false), "pref cleared");
  Assert.ok(!(await IOUtils.exists(customPath)), "custom file deleted");
  closePane();
});

add_task(async function test_warning_always_shown() {
  let doc = await openPane();
  let bar = doc.getElementById("kyberfoxThemeCssWarning");
  Assert.ok(!bar.hidden, "the warning is visible");
  Assert.equal(
    bar.getAttribute("data-l10n-id"),
    "kyberfox-theme-css-warning",
    "it is the warning string"
  );
  closePane();
});

add_task(async function test_shortcut_resets_theme() {
  KyberThemes.apply("paper");
  await KyberThemes.importCustomCss(
    await fixture(
      "s.css",
      "#nav-bar { background-color: rgb(5, 5, 5) !important; }"
    )
  );
  Assert.equal(navBg(), "rgb(5, 5, 5)", "custom CSS applied");
  EventUtils.synthesizeKey("T", {
    ctrlKey: true,
    shiftKey: true,
    altKey: true,
  });
  await TestUtils.waitForCondition(
    () => KyberThemes.current() == "ember",
    "the shortcut applied ember"
  );
  await KyberThemes.filesSettled();
  Assert.equal(navBg(), "rgb(43, 42, 51)", "ember toolbar");
  Assert.ok(!(await IOUtils.exists(customPath)), "custom file deleted");
});

add_task(async function test_safe_mode_skips_theme() {
  KyberThemes.apply("paper");
  KyberThemes._resetForTests();
  KyberThemes._safeModeForTests = true;
  await KyberThemes.init();
  Assert.equal(KyberThemes.current(), "ember", "no theme was applied");
  Assert.notEqual(navBg(), "rgb(250, 245, 234)", "paper is not applied");
  KyberThemes._safeModeForTests = false;
  KyberThemes.init();
  KyberThemes._safeModeForTests = undefined;
  Assert.equal(
    KyberThemes.current(),
    "paper",
    "init() works outside safe mode"
  );
  KyberThemes.apply("ember");
});

add_task(async function test_reduce_glow_checkbox() {
  const GLOW_PREF = "kyberfox.theme.reduceGlow";
  registerCleanupFunction(() => Services.prefs.clearUserPref(GLOW_PREF));
  let doc = await openPane();
  let box = doc.getElementById("kyberfoxThemeReduceGlow");
  Assert.ok(box, "the Reduce glow checkbox is in the pane");
  await box.updateComplete;
  Assert.ok(!box.checked, "unchecked by default");
  box.inputEl.click();
  await TestUtils.waitForCondition(() => KyberThemes.reduceGlow());
  Assert.ok(Services.prefs.getBoolPref(GLOW_PREF), "the pref is on");
  await TestUtils.waitForCondition(() => box.checked, "the box shows it");
  await box.updateComplete;
  box.inputEl.click();
  await TestUtils.waitForCondition(() => !KyberThemes.reduceGlow());
  Assert.ok(!Services.prefs.getBoolPref(GLOW_PREF, false), "the pref is off");
  closePane();
});
