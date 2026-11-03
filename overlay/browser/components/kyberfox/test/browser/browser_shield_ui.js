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
  Assert.ok(button().hasAttribute("badged"), "the button is badged");

  // A page with nothing to block: the badge goes away, it does not read 0.
  BrowserTestUtils.startLoadingURIString(
    browser,
    url("example.com", "shield_assets.json")
  );
  await BrowserTestUtils.browserLoaded(browser);
  await waitForBadge(null);
  Assert.ok(!button().disabled, "the button stays usable on this page");

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
    toggles[0].label,
    "Shield for example.com",
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
    () => button().disabled,
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
    () => !button().disabled,
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
