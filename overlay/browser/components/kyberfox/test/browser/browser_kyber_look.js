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

// The logo at the start of the tab strip is the workspace switcher: one
// button with the logo, the workspace dot, its name and the chevron. Private
// windows have no workspaces and keep the plain logo and name.
add_task(async function test_tabstrip_logo_is_the_workspace_switcher() {
  KyberThemes.apply("kyber-crystal");
  let items = document.querySelector("#TabsToolbar .toolbar-items");
  let btn = document.getElementById("kyber-workspace-button");
  Assert.equal(
    getComputedStyle(items, "::before").content,
    "none",
    "no separate name in a normal window"
  );
  let logo = getComputedStyle(btn, "::before");
  Assert.ok(logo.backgroundImage.includes("fox-crystal.png"), "the real logo");
  Assert.ok(btn.label, `the button shows the workspace name (${btn.label})`);
  let shown = BrowserTestUtils.waitForEvent(
    document,
    "popupshown",
    false,
    e => e.target.id == "kyber-workspace-panel"
  );
  EventUtils.synthesizeMouse(btn, 6, 6, {});
  let { target: panel } = await shown;
  let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  panel.hidePopup();
  await hidden;

  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let before = win.getComputedStyle(
    win.document.querySelector("#TabsToolbar .toolbar-items"),
    "::before"
  );
  Assert.ok(before.content.includes("Kyber Fox"), "a private window keeps the name");
  Assert.ok(before.backgroundImage.includes("fox-crystal.png"), "and the logo");
  await BrowserTestUtils.closeWindow(win);

  KyberThemes.apply("kyber-crimson");
  Assert.ok(
    getComputedStyle(btn, "::before").backgroundImage.includes(
      "fox-crimson.png"
    ),
    "the logo takes the theme's colors"
  );

  KyberThemes.apply("ember");
  Assert.equal(
    getComputedStyle(btn, "::before").content,
    "none",
    "no logo in the button under ember"
  );
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

// The new tab and welcome pages (themes/kyber/pages.css).

async function withNewTab(task) {
  // A preloaded new tab can swap browsers under a running spawn.
  await SpecialPowers.pushPrefEnv({ set: [["browser.newtab.preload", false]] });
  NewTabPagePreloading.removePreloadedBrowser(window);
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab"
  );
  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => !!content.document.querySelector(".logo-and-wordmark .logo"),
        "the logo is drawn"
      );
    });
    await task(tab.linkedBrowser);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

function bodyImage(browser) {
  return SpecialPowers.spawn(
    browser,
    [],
    () => content.getComputedStyle(content.document.body).backgroundImage
  );
}

add_task(async function test_newtab_waves() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    Assert.stringContains(await bodyImage(browser), "waves-crystal.svg");
  });
});

add_task(async function test_newtab_big_fox() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let [width, image] = await SpecialPowers.spawn(browser, [], () => {
      let logo = content.document.querySelector(".logo-and-wordmark .logo");
      let style = content.getComputedStyle(logo);
      return [logo.getBoundingClientRect().width, style.backgroundImage];
    });
    Assert.greaterOrEqual(width, 160, "a big fox");
    Assert.stringContains(image, "fox-crystal.png");
  });
});

// The wordmark is the mask filled with the theme's colors: the text color
// for KYBER and the theme's two wordmark colors for FOX.
add_task(async function test_newtab_wordmark_takes_the_theme_colors() {
  KyberThemes.apply("kyber-crimson");
  await withNewTab(async browser => {
    let [mask, image] = await SpecialPowers.spawn(browser, [], () => {
      let mark = content.document.querySelector(".logo-and-wordmark .wordmark");
      let style = content.getComputedStyle(mark);
      return [style.maskImage, style.backgroundImage];
    });
    Assert.stringContains(mask, "wordmark-mask.svg");
    Assert.stringContains(image, "rgb(250, 2, 38)", "FOX in Crimson red");
    Assert.ok(!image.includes("firefox-wordmark.svg"), "not the fixed colors");
  });
  KyberThemes.apply("kyber-crystal");
});

