/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The shield engine against a real uBlock Origin: the signed XPI from the
// distribution directory runs offline in this harness. docs/shield-ublock-
// control.md explains how.
const { KyberShield } = ChromeUtils.importESModule(
  "resource:///modules/KyberShield.sys.mjs"
);
const { KyberUBlockBridge } = ChromeUtils.importESModule(
  "resource:///modules/KyberUBlockBridge.sys.mjs"
);
const { ContentBlockingAllowList } = ChromeUtils.importESModule(
  "resource://gre/modules/ContentBlockingAllowList.sys.mjs"
);

const UBLOCK_ID = "uBlock0@raymondhill.net";
const DIR = "/browser/browser/components/kyberfox/test/browser/";
const PAGE = "shield_page.html";
const FP_PREF = "privacy.fingerprintingProtection.granularOverrides";
const PERM_TYPES = [
  "kyber-shield",
  "kyber-shield-ads",
  "kyber-shield-fp",
  "kyber-shield-cookies",
];

function url(host, file = PAGE) {
  return `https://${host}${DIR}${file}`;
}

function principalFor(host) {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    `https://${host}`
  );
}

// All Kyber Fox shield permissions, whatever their type or expiry.
function shieldPerms() {
  return Services.perms
    .getAllWithTypePrefix("kyber-shield")
    .map(p => `${p.principal.host} ${p.type} ${p.capability} ${p.expireType}`);
}

function allowListHosts() {
  return Services.perms
    .getAllWithTypePrefix("trackingprotection")
    .filter(p => p.type == "trackingprotection")
    .map(p => p.principal.host);
}

function fpEntries() {
  return JSON.parse(Services.prefs.getStringPref(FP_PREF, "") || "[]").filter(
    e => e.overrides == "-AllTargets"
  );
}

function state(perControl, enabled, ads, fingerprinting, cookies) {
  return {
    supported: true,
    perControl,
    enabled,
    ads,
    fingerprinting,
    cookies,
  };
}

const ALL_ON = state(true, true, true, true, true);
const ALL_FALSE = {
  supported: false,
  perControl: false,
  enabled: false,
  ads: false,
  fingerprinting: false,
  cookies: false,
};

// Whether the page's third-party ad script ran, so uBlock did not block it.
function adLoaded(browser) {
  return SpecialPowers.spawn(
    browser,
    [],
    () => !!content.wrappedJSObject.shieldAdLoaded
  );
}

async function openPage(host, win = window) {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url(host)
  );
  return tab;
}

// Waits until a freshly loaded page shows uBlock acting (or not) as wanted.
async function waitForAdLoaded(host, wanted) {
  let loaded;
  await TestUtils.waitForCondition(
    async () => {
      let tab = await openPage(host);
      loaded = await adLoaded(tab.linkedBrowser);
      BrowserTestUtils.removeTab(tab);
      return loaded == wanted;
    },
    `ad script ${wanted ? "loads" : "is blocked"} on ${host}`,
    200,
    50
  );
}

let gAddon;

async function installUblock() {
  // uBlock would fetch filter lists from the network, which the harness
  // forbids. Admin settings (managed storage) point it at a local asset list
  // that names only files inside the XPI, and give it one user filter.
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
}

add_setup(async function () {
  await installUblock();

  registerCleanupFunction(async () => {
    await gAddon?.uninstall();
    Services.policies.wrappedJSObject.setExtensionPolicies({});
    Services.prefs.clearUserPref(FP_PREF);
    Services.prefs.clearUserPref(
      "privacy.baselineFingerprintingProtection.granularOverrides"
    );
    Services.perms.removeByType("trackingprotection");
    Services.perms.removeByType("trackingprotection-pb");
    for (let type of PERM_TYPES) {
      Services.perms.removeByType(type);
    }
  });

  // Control run: uBlock is up once it blocks the ad script.
  await waitForAdLoaded("example.com", false);
});

