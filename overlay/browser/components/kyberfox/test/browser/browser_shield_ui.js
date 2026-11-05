/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The shield button and panel against a real uBlock Origin, set up offline
// the way browser_shield.js does (docs/shield-ublock-control.md).
const { KyberShield } = ChromeUtils.importESModule(
  "resource:///modules/KyberShield.sys.mjs"
);

const UBLOCK_ID = "uBlock0@raymondhill.net";
const DIR = "/browser/browser/components/kyberfox/test/browser/";
const PERM_TYPES = [
  "kyber-shield",
  "kyber-shield-ads",
  "kyber-shield-fp",
  "kyber-shield-cookies",
];
const CONTROLS = ["ads", "fingerprinting", "cookies"];

function url(host, file = "shield_page.html") {
  return `https://${host}${DIR}${file}`;
}

function button(win = window) {
  return win.document.getElementById("kyber-shield-button");
}

function panel(win = window) {
  return win.document.getElementById("kyber-shield-panel");
}

function toggle(id, win = window) {
  return win.document.getElementById(`kyber-shield-${id}`);
}

// The badge text uBlock shows for the tab, which arrives some time after the
// page starts loading.
function waitForBadge(wanted, win = window) {
  return TestUtils.waitForCondition(
    () => button(win).getAttribute("badge") == wanted,
    `the badge reads "${wanted}"`,
    100,
    100
  );
}

async function openPanel(win = window) {
  let shown = BrowserTestUtils.waitForEvent(
    win.document,
    "popupshown",
    false,
    e => e.target.id == "kyber-shield-panel"
  );
  EventUtils.synthesizeMouseAtCenter(button(win), {}, win);
  await shown;
  return panel(win);
}

async function closePanel(win = window) {
  let p = panel(win);
  if (!p || p.state == "closed") {
    return;
  }
  let hidden = BrowserTestUtils.waitForEvent(p, "popuphidden");
  p.hidePopup();
  await hidden;
}

// Clicks a moz-toggle the way a user does and waits for the page to reload.
async function clickToggle(el, browser, win = window) {
  let reloaded = BrowserTestUtils.browserLoaded(browser);
  EventUtils.synthesizeMouseAtCenter(el.buttonEl, {}, win);
  await reloaded;
}

let gAddon;

add_setup(async function () {
  Services.policies.wrappedJSObject.setExtensionPolicies({
    [UBLOCK_ID]: {
      adminSettings: JSON.stringify({
        assetsBootstrapLocation: url("example.com", "shield_assets.json"),
        userSettings: { autoUpdate: false },
        selectedFilterLists: ["user-filters"],
        userFilters: `||example.org${DIR}shield_ad.js`,
      }),
    },
  });

  let file = Services.dirsvc.get("GreD", Ci.nsIFile);
  file.append("distribution");
  file.append("extensions");
  file.append(`${UBLOCK_ID}.xpi`);
  let install = await AddonManager.getInstallForFile(file);
  await install.install();
  gAddon = await AddonManager.getAddonByID(UBLOCK_ID);

  registerCleanupFunction(async () => {
    await gAddon?.uninstall();
    Services.policies.wrappedJSObject.setExtensionPolicies({});
    for (let pref of [
      "privacy.fingerprintingProtection.granularOverrides",
      "privacy.baselineFingerprintingProtection.granularOverrides",
      "privacy.resistFingerprinting.exemptedDomains",
    ]) {
      Services.prefs.clearUserPref(pref);
    }
    Services.perms.removeByType("trackingprotection");
    Services.perms.removeByType("trackingprotection-pb");
    for (let type of PERM_TYPES) {
      Services.perms.removeByType(type);
    }
  });

  // Control run: uBlock is up once the ad script is blocked on a fresh page.
  await TestUtils.waitForCondition(
    async () => {
      let tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        url("example.com")
      );
      let loaded = await SpecialPowers.spawn(
        tab.linkedBrowser,
        [],
        () => !!content.wrappedJSObject.shieldAdLoaded
      );
      BrowserTestUtils.removeTab(tab);
      return !loaded;
    },
    "uBlock blocks the ad script",
    200,
    50
  );
});

