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

function fpEntries() {
  return JSON.parse(Services.prefs.getStringPref(FP_PREF, "") || "[]").filter(
    e => e.overrides == "-AllTargets"
  );
}

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

add_setup(async function () {
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
  let addon = await AddonManager.getAddonByID(UBLOCK_ID);

  registerCleanupFunction(async () => {
    await addon.uninstall();
    Services.policies.wrappedJSObject.setExtensionPolicies({});
    Services.prefs.clearUserPref(FP_PREF);
    Services.prefs.clearUserPref(
      "privacy.baselineFingerprintingProtection.granularOverrides"
    );
    Services.perms.removeByType("cookie");
    Services.perms.removeByType("trackingprotection");
    for (let type of PERM_TYPES) {
      Services.perms.removeByType(type);
      Services.perms.removeByType(`${type}-pb`);
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
    {
      supported: true,
      enabled: true,
      ads: true,
      fingerprinting: true,
      cookies: true,
    },
    "a site nobody touched has every protection on"
  );
  Assert.ok(!(await adLoaded(browser)), "uBlock blocks the ad script");
  Assert.deepEqual(shieldPerms(), [], "defaults store nothing");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_master_off_disables_all_three() {
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;

  await KyberShield.setEnabled(browser, false);
  Assert.deepEqual(
    KyberShield.state(browser),
    {
      supported: true,
      enabled: false,
      ads: false,
      fingerprinting: false,
      cookies: false,
    },
    "the master switch turns the three controls off"
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      principalFor("example.com"),
      "cookie"
    ),
    Services.perms.ALLOW_ACTION,
    "cookies are allowed for the site"
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      principalFor("example.com"),
      "trackingprotection"
    ),
    Services.perms.ALLOW_ACTION,
    "Firefox tracking protection is off for the site"
  );
  Assert.deepEqual(
    fpEntries().map(e => e.firstPartyDomain),
    ["example.com"],
    "fingerprinting protection has an exception for the site"
  );
  await waitForAdLoaded("example.com", true);

  await KyberShield.setEnabled(browser, true);
  Assert.deepEqual(
    KyberShield.state(browser),
    {
      supported: true,
      enabled: true,
      ads: true,
      fingerprinting: true,
      cookies: true,
    },
    "turning the master switch on restores the controls"
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      principalFor("example.com"),
      "cookie"
    ),
    Services.perms.UNKNOWN_ACTION,
    "the cookie exception is gone"
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      principalFor("example.com"),
      "trackingprotection"
    ),
    Services.perms.UNKNOWN_ACTION,
    "the tracking protection exception is gone"
  );
  Assert.deepEqual(fpEntries(), [], "the fingerprinting exception is gone");
  await waitForAdLoaded("example.com", false);
  BrowserTestUtils.removeTab(tab);
  Assert.deepEqual(shieldPerms(), [], "nothing is left stored");
});

add_task(async function test_control_persists_per_site() {
  let tab = await openPage("example.com");
  let browser = tab.linkedBrowser;

  await KyberShield.setControl(browser, "fingerprinting", false);
  Assert.deepEqual(
    KyberShield.state(browser),
    {
      supported: true,
      enabled: true,
      ads: true,
      fingerprinting: false,
      cookies: true,
    },
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
    {
      supported: true,
      enabled: true,
      ads: true,
      fingerprinting: true,
      cookies: true,
    },
    "another site is untouched"
  );
  BrowserTestUtils.removeTab(other);

  let back = await openPage("example.com");
  await KyberShield.setControl(back.linkedBrowser, "fingerprinting", true);
  Assert.deepEqual(shieldPerms(), [], "turning it back on stores nothing");
  Assert.deepEqual(fpEntries(), [], "and removes the exception");
  BrowserTestUtils.removeTab(back);
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

  for (let host of ["www.example.com", "sub1.test1.example.com"]) {
    let sub = await openPage(host);
    Assert.equal(
      KyberShield.state(sub.linkedBrowser).cookies,
      false,
      `${host} shares the base domain's setting`
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
  await waitForAdLoaded("www.example.com", false);
});

add_task(async function test_about_page_unsupported() {
  for (let spec of ["about:blank", "about:preferences"]) {
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, spec);
    let state = KyberShield.state(tab.linkedBrowser);
    Assert.equal(state.supported, false, `${spec} is unsupported`);
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
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    url("example.com")
  );
  let browser = tab.linkedBrowser;

  await KyberShield.setControl(browser, "cookies", false);
  await KyberShield.setControl(browser, "fingerprinting", false);
  Assert.equal(
    KyberShield.state(browser).cookies,
    false,
    "applies in the window"
  );
  Assert.equal(KyberShield.state(browser).fingerprinting, false);

  let perms = Services.perms.getAllWithTypePrefix("kyber-shield");
  Assert.greater(perms.length, 0, "the choice is stored for the session");
  for (let p of perms) {
    Assert.equal(
      p.expireType,
      Services.perms.EXPIRE_SESSION,
      `${p.type} expires with the session`
    );
  }

  let normal = await openPage("example.com");
  Assert.deepEqual(
    KyberShield.state(normal.linkedBrowser),
    {
      supported: true,
      enabled: true,
      ads: true,
      fingerprinting: true,
      cookies: true,
    },
    "a normal window does not see the private choice"
  );
  BrowserTestUtils.removeTab(normal);

  let exited = TestUtils.topicObserved("last-pb-context-exited");
  await BrowserTestUtils.closeWindow(win);
  await exited;
  await TestUtils.waitForCondition(
    () => !shieldPerms().length && !fpEntries().length,
    "closing the last private window leaves nothing behind"
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      principalFor("example.com"),
      "cookie"
    ),
    Services.perms.UNKNOWN_ACTION,
    "the private cookie exception is gone"
  );
});