add_task(async function test_newtab_assets_load() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let [imageOk, faces] = await SpecialPowers.spawn(browser, [], async () => {
      let img = new content.Image();
      let loaded = new Promise(resolve => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
      });
      img.src = "chrome://kyberfox/content/themes/kyber/foxes/fox-crystal.png";
      let ok = await loaded;
      let fonts = await content.document.fonts.load('700 16px "Kyber Sora"');
      return [ok, fonts.map(f => f.status)];
    });
    Assert.ok(imageOk, "the new tab can load the Kyber images");
    Assert.deepEqual(faces, ["loaded"], "and the Kyber fonts");
  });
});

add_task(async function test_newtab_follows_theme() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    KyberThemes.apply("kyber-crimson");
    await TestUtils.waitForCondition(async () =>
      (await bodyImage(browser)).includes("waves-crimson.svg")
    );
    KyberThemes.apply("ember");
    await TestUtils.waitForCondition(async () => {
      let image = await bodyImage(browser);
      return !image.includes("waves-") && !image.includes("fox-");
    }, "no Kyber images under ember");
  });
});

add_task(async function test_user_wallpaper_wins() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    await SpecialPowers.spawn(browser, [], () => {
      let body = content.document.body;
      body.classList.add("darkWallpaper");
      body.style.setProperty(
        "--newtab-wallpaper",
        "linear-gradient(red, blue)"
      );
    });
    Assert.ok(
      !(await bodyImage(browser)).includes("waves-"),
      "the wallpaper replaces the waves"
    );
  });
});

add_task(async function test_newtab_no_remote_loads() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let remote = await SpecialPowers.spawn(browser, [], async () => {
      // Let the backgrounds and fonts load first.
      await new Promise(r => content.setTimeout(r, 1000));
      return content.performance
        .getEntriesByType("resource")
        .map(e => e.name)
        .filter(n => /^https?:/.test(n));
    });
    Assert.deepEqual(remote, [], "nothing loads from the network");
  });
});

add_task(async function test_welcome_fonts() {
  KyberThemes.apply("kyber-crystal");
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "chrome://kyberfox/content/welcome.xhtml"
  );
  try {
    let doc = tab.linkedBrowser.contentDocument;
    let h1 = doc.querySelector("h1");
    Assert.equal(
      doc.defaultView
        .getComputedStyle(h1)
        .fontFamily.split(",")[0]
        .replace(/"/g, ""),
      "Kyber Sora",
      "the heading uses Kyber Sora"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
    Services.prefs.setBoolPref("kyberfox.welcome.shown", true);
  }
});

// The private window page (themes/kyber/pages.css, private-window-page.patch).

async function withPrivatePage(task) {
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    let browser = win.gBrowser.selectedBrowser;
    BrowserTestUtils.startLoadingURIString(browser, "about:privatebrowsing");
    await BrowserTestUtils.browserLoaded(browser, false, "about:privatebrowsing");
    await SpecialPowers.spawn(browser, [], async () => {
      await content.document.l10n.ready;
      await content.document.l10n.translateRoots();
    });
    await task(browser);
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
}

function privatePageState(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    let doc = content.document;
    let heading = doc.querySelector(".kyber-private-heading");
    let note = doc.querySelector(".kyber-private-note");
    let info = doc.querySelector(".info-border");
    return {
      headingShown: !!heading && heading.offsetHeight > 0,
      headingText: heading?.querySelector("h1")?.textContent ?? "",
      noteShown: !!note && note.offsetHeight > 0,
      noteText: note?.textContent ?? "",
      infoShown: !!info && info.offsetHeight > 0,
      infoLinks: info ? info.querySelectorAll("a").length : 0,
      logoImage: content.getComputedStyle(doc.querySelector(".logo"))
        .backgroundImage,
    };
  });
}

add_task(async function test_private_page_kyber_lines() {
  KyberThemes.apply("kyber-crystal");
  await withPrivatePage(async browser => {
    let state = await privatePageState(browser);
    Assert.ok(state.headingShown, "the heading shows");
    Assert.equal(state.headingText, "Private window");
    Assert.ok(state.noteShown, "the note shows");
    Assert.equal(
      state.noteText,
      "History is not saved after you close all private windows. Downloads and bookmarks are kept. Private browsing does not make you anonymous: websites, your employer, and your internet provider may still see your activity."
    );
  });
});

add_task(async function test_private_page_hidden_under_ember() {
  KyberThemes.apply("ember");
  await withPrivatePage(async browser => {
    let state = await privatePageState(browser);
    Assert.ok(!state.headingShown, "no Kyber heading under ember");
    Assert.ok(!state.noteShown, "no Kyber note under ember");
    Assert.ok(state.infoShown, "Firefox's info box shows");
  });
});