add_task(async function test_defaults_all_protected() {
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;
  Assert.deepEqual(
    KyberShield.state(browser),
    ALL_ON,
    "a site nobody touched has every protection on"
  );
  Assert.ok(!(await adLoaded(browser)), "uBlock blocks the ad script");
  Assert.deepEqual(shieldPerms(), [], "defaults store nothing");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_master_off_disables_all_three() {
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;

  Assert.ok(
    await KyberShield.setEnabled(browser, false),
    "uBlock took the call"
  );
  Assert.deepEqual(
    KyberShield.state(browser),
    state(true, false, false, false, false),
    "the master switch turns the three controls off"
  );
  Assert.deepEqual(
    allowListHosts(),
    ["example.com"],
    "the content blocking allow list holds the base domain"
  );
  Assert.deepEqual(
    fpEntries().map(e => e.firstPartyDomain),
    ["example.com"],
    "fingerprinting protection has an exception for the site"
  );
  await waitForAdLoaded("example.com", true);

  Assert.ok(await KyberShield.setEnabled(browser, true), "uBlock took it");
  Assert.deepEqual(
    KyberShield.state(browser),
    ALL_ON,
    "turning the master switch on restores the controls"
  );
  Assert.deepEqual(allowListHosts(), [], "the allow list entry is gone");
  Assert.deepEqual(fpEntries(), [], "the fingerprinting exception is gone");
  await waitForAdLoaded("example.com", false);
  BrowserTestUtils.removeTab(tab);
  Assert.deepEqual(shieldPerms(), [], "nothing is left stored");
});

add_task(async function test_master_on_keeps_control_turned_off() {
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;

  await KyberShield.setControl(browser, "fingerprinting", false);
  await KyberShield.setEnabled(browser, false);
  await KyberShield.setEnabled(browser, true);
  Assert.deepEqual(
    KyberShield.state(browser),
    state(true, true, true, false, true),
    "the control turned off on its own stays off"
  );
  Assert.equal(fpEntries().length, 1, "and its exception is back");

  await KyberShield.setControl(browser, "fingerprinting", true);
  Assert.deepEqual(shieldPerms(), [], "turning it on clears the choice");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_control_persists_per_site() {
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;

  await KyberShield.setControl(browser, "fingerprinting", false);
  Assert.deepEqual(
    KyberShield.state(browser),
    state(true, true, true, false, true),
    "only the fingerprinting control changed"
  );
  let perms = Services.perms
    .getAllWithTypePrefix("kyber-shield")
    .map(p => [p.type, p.capability, p.expireType]);
  Assert.deepEqual(
    perms,
    [
      [
        "kyber-shield-fp",
        Services.perms.DENY_ACTION,
        Services.perms.EXPIRE_NEVER,
      ],
    ],
    "the choice is stored as a lasting permission"
  );
  BrowserTestUtils.removeTab(tab);

  let again = await openPage("example.com");
  Assert.equal(
    KyberShield.state(again.linkedBrowser).fingerprinting,
    false,
    "a new tab on the site sees the choice"
  );
  BrowserTestUtils.removeTab(again);

  let other = await openPage("example.org");
  Assert.deepEqual(
    KyberShield.state(other.linkedBrowser),
    ALL_ON,
    "another site is untouched"
  );
  BrowserTestUtils.removeTab(other);

  let back = await openPage("example.com");
  await KyberShield.setControl(back.linkedBrowser, "fingerprinting", true);
  Assert.deepEqual(shieldPerms(), [], "turning it back on stores nothing");
  Assert.deepEqual(fpEntries(), [], "and removes the exception");
  BrowserTestUtils.removeTab(back);
});

add_task(async function test_cookies_off_lifts_firefox_protection() {
  // Firefox's per-site cookie lever is the content blocking allow list, which
  // also lifts its tracker and fingerprinting protection. state() says so.
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;
  let www = principalFor("www.example.com");
  Services.perms.addFromPrincipal(
    www,
    "trackingprotection",
    Services.perms.ALLOW_ACTION,
    Services.perms.EXPIRE_NEVER
  );

  await KyberShield.setControl(browser, "cookies", false);
  Assert.deepEqual(
    KyberShield.state(browser),
    state(true, true, true, false, false),
    "fingerprinting reads off with cookies; ads stay on (uBlock blocks)"
  );
  Assert.ok(!(await adLoaded(browser)), "uBlock still blocks the ad script");
  Assert.deepEqual(fpEntries(), [], "no fingerprinting exception is stored");

  await KyberShield.setControl(browser, "cookies", true);
  Assert.deepEqual(KyberShield.state(browser), ALL_ON, "all on again");
  Assert.deepEqual(
    allowListHosts(),
    [],
    "re-enabling also removes entries Firefox wrote for subdomains"
  );
  BrowserTestUtils.removeTab(tab);
  Assert.deepEqual(shieldPerms(), [], "nothing is left stored");
});

add_task(async function test_subdomains_share_setting() {
  let tab = await openPage("example.com");
  await KyberShield.setControl(tab.linkedBrowser, "cookies", false);
  BrowserTestUtils.removeTab(tab);

  Assert.deepEqual(
    Services.perms
      .getAllWithTypePrefix("kyber-shield")
      .map(p => p.principal.origin),
    ["https://example.com"],
    "the setting is keyed by the base domain"
  );
  Assert.deepEqual(
    allowListHosts(),
    ["example.com"],
    "the allow list entry is on the base domain and none is left for www."
  );

  for (let host of ["www.example.com", "sub1.test1.example.com"]) {
    let sub = await openPage(host);
    Assert.equal(
      KyberShield.state(sub.linkedBrowser).cookies,
      false,
      `${host} shares the base domain's setting`
    );
    Assert.equal(
      Services.perms.testPermissionFromPrincipal(
        principalFor(host),
        "trackingprotection"
      ),
      Services.perms.ALLOW_ACTION,
      `Firefox's non-exact allow list lookup covers ${host}`
    );
    BrowserTestUtils.removeTab(sub);
  }

  // uBlock's switch covers subdomains too.
  let base = await openPage("example.com");
  await KyberShield.setControl(base.linkedBrowser, "ads", false);
  BrowserTestUtils.removeTab(base);
  await waitForAdLoaded("www.example.com", true);

  let www = await openPage("www.example.com");
  await KyberShield.setControl(www.linkedBrowser, "cookies", true);
  await KyberShield.setControl(www.linkedBrowser, "ads", true);
  BrowserTestUtils.removeTab(www);
  Assert.deepEqual(shieldPerms(), [], "a subdomain can change it back");
  Assert.deepEqual(allowListHosts(), [], "and the allow list is empty");
  await waitForAdLoaded("www.example.com", false);
});

add_task(async function test_about_page_unsupported() {
  let ublockPage = WebExtensionPolicy.getByID(UBLOCK_ID).getURL("blank.html");
  for (let spec of [
    "about:blank",
    "about:preferences",
    ublockPage,
    "file:///",
    `view-source:${url("example.com")}`,
  ]) {
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, spec);
    Assert.deepEqual(
      KyberShield.state(tab.linkedBrowser),
      ALL_FALSE,
      `${spec} is unsupported and every flag is false`
    );
    await KyberShield.setEnabled(tab.linkedBrowser, false);
    await KyberShield.setControl(tab.linkedBrowser, "ads", false);
    Assert.deepEqual(shieldPerms(), [], `${spec} stores nothing`);
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_blocked_count_reads_badge() {
  let tab = await openPage("example.com");
  await TestUtils.waitForCondition(
    () => KyberShield.blockedCount(tab.linkedBrowser) == "1",
    "uBlock's badge on the tab counts the blocked ad script"
  );
  Assert.strictEqual(
    KyberShield.blockedCount(tab.linkedBrowser),
    "1",
    "the count is a string"
  );
  BrowserTestUtils.removeTab(tab);

  let blank = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  Assert.strictEqual(
    KyberShield.blockedCount(blank.linkedBrowser),
    "",
    "a page uBlock does not run on has no count"
  );
  BrowserTestUtils.removeTab(blank);
});

add_task(async function test_private_window_setting_not_persisted() {
  let calls = KyberUBlockBridge.callLog.length;
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url("www.example.com")
  );
  let browser = tab.linkedBrowser;
  Assert.deepEqual(
    KyberShield.state(browser),
    state(false, true, true, true, true),
    "a private window has the master switch only"
  );

  await KyberShield.setControl(browser, "ads", false);
  Assert.deepEqual(
    KyberShield.state(browser),
    state(false, true, true, true, true),
    "a per-control change is ignored"
  );
  await KyberShield.setEnabled(browser, false);
  Assert.deepEqual(
    KyberShield.state(browser),
    state(false, false, false, false, false),
    "the master switch applies in the window and the controls follow it"
  );

  let perms = Services.perms
    .getAllWithTypePrefix("trackingprotection")
    .filter(p => p.type == "trackingprotection-pb");
  Assert.equal(perms.length, 1, "one private allow list entry");
  Assert.equal(perms[0].principal.host, "example.com", "on the base domain");
  Assert.equal(
    perms[0].expireType,
    Services.perms.EXPIRE_SESSION,
    "it expires with the session"
  );
  Assert.equal(
    perms[0].principal.originAttributes.privateBrowsingId,
    1,
    "it is on the private browsing principal"
  );
  Assert.ok(
    ContentBlockingAllowList.includes(browser) ||
      Services.perms.testPermissionFromPrincipal(
        browser.contentPrincipal,
        "trackingprotection-pb"
      ) == Services.perms.ALLOW_ACTION,
    "Firefox sees it for the private page"
  );

  let apex = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url("example.com")
  );
  Assert.deepEqual(
    KyberShield.state(apex.linkedBrowser),
    state(false, false, false, false, false),
    "the base domain page in the same private session sees it"
  );

  // Nothing else changed: no stored choice, no pref, no uBlock call.
  Assert.deepEqual(shieldPerms(), [], "no Kyber Fox permission is stored");
  Assert.deepEqual(allowListHosts(), [], "the normal allow list is untouched");
  Assert.ok(
    !Services.prefs.prefHasUserValue(FP_PREF),
    "fingerprinting overrides are unchanged"
  );
  Assert.equal(
    KyberUBlockBridge.callLog.length,
    calls,
    "uBlock was not called from a private window"
  );

  let normal = await openPage("example.com");
  Assert.deepEqual(
    KyberShield.state(normal.linkedBrowser),
    ALL_ON,
    "a normal window does not see the private choice"
  );
  BrowserTestUtils.removeTab(normal);

  let exited = TestUtils.topicObserved("last-pb-context-exited");
  await BrowserTestUtils.closeWindow(win);
  await exited;

  let fresh = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let freshTab = await BrowserTestUtils.openNewForegroundTab(
    fresh.gBrowser,
    url("example.com")
  );
  Assert.deepEqual(
    KyberShield.state(freshTab.linkedBrowser),
    state(false, true, true, true, true),
    "a new private session starts clean"
  );
  await BrowserTestUtils.closeWindow(fresh);
});

add_task(async function test_private_state_reports_global_settings() {
  let tab = await openPage("example.com");
  await KyberShield.setControl(tab.linkedBrowser, "fingerprinting", false);
  BrowserTestUtils.removeTab(tab);

  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let priv = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url("example.com")
  );
  Assert.deepEqual(
    KyberShield.state(priv.linkedBrowser),
    state(false, true, true, false, true),
    "a fingerprinting exception set in a normal window applies in private"
  );
  await BrowserTestUtils.closeWindow(win);

  let back = await openPage("example.com");
  await KyberShield.setControl(back.linkedBrowser, "fingerprinting", true);
  BrowserTestUtils.removeTab(back);
  Assert.deepEqual(shieldPerms(), [], "nothing is left stored");
});

