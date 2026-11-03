/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Kyber Fox shield: the per-site switch over three protections.
 *
 * The user's choices live in Services.perms, keyed by the site's base domain
 * (the principal of https://<base domain>), so subdomains share them. Absent
 * means protected: only a switched-off protection is stored. The module
 * applies each choice to the mechanism that does the protecting:
 *
 *  - ads: uBlock Origin's per-site switch, plus Firefox's tracking protection
 *    through the content blocking allow list;
 *  - fingerprinting: a per-domain override of Firefox's fingerprinting
 *    protection;
 *  - cookies: the "cookie" permission.
 *
 * uBlock stays the signed upstream add-on. It has no external messaging and
 * extensions.quarantinedDomains cannot silence it (docs/shield-ublock-
 * control.md), so a frame script runs in its background page and calls the
 * listener its own popup uses.
 *
 * In a private window the choice is kept for the session only: it goes to
 * "-pb" permissions (the content blocking allow list does the same), which
 * Firefox drops with the last private window. The prefs and uBlock's list
 * that enforce a choice are global, so the module records which domains a
 * private window touched and puts them back to the normal settings when the
 * last private window closes.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ContentBlockingAllowList:
    "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const UBLOCK_ID = "uBlock0@raymondhill.net";
const FRAME_SCRIPT = "chrome://kyberfox/content/shield-ublock-frame.js";
const UBLOCK_TIMEOUT_MS = 5000;

const MASTER = "kyber-shield";
const CONTROLS = {
  ads: "kyber-shield-ads",
  fingerprinting: "kyber-shield-fp",
  cookies: "kyber-shield-cookies",
};
const PB_SUFFIX = "-pb";

const FP_PREFS = [
  "privacy.fingerprintingProtection.granularOverrides",
  "privacy.baselineFingerprintingProtection.granularOverrides",
];
const FP_OVERRIDE = "-AllTargets";

/** Domains whose enforcement a private window changed. */
const gPrivateDomains = new Set();
let gObservingPrivate = false;

/** Background pages that already have the frame script. */
const gScripted = new WeakSet();
let gCallId = 0;

/**
 * The site a browser shows, or null if the shield does not handle the page.
 *
 * @param {XULBrowserElement} browser
 * @returns {{domain: string, priv: boolean}|null}
 */
function siteOf(browser) {
  let uri = browser?.currentURI;
  if (!uri || (uri.scheme != "http" && uri.scheme != "https")) {
    return null;
  }
  let domain;
  try {
    domain = Services.eTLD.getBaseDomain(uri);
  } catch (e) {
    // An IP address, or a single-label host such as localhost.
    try {
      domain = uri.host;
    } catch (e2) {
      return null;
    }
  }
  if (!domain) {
    return null;
  }
  return { domain, priv: lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) };
}

function principalFor(domain) {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    `https://${domain}`
  );
}

// Whether a protection is on: a private choice first, then the stored one.
function isOn(domain, type, priv) {
  let principal = principalFor(domain);
  if (priv) {
    let action = Services.perms.testExactPermissionFromPrincipal(
      principal,
      type + PB_SUFFIX
    );
    if (action == Services.perms.ALLOW_ACTION) {
      return true;
    }
    if (action == Services.perms.DENY_ACTION) {
      return false;
    }
  }
  return (
    Services.perms.testExactPermissionFromPrincipal(principal, type) !=
    Services.perms.DENY_ACTION
  );
}

function storeChoice(domain, type, value, priv) {
  let principal = principalFor(domain);
  if (priv) {
    observePrivate();
    gPrivateDomains.add(domain);
    Services.perms.addFromPrincipal(
      principal,
      type + PB_SUFFIX,
      value ? Services.perms.ALLOW_ACTION : Services.perms.DENY_ACTION,
      Services.perms.EXPIRE_SESSION
    );
  } else if (value) {
    Services.perms.removeFromPrincipal(principal, type);
  } else {
    Services.perms.addFromPrincipal(
      principal,
      type,
      Services.perms.DENY_ACTION,
      Services.perms.EXPIRE_NEVER
    );
  }
}