add_task(async function test_private_info_still_reachable() {
  KyberThemes.apply("kyber-crystal");
  await withPrivatePage(async browser => {
    let state = await privatePageState(browser);
    Assert.ok(state.infoShown, "the info box shows");
    Assert.greaterOrEqual(state.infoLinks, 1, "with its links");
  });
});

add_task(async function test_private_fox_follows_theme() {
  KyberThemes.apply("kyber-azure");
  await withPrivatePage(async browser => {
    let state = await privatePageState(browser);
    Assert.stringContains(state.logoImage, "masked-fox.png");
  });
});

// Fixes from the branch review.

add_task(async function test_disabled_kyber_keeps_choice() {
  KyberThemes.apply("kyber-crystal");
  Services.prefs.setStringPref(DISABLED_PREF, "kyber-crystal");
  KyberThemes.apply("kyber-crystal");
  Assert.equal(KyberThemes.current(), "ember", "ember while it is off");
  Assert.equal(
    Services.prefs.getStringPref(ID_PREF),
    "kyber-crystal",
    "the choice is kept"
  );
  Services.prefs.clearUserPref(DISABLED_PREF);
  restart({ id: Services.prefs.getStringPref(ID_PREF), moved: true });
  Assert.equal(KyberThemes.current(), "kyber-crystal", "back when it is on");
});

add_task(function test_first_run_move_waits_for_kyber() {
  Services.prefs.setStringPref(DISABLED_PREF, "kyber-crystal");
  restart({});
  Assert.equal(KyberThemes.current(), "ember");
  Assert.ok(
    !Services.prefs.getBoolPref(MOVED_PREF, false),
    "the move is not recorded"
  );
  Services.prefs.clearUserPref(DISABLED_PREF);
  KyberThemes._resetForTests();
  KyberThemes.init();
  Assert.equal(KyberThemes.current(), "kyber-crystal", "moved next start");
  Assert.ok(Services.prefs.getBoolPref(MOVED_PREF));
});

add_task(async function test_newtab_dark_on_light_os() {
  await SpecialPowers.pushPrefEnv({
    set: [["layout.css.prefers-color-scheme.content-override", 1]],
  });
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let scheme = await SpecialPowers.spawn(
      browser,
      [],
      () =>
        content.getComputedStyle(content.document.documentElement).colorScheme
    );
    Assert.equal(scheme, "dark", "the page draws dark under a Kyber theme");
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_light_wallpaper_keeps_dark_text() {
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let [text, wordmark] = await SpecialPowers.spawn(browser, [], () => {
      let doc = content.document;
      doc.body.classList.add("lightWallpaper");
      let style = content.getComputedStyle(doc.body);
      let mark = doc.querySelector(".logo-and-wordmark .wordmark");
      return [
        style.getPropertyValue("--newtab-text-primary-color").trim(),
        content.getComputedStyle(mark).backgroundImage,
      ];
    });
    Assert.notEqual(text, "#ffffff", "no forced white text");
    Assert.ok(
      !wordmark.includes("rgb(255, 255, 255)"),
      "no forced white wordmark"
    );
  });
});

async function systemColors(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    let probe = content.document.createElement("span");
    probe.style.color = "CanvasText";
    content.document.body.append(probe);
    let canvasText = content.getComputedStyle(probe).color;
    probe.remove();
    return canvasText;
  });
}

add_task(async function test_high_contrast_text_readable() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.display.document_color_use", 2]],
  });
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let canvasText = await systemColors(browser);
    let fg = await SpecialPowers.spawn(browser, [], () =>
      content
        .getComputedStyle(content.document.documentElement)
        .getPropertyValue("--kf-fg")
        .trim()
    );
    Assert.equal(fg, "CanvasText", "new tab text follows the system colors");
    Assert.ok(canvasText, "probe ran");
  });
  await withPrivatePage(async browser => {
    let fg = await SpecialPowers.spawn(browser, [], () =>
      content
        .getComputedStyle(content.document.documentElement)
        .getPropertyValue("--kf-fg")
        .trim()
    );
    Assert.equal(fg, "CanvasText", "private page text too");
  });
  await SpecialPowers.popPrefEnv();
});

// Closer to the mockups: shortcut cards, no empty bookmarks strip, the short
// PRIVATE pill and the private search placeholder.