add_task(async function test_ip_hosts() {
  let v4 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `http://127.0.0.1:8888${DIR}${PAGE}`
  );
  Assert.deepEqual(
    KyberShield.state(v4.linkedBrowser),
    ALL_ON,
    "an IPv4 host is a site of its own"
  );
  await KyberShield.setControl(v4.linkedBrowser, "fingerprinting", false);
  Assert.deepEqual(
    Services.perms
      .getAllWithTypePrefix("kyber-shield")
      .map(p => p.principal.host),
    ["127.0.0.1"],
    "the host itself is the key"
  );
  await KyberShield.setControl(v4.linkedBrowser, "fingerprinting", true);
  BrowserTestUtils.removeTab(v4);

  let v6 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://[::1]:1/",
    false
  );
  Assert.deepEqual(
    KyberShield.state(v6.linkedBrowser),
    ALL_FALSE,
    "an IPv6 literal is unsupported"
  );
  BrowserTestUtils.removeTab(v6);
  Assert.deepEqual(shieldPerms(), [], "nothing is left stored");
});

add_task(async function test_ublock_restart_reapplies_ads_off() {
  let tab = await openPage("example.com");
  await gAddon.uninstall();
  await TestUtils.waitForCondition(
    () => !KyberUBlockBridge.running,
    "uBlock stopped"
  );
  Assert.ok(
    await KyberShield.setControl(tab.linkedBrowser, "ads", false),
    "with uBlock gone the call has nothing to do"
  );
  BrowserTestUtils.removeTab(tab);

  await installUblock();
  await waitForAdLoaded("example.com", true);
  Assert.ok(
    KyberUBlockBridge.isSiteOff("example.com"),
    "uBlock was given the stored choice when it started"
  );

  let back = await openPage("example.com");
  await KyberShield.setControl(back.linkedBrowser, "ads", true);
  BrowserTestUtils.removeTab(back);
  await waitForAdLoaded("example.com", false);
});