// Whether a control protects the site right now: it and the master are on.
function isProtected(domain, control, priv) {
  return isOn(domain, MASTER, priv) && isOn(domain, CONTROLS[control], priv);
}

function observePrivate() {
  if (gObservingPrivate) {
    return;
  }
  gObservingPrivate = true;
  Services.obs.addObserver(() => {
    for (let type of [MASTER, ...Object.values(CONTROLS)]) {
      Services.perms.removeByType(type + PB_SUFFIX);
    }
    let domains = [...gPrivateDomains];
    gPrivateDomains.clear();
    for (let domain of domains) {
      // The window is gone; the allow list drops its own private entries.
      enforce(null, domain, "ads", false);
      enforce(null, domain, "fingerprinting", false);
      enforce(null, domain, "cookies", false);
    }
  }, "last-pb-context-exited");
}

// Fingerprinting protection

function fpEntryIsOurs(entry, domain) {
  return (
    entry?.firstPartyDomain === domain &&
    entry.overrides === FP_OVERRIDE &&
    !entry.thirdPartyDomain
  );
}

function enforceFingerprinting(domain, protect) {
  for (let pref of FP_PREFS) {
    let list = [];
    let raw = Services.prefs.getStringPref(pref, "");
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch (e) {
        list = null;
      }
      if (!Array.isArray(list)) {
        console.error(`KyberShield: ${pref} is not a JSON list; left alone`);
        continue;
      }
    }
    let kept = list.filter(e => !fpEntryIsOurs(e, domain));
    if (!protect) {
      kept.push({ firstPartyDomain: domain, overrides: FP_OVERRIDE });
    }
    if (kept.length) {
      Services.prefs.setStringPref(pref, JSON.stringify(kept));
    } else {
      Services.prefs.clearUserPref(pref);
    }
  }
}

// Cookies

function enforceCookies(domain, protect, priv) {
  let principal = principalFor(domain);
  if (!protect) {
    Services.perms.addFromPrincipal(
      principal,
      "cookie",
      Services.perms.ALLOW_ACTION,
      priv ? Services.perms.EXPIRE_SESSION : Services.perms.EXPIRE_NEVER
    );
  } else if (
    Services.perms.testExactPermissionFromPrincipal(principal, "cookie") ==
    Services.perms.ALLOW_ACTION
  ) {
    Services.perms.removeFromPrincipal(principal, "cookie");
  }
}

// Ads: uBlock Origin and Firefox tracking protection

function ublockExtension() {
  return lazy.ExtensionParent.GlobalManager.getExtension(UBLOCK_ID);
}

// The tab to send uBlock's call from: the browser's, or any normal window's.
function tabForUblock(browser) {
  let win = browser
    ? browser.documentGlobal
    : Services.wm.getMostRecentWindow("navigator:browser");
  if (!win?.gBrowser) {
    return null;
  }
  return browser
    ? win.gBrowser.getTabForBrowser(browser)
    : win.gBrowser.selectedTab;
}

// Turns uBlock's per-site switch for a domain on or off through the listener
// its popup panel uses. Resolves true if uBlock took the call. A tab is
// needed because uBlock looks the page store up by tab id.
async function setUblock(browser, domain, protect) {
  try {
    let ext = ublockExtension();
    let bg = ext?.backgroundContext?.xulBrowser;
    let tab = tabForUblock(browser);
    if (!bg || !tab) {
      return false;
    }
    let tabId = ext.tabManager.getWrapper(tab)?.id;
    if (tabId === undefined) {
      return false;
    }
    let mm = bg.messageManager;
    if (!gScripted.has(bg)) {
      mm.loadFrameScript(FRAME_SCRIPT, true);
      gScripted.add(bg);
    }
    let id = ++gCallId;
    return await new Promise(resolve => {
      let done = result => {
        lazy.clearTimeout(timer);
        mm.removeMessageListener("KyberShield:UblockDone", listener);
        resolve(result);
      };
      let listener = ({ data }) => {
        if (data.id == id) {
          done(data.ok);
        }
      };
      let timer = lazy.setTimeout(() => done(false), UBLOCK_TIMEOUT_MS);
      mm.addMessageListener("KyberShield:UblockDone", listener);
      mm.sendAsyncMessage("KyberShield:Ublock", {
        id,
        url: `https://${domain}/`,
        state: protect,
        tabId,
      });
    });
  } catch (e) {
    console.error("KyberShield: could not reach uBlock Origin", e);
    return false;
  }
}