add_task(async function test_badge_updates_on_navigation() {
  Assert.ok(button(), "the shield button exists");
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;

  await TestUtils.waitForCondition(
    () => button().getAttribute("badge"),
    "the badge shows the blocked count"
  );
  Assert.equal(
    button().getAttribute("badge"),
    KyberShield.blockedCount(browser),
    "the badge is uBlock's count"
  );
  Assert.equal(
    button().querySelector(".kyber-shield-badge").textContent,
    button().getAttribute("badge"),
    "the badge element shows the count"
  );

  // A page with nothing to block: the badge goes away, it does not read 0.
  BrowserTestUtils.startLoadingURIString(
    browser,
    url("example.com", "shield_assets.json")
  );
  await BrowserTestUtils.browserLoaded(browser);
  await waitForBadge(null);
  Assert.ok(
    !button().hasAttribute("disabled"),
    "the button stays usable on this page"
  );

  // Switching tabs shows the count of the tab switched to.
  let other = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  await TestUtils.waitForCondition(
    () => button().getAttribute("badge"),
    "the second tab has a count"
  );
  await BrowserTestUtils.switchTab(gBrowser, tab);
  await waitForBadge(null);
  await BrowserTestUtils.switchTab(gBrowser, other);
  await TestUtils.waitForCondition(
    () => button().getAttribute("badge"),
    "the count is back on the first tab"
  );

  BrowserTestUtils.removeTab(other);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_panel_has_master_and_three_controls() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let p = await openPanel();

  let toggles = [...p.querySelectorAll("moz-toggle")];
  Assert.deepEqual(
    toggles.map(t => t.id),
    [
      "kyber-shield-master",
      "kyber-shield-ads",
      "kyber-shield-fingerprinting",
      "kyber-shield-cookies",
    ],
    "the master switch comes first, then the three controls"
  );
  Assert.ok(
    toggles.every(t => !t.hidden && t.pressed),
    "all four are visible and on for a site nobody touched"
  );
  Assert.equal(
    p.querySelector("#kyber-shield-site").textContent.trim(),
    "example.com",
    "the panel names the site"
  );
  await document.l10n.translateElements([toggles[0]]);
  Assert.equal(
    toggles[0].ariaLabel,
    "Kyber Shields for example.com",
    "the master switch names the site"
  );
  Assert.ok(
    p.querySelector("#kyber-shield-cookies-note").hidden,
    "no coupling note while cookies are on"
  );
  Assert.ok(
    p.querySelector("#kyber-shield-private-note").hidden,
    "no private window note in a normal window"
  );

  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_toggle_reloads_page() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;
  let p = await openPanel();

  await clickToggle(toggle("ads"), browser);
  Assert.equal(
    KyberShield.state(browser).ads,
    false,
    "the ads control is off after the click"
  );
  Assert.ok(!toggle("ads").pressed, "and the panel shows it off");
  Assert.equal(p.state, "open", "the panel stays open");
  Assert.ok(toggle("master").pressed, "the master switch is still on");

  // The reloaded page is no longer filtered by uBlock.
  await TestUtils.waitForCondition(
    () =>
      SpecialPowers.spawn(
        browser,
        [],
        () => !!content.wrappedJSObject.shieldAdLoaded
      ),
    "the ad script now loads"
  );

  // Cookies off shows the coupling note.
  await clickToggle(toggle("cookies"), browser);
  Assert.ok(
    !p.querySelector("#kyber-shield-cookies-note").hidden,
    "the note about Firefox's protection shows while cookies are off"
  );
  Assert.ok(
    !toggle("fingerprinting").pressed,
    "fingerprinting reads off with it, as the engine reports"
  );

  // The master switch off disables the rows; on restores them.
  await clickToggle(toggle("master"), browser);
  Assert.ok(
    CONTROLS.every(c => toggle(c).disabled && !toggle(c).pressed),
    "with the master off the three rows are off and disabled"
  );
  await clickToggle(toggle("master"), browser);
  Assert.ok(
    CONTROLS.every(c => !toggle(c).disabled),
    "the rows are usable again"
  );
  Assert.ok(!toggle("cookies").pressed, "cookies, turned off, stays off");
  Assert.ok(
    !toggle("fingerprinting").pressed,
    "fingerprinting still reads off with cookies"
  );
  Assert.ok(!toggle("ads").pressed, "ads, turned off on its own, stays off");

  await clickToggle(toggle("ads"), browser);
  await clickToggle(toggle("cookies"), browser);
  Assert.deepEqual(
    Services.perms.getAllWithTypePrefix("kyber-shield"),
    [],
    "turning everything back on leaves nothing stored"
  );

  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_ublock_not_reachable() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;
  // A reload would drop this marker from the page.
  await SpecialPowers.spawn(browser, [], () => {
    content.wrappedJSObject.notReloaded = true;
  });
  let original = KyberShield.setControl;
  KyberShield.setControl = async () => false;
  registerCleanupFunction(() => {
    KyberShield.setControl = original;
  });

  let p = await openPanel();
  Assert.ok(
    p.querySelector("#kyber-shield-error").hidden,
    "no error before anything is changed"
  );
  EventUtils.synthesizeMouseAtCenter(toggle("ads").buttonEl, {});
  await TestUtils.waitForCondition(
    () => !p.querySelector("#kyber-shield-error").hidden,
    "the panel says uBlock Origin is not reachable"
  );
  Assert.ok(toggle("ads").pressed, "the row keeps its stored state");
  Assert.ok(KyberShield.state(browser).ads, "nothing was stored");

  // The absence of a reload cannot be awaited, so give one time to show up.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  Assert.ok(
    await SpecialPowers.spawn(
      browser,
      [],
      () => !!content.wrappedJSObject.notReloaded
    ),
    "the page was not reloaded"
  );

  KyberShield.setControl = original;
  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_private_window_shows_master_only() {
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url("example.com")
  );
  let p = await openPanel(win);
  Assert.ok(!toggle("master", win).hidden, "the master switch shows");
  Assert.ok(
    CONTROLS.every(c => toggle(c, win).hidden),
    "the three controls are hidden"
  );
  Assert.ok(
    !p.querySelector("#kyber-shield-private-note").hidden,
    "the private window line shows"
  );
  await closePanel(win);
  BrowserTestUtils.removeTab(tab);
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_disabled_state_on_about_pages() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  await TestUtils.waitForCondition(
    () => button().hasAttribute("disabled"),
    "the button is disabled on about:robots"
  );
  Assert.ok(!button().hasAttribute("badge"), "and carries no badge");
  EventUtils.synthesizeMouseAtCenter(button(), {});
  Assert.ok(
    !panel() || panel().state == "closed",
    "clicking it does not open the panel"
  );

  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url("example.com"));
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  await TestUtils.waitForCondition(
    () => !button().hasAttribute("disabled"),
    "the button is enabled again on a web page"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_off_state_shows_crossed_shield() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  Assert.ok(
    !button().hasAttribute("shield-off"),
    "the shield is whole while protection is on"
  );
  await KyberShield.setEnabled(tab.linkedBrowser, false);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url("example.com"));
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  await TestUtils.waitForCondition(
    () => button().hasAttribute("shield-off"),
    "the shield is crossed while the master switch is off"
  );
  await KyberShield.setEnabled(tab.linkedBrowser, true);
  BrowserTestUtils.removeTab(tab);
});

