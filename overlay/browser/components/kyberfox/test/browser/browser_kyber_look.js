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
      "Your local browsing history is not saved in this window."
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
    Assert.stringContains(state.logoImage, "private-azure.png");
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