async function enforceAds(browser, domain, protect) {
  if (browser && lazy.ContentBlockingAllowList.canHandle(browser)) {
    if (protect) {
      lazy.ContentBlockingAllowList.remove(browser);
    } else {
      lazy.ContentBlockingAllowList.add(browser);
    }
  }
  await setUblock(browser, domain, protect);
}

// Applies one control's current effective value to its mechanism.
function enforce(browser, domain, control, priv) {
  let protect = isProtected(domain, control, priv);
  switch (control) {
    case "ads":
      return enforceAds(browser, domain, protect);
    case "fingerprinting":
      enforceFingerprinting(domain, protect);
      break;
    case "cookies":
      enforceCookies(domain, protect, priv);
      break;
  }
  return Promise.resolve();
}

export const KyberShield = {
  /**
   * The shield's state for the page in a browser. For a page the shield does
   * not handle (about:, moz-extension:, file:, view-source:, blank) every
   * flag is false. A control reads as off while the master switch is off.
   *
   * @param {XULBrowserElement} browser
   * @returns {{supported: boolean, enabled: boolean, ads: boolean,
   *   fingerprinting: boolean, cookies: boolean}}
   */
  state(browser) {
    let site = siteOf(browser);
    if (!site) {
      return {
        supported: false,
        enabled: false,
        ads: false,
        fingerprinting: false,
        cookies: false,
      };
    }
    let { domain, priv } = site;
    return {
      supported: true,
      enabled: isOn(domain, MASTER, priv),
      ads: isProtected(domain, "ads", priv),
      fingerprinting: isProtected(domain, "fingerprinting", priv),
      cookies: isProtected(domain, "cookies", priv),
    };
  },

  /**
   * Turns the whole shield on or off for the site, keeping each control's own
   * choice. Resolves once uBlock has acted.
   *
   * @param {XULBrowserElement} browser
   * @param {boolean} value
   * @returns {Promise<void>}
   */
  async setEnabled(browser, value) {
    let site = siteOf(browser);
    if (!site) {
      return;
    }
    storeChoice(site.domain, MASTER, !!value, site.priv);
    await Promise.all(
      Object.keys(CONTROLS).map(control =>
        enforce(browser, site.domain, control, site.priv)
      )
    );
  },

  /**
   * Turns one protection on or off for the site. Resolves once uBlock has
   * acted.
   *
   * @param {XULBrowserElement} browser
   * @param {"ads"|"fingerprinting"|"cookies"} control
   * @param {boolean} value
   * @returns {Promise<void>}
   */
  async setControl(browser, control, value) {
    let site = siteOf(browser);
    if (!site || !Object.hasOwn(CONTROLS, control)) {
      return;
    }
    storeChoice(site.domain, CONTROLS[control], !!value, site.priv);
    await enforce(browser, site.domain, control, site.priv);
  },

  /**
   * How many requests uBlock blocked on the tab, as the text of its toolbar
   * badge. Empty when there are none, or uBlock is not running or not allowed
   * on the page.
   *
   * @param {XULBrowserElement} browser
   * @returns {string}
   */
  blockedCount(browser) {
    try {
      let ext = ublockExtension();
      let tab = tabForUblock(browser);
      if (!ext || !tab) {
        return "";
      }
      // browserActionFor() returns the API object; its action holds the
      // per-tab data.
      let api = lazy.ExtensionParent.apiManager.global.browserActionFor(ext);
      return api.action.getContextData(tab).badgeText ?? "";
    } catch (e) {
      return "";
    }
  },
};