// The shield is the only blocking control in the window: uBlock Origin's own
// toolbar button is never shown, and the panel does not name uBlock.
add_task(async function test_ublock_button_hidden() {
  let widgetId = "ublock0_raymondhill_net-browser-action";
  await TestUtils.waitForCondition(
    () => CustomizableUI.getWidget(widgetId)?.forWindow(window)?.node,
    "uBlock's toolbar widget is built"
  );
  let nodes = document.querySelectorAll(`[data-extensionid="${UBLOCK_ID}"]`);
  Assert.greater(nodes.length, 0, "uBlock's widget is in the window");
  for (let node of nodes) {
    Assert.ok(
      !node.checkVisibility(),
      `${node.id || node.localName} is not shown`
    );
  }
  Assert.ok(
    !gUnifiedExtensions.getActivePolicies().some(p => p.id == UBLOCK_ID),
    "uBlock is not listed in the extensions panel"
  );
});

add_task(async function test_panel_does_not_name_ublock() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let p = await openPanel();
  for (let note of p.querySelectorAll(".kyber-shield-note")) {
    await document.l10n.translateElements([note]);
    Assert.ok(
      !/uBlock/i.test(note.textContent),
      `${note.id} does not name uBlock: ${note.textContent}`
    );
  }
  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_advanced_settings_opens_dashboard() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let p = await openPanel();
  let link = p.querySelector("#kyber-shield-advanced");
  Assert.ok(link && link.checkVisibility(), "the panel has the advanced link");
  await document.l10n.translateElements([link]);
  Assert.equal(
    link.textContent.trim() || link.label,
    "Advanced blocking settings",
    "the link is labeled"
  );
  let dashboard =
    WebExtensionPolicy.getByID(UBLOCK_ID).getURL("dashboard.html");
  let opened = BrowserTestUtils.waitForNewTab(gBrowser, dashboard);
  let hidden = BrowserTestUtils.waitForEvent(p, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(link, {});
  let dashTab = await opened;
  await hidden;
  Assert.equal(
    dashTab.linkedBrowser.currentURI.spec,
    dashboard,
    "uBlock's dashboard opens in a new tab"
  );
  BrowserTestUtils.removeTab(dashTab);
  BrowserTestUtils.removeTab(tab);
});