add_task(async function test_newtab_shortcut_cards() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtabpage.activity-stream.feeds.topsites", true],
      [
        "browser.newtabpage.pinned",
        JSON.stringify([{ url: "https://example.com/", label: "Example" }]),
      ],
    ],
  });
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let card = await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () =>
          content.document.querySelector(
            ".top-site-outer:not(.add-button-tile) .top-site-inner"
          ),
        "a shortcut is drawn"
      );
      let inner = content.document.querySelector(
        ".top-site-outer:not(.add-button-tile) .top-site-inner"
      );
      let style = content.getComputedStyle(inner);
      return {
        radius: style.borderTopLeftRadius,
        border: style.borderTopWidth,
        width: inner.getBoundingClientRect().width,
      };
    });
    Assert.equal(card.radius, "14px", "the shortcut is a rounded card");
    Assert.equal(card.border, "1px", "with a thin border");
    Assert.greaterOrEqual(card.width, 88, "big enough for its label");
  });
  await SpecialPowers.popPrefEnv();
});

add_task(function test_empty_bookmarks_strip_hidden() {
  let toolbar = document.getElementById("PersonalToolbar");
  let empty = document.getElementById("personal-toolbar-empty");
  let wasHidden = empty.hidden;
  empty.hidden = false;
  try {
    KyberThemes.apply("ember");
    Assert.notEqual(getComputedStyle(toolbar).display, "none", "ember keeps it");
    KyberThemes.apply("kyber-crystal");
    Assert.equal(
      getComputedStyle(toolbar).display,
      "none",
      "no empty bookmarks strip under Kyber"
    );
    empty.hidden = true;
    Assert.notEqual(
      getComputedStyle(toolbar).display,
      "none",
      "a toolbar with bookmarks stays"
    );
  } finally {
    empty.hidden = wasHidden;
  }
});

add_task(async function test_private_pill_short_label() {
  KyberThemes.apply("kyber-crystal");
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    let label = win.document.querySelector(
      "#nav-bar > .private-browsing-indicator-with-label > .private-browsing-indicator-label"
    );
    Assert.ok(
      win.getComputedStyle(label, "::after").content.startsWith('"Private"'),
      "the pill reads PRIVATE"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_private_search_keeps_native_label() {
  KyberThemes.apply("kyber-crystal");
  await withPrivatePage(async browser => {
    let label = await SpecialPowers.spawn(browser, [], () => {
      let host = content.document.querySelector("content-search-handoff-ui");
      let box = host.shadowRoot.querySelector(".fake-textbox");
      return {
        size: content.getComputedStyle(box).fontSize,
        replacement: content.getComputedStyle(box, "::before").content,
      };
    });
    Assert.notEqual(label.size, "0px", "native search label remains readable");
    Assert.ok(["none", "normal"].includes(label.replacement), "no generated placeholder");
  });
});

add_task(async function test_settings_uses_theme_tokens() {
  await SpecialPowers.pushPrefEnv({set: [["browser.display.document_color_use", 1], ["ui.prefersContrast", 0]]});
  KyberThemes.apply("kyber-crystal");
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:preferences#privacy");
  try {
    let doc = tab.linkedBrowser.contentDocument;
    await TestUtils.waitForCondition(() => doc.getElementById("kyberfoxRecommendedAddonsLink"), "settings initialized");
    let style = doc.defaultView.getComputedStyle(doc.documentElement);
    info(JSON.stringify({ theme: KyberThemes.current(), contrast: doc.defaultView.matchMedia("(prefers-contrast: more)").matches, forced: doc.defaultView.matchMedia("(forced-colors: active)").matches, bg: style.getPropertyValue("--kf-bg") }));
    Assert.equal(style.colorScheme, "dark");
    Assert.equal(style.getPropertyValue("--background-color-canvas").trim(), "#0a0f2d", "native settings use the theme surface");
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_reduced_motion_removes_page_glow() {
  await SpecialPowers.pushPrefEnv({set: [["ui.prefersReducedMotion", 1]]});
  KyberThemes.apply("kyber-crystal");
  await withNewTab(async browser => {
    let strength = await SpecialPowers.spawn(browser, [], () =>
      content.getComputedStyle(content.document.documentElement)
        .getPropertyValue("--kyber-glow-strength").trim()
    );
    Assert.equal(strength, "0", "reduced motion removes decorative glow");
  });
  await SpecialPowers.popPrefEnv();
});