// Like Brave's Shields icon: inside the right end of the address bar, after
// the bookmark star, larger than the other address bar icons, and usable from
// the keyboard.
add_task(async function test_shield_sits_in_address_bar() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let node = button();
  Assert.ok(node.closest("#page-action-buttons"), "inside the address bar");
  let right = node.getBoundingClientRect().right;
  for (let sibling of node.parentNode.children) {
    if (sibling != node && sibling.checkVisibility()) {
      Assert.lessOrEqual(
        sibling.getBoundingClientRect().right,
        right,
        `${sibling.id} sits left of the shield`
      );
    }
  }
  Assert.ok(
    !CustomizableUI.getPlacementOfWidget("kyber-shield-button"),
    "not a toolbar button"
  );
  Assert.ok(node.checkVisibility(), "visible on a web page");
  let icon = node.querySelector(".kyber-shield-icon").getBoundingClientRect();
  let star = document.getElementById("star-button").getBoundingClientRect();
  Assert.greaterOrEqual(
    Math.round(icon.width),
    20,
    `icon is 20px (${icon.width})`
  );
  Assert.greater(icon.width, star.width, "larger than the bookmark star");

  node.focus();
  let shown = BrowserTestUtils.waitForEvent(
    document,
    "popupshown",
    false,
    e => e.target.id == "kyber-shield-panel"
  );
  EventUtils.synthesizeKey("KEY_Enter");
  await shown;
  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

// Kyber Shields panel: the Crystal Guard icon states, the status card, the
// blocked count, the permission and settings rows, and keyboard use.

function shieldState(win = window) {
  return button(win).getAttribute("shield-state");
}

async function tooltip(win = window) {
  await win.document.l10n.translateElements([button(win)]);
  return button(win).getAttribute("tooltiptext");
}

async function reloadTab(browser) {
  BrowserTestUtils.startLoadingURIString(browser, url("example.com"));
  await BrowserTestUtils.browserLoaded(browser);
}

add_task(async function test_icon_states_follow_the_engine() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;
  await TestUtils.waitForCondition(() => shieldState() == "on", "on");
  Assert.equal(await tooltip(), "Kyber Shields: protection on");

  await KyberShield.setControl(browser, "ads", false);
  await reloadTab(browser);
  await TestUtils.waitForCondition(() => shieldState() == "partial", "partial");
  Assert.equal(
    await tooltip(),
    "Kyber Shields: some protections off for this site"
  );

  await KyberShield.setEnabled(browser, false);
  await reloadTab(browser);
  await TestUtils.waitForCondition(() => shieldState() == "off", "off");
  Assert.equal(await tooltip(), "Kyber Shields: protection off for this site");

  await KyberShield.setEnabled(browser, true);
  await KyberShield.setControl(browser, "ads", true);
  BrowserTestUtils.startLoadingURIString(browser, "about:robots");
  await BrowserTestUtils.browserLoaded(browser);
  await TestUtils.waitForCondition(
    () => shieldState() == "unavailable",
    "unavailable"
  );
  Assert.equal(await tooltip(), "Kyber Shields: not available on this page");
  Assert.equal(
    button().getAttribute("aria-label"),
    button().getAttribute("tooltiptext"),
    "the accessible name carries the state too"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_panel_header_and_status() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;
  let p = await openPanel();
  let title = p.querySelector("#kyber-shield-title");
  let status = p.querySelector("#kyber-shield-status");
  await document.l10n.translateElements([title, status]);
  Assert.equal(title.textContent, "Kyber Shields", "the panel is titled");
  Assert.equal(status.textContent, "Protection on", "the status reads on");
  Assert.ok(
    p.querySelector(".kyber-shield-emblem").checkVisibility(),
    "the emblem shows"
  );
  Assert.equal(
    p.getAttribute("aria-labelledby"),
    "kyber-shield-title",
    "the panel is named by its title"
  );
  Assert.equal(toggle("master").ariaLabel, "Kyber Shields for example.com");

  await clickToggle(toggle("ads"), browser);
  await document.l10n.translateElements([status]);
  Assert.equal(status.textContent, "Some protections off");
  Assert.equal(
    p.querySelector("#kyber-shield-status-card").getAttribute("state"),
    "partial"
  );
  await clickToggle(toggle("master"), browser);
  await document.l10n.translateElements([status]);
  Assert.equal(status.textContent, "Protection off");
  await clickToggle(toggle("master"), browser);
  await clickToggle(toggle("ads"), browser);
  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_blocked_row_shows_the_real_count() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;
  await TestUtils.waitForCondition(
    () => button().getAttribute("badge"),
    "uBlock counted the ad"
  );
  let p = await openPanel();
  let value = p.querySelector("#kyber-shield-blocked");
  await document.l10n.translateElements([value]);
  Assert.equal(
    value.textContent,
    `${KyberShield.blockedCount(browser)} on this page`,
    "the row shows uBlock's count for the page"
  );

  await clickToggle(toggle("ads"), browser);
  await document.l10n.translateElements([value]);
  Assert.equal(value.textContent, "Off for this site", "no count while off");
  await clickToggle(toggle("ads"), browser);
  await closePanel();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_permissions_row_opens_page_info() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let principal = tab.linkedBrowser.contentPrincipal;
  let p = await openPanel();
  let row = p.querySelector("#kyber-shield-permissions");
  let value = row.querySelector(".kyber-shield-row-value");
  await document.l10n.translateElements([value]);
  Assert.equal(value.textContent, "None allowed", "nothing allowed yet");
  await closePanel();

  Services.perms.addFromPrincipal(
    principal,
    "geo",
    Services.perms.ALLOW_ACTION
  );
  registerCleanupFunction(() =>
    Services.perms.removeFromPrincipal(principal, "geo")
  );
  p = await openPanel();
  await document.l10n.translateElements([value]);
  Assert.equal(value.textContent, "Allowed: 1", "the allowed count is real");

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null, win =>
    win.document.documentURI.includes("pageInfo")
  );
  let hidden = BrowserTestUtils.waitForEvent(p, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(row, {});
  let info = await opened;
  await hidden;
  await TestUtils.waitForCondition(
    () => info.document.getElementById("permTab")?.selected,
    "Page Info opens on its Permissions tab"
  );
  await BrowserTestUtils.closeWindow(info);
  Services.perms.removeFromPrincipal(principal, "geo");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_settings_row_opens_privacy_settings() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let p = await openPanel();
  let opened = BrowserTestUtils.waitForNewTab(
    gBrowser,
    u => u.startsWith("about:preferences"),
    true
  );
  EventUtils.synthesizeMouseAtCenter(
    p.querySelector("#kyber-shield-settings"),
    {}
  );
  let prefsTab = await opened;
  await TestUtils.waitForCondition(
    () =>
      prefsTab.linkedBrowser.contentWindow?.location.hash.includes("privacy"),
    "Settings opens on Privacy"
  );
  Assert.equal(p.state, "closed", "the panel closes");
  BrowserTestUtils.removeTab(prefsTab);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_keyboard_moves_through_the_panel() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  button().focus();
  let shown = BrowserTestUtils.waitForEvent(
    document,
    "popupshown",
    false,
    e => e.target.id == "kyber-shield-panel"
  );
  EventUtils.synthesizeKey(" ");
  await shown;
  let p = panel();
  await TestUtils.waitForCondition(
    () => toggle("master").matches(":focus-within"),
    "keyboard opening focuses the master switch"
  );
  let order = [];
  for (let i = 0; i < 7; i++) {
    EventUtils.synthesizeKey("KEY_Tab");
    let el = document.activeElement;
    order.push(el.closest("[id^=kyber-shield-]")?.id);
  }
  Assert.deepEqual(
    order,
    [
      "kyber-shield-ads",
      "kyber-shield-fingerprinting",
      "kyber-shield-cookies",
      "kyber-shield-permissions",
      "kyber-shield-settings",
      "kyber-shield-advanced",
      "kyber-shield-master",
    ],
    "Tab reaches every control in order and wraps"
  );
  let hidden = BrowserTestUtils.waitForEvent(p, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await hidden;
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_private_window_panel() {
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url("example.com")
  );
  let p = await openPanel(win);
  let status = p.querySelector("#kyber-shield-status");
  await win.document.l10n.translateElements([status]);
  Assert.equal(status.textContent, "Protection on");
  for (let id of ["permissions", "settings"]) {
    Assert.ok(
      p.querySelector(`#kyber-shield-${id}`).checkVisibility(),
      `${id} row shows in a private window`
    );
  }
  Assert.ok(
    p.querySelector(".kyber-shield-controls-heading").hidden,
    "no per-site controls heading without per-site controls"
  );
  await clickToggle(toggle("master", win), tab.linkedBrowser, win);
  await win.document.l10n.translateElements([status]);
  Assert.equal(status.textContent, "Protection off");
  Assert.equal(shieldState(win), "off", "the icon follows");
  await closePanel(win);
  BrowserTestUtils.removeTab(tab);
  await BrowserTestUtils.closeWindow(win);
  let normal = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  Assert.equal(
    KyberShield.state(normal.linkedBrowser).enabled,
    true,
    "a normal window is untouched"
  );
  BrowserTestUtils.removeTab(normal);
});

// uBlock's badge reads "!" for a page that loaded before uBlock was ready;
// that is not a count.
add_task(async function test_blocked_row_ignores_a_badge_that_is_not_a_count() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url("example.com")
  );
  let original = KyberShield.blockedCount;
  KyberShield.blockedCount = () => "!";
  registerCleanupFunction(() => {
    KyberShield.blockedCount = original;
  });
  let p = await openPanel();
  let value = p.querySelector("#kyber-shield-blocked");
  await document.l10n.translateElements([value]);
  Assert.equal(value.textContent, "Not counted", "no made-up count");
  KyberShield.blockedCount = original;
  await closePanel();
  BrowserTestUtils.removeTab(tab);
});
