/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Kyber Fox shield: the per-site switch over three protections.
 *
 * The user's choices live in Services.perms, keyed by the site's base domain
 * (the principal of https://<base domain>), so subdomains share them. Absent
 * means protected: only a switched-off protection is stored. Each choice is
 * applied to the mechanism that does the protecting:
 *
 *  - ads: uBlock Origin's per-site switch (KyberUBlockBridge). Firefox's own
 *    tracker blocking stays on whatever this control says;
 *  - fingerprinting: a per-domain override of Firefox's fingerprinting
 *    protection, and an entry in the resist fingerprinting exemption list,
 *    which is the only per-site lever while resistFingerprinting is on (the
 *    Strict preset): Firefox reads no override in that mode;
 *  - cookies: the "trackingprotection" permission, Firefox's only per-site
 *    lever for cookie blocking.
 *
 * Coupling: that permission is the content blocking allow list, so with
 * cookies off Firefox's tracker and fingerprinting protection are lifted for
 * the site too (uBlock keeps blocking). state() reports this truth.
 *
 * Private windows: nothing global is written. The only lever is the master
 * switch, as the session-only "trackingprotection-pb" permission on the
 * private-browsing principal of the base domain, and the three controls
 * follow it (state().perControl is false there). state() still reports global
 * state written from normal windows, which applies there too.
 */

import { KyberUBlockBridge } from "resource:///modules/KyberUBlockBridge.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ContentBlockingAllowList:
    "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

const MASTER = "kyber-shield";
const CONTROLS = {
  ads: "kyber-shield-ads",
  fingerprinting: "kyber-shield-fp",
  cookies: "kyber-shield-cookies",
};
const ALLOW_LIST = "trackingprotection";
const ALLOW_LIST_PB = "trackingprotection-pb";

const FP_PREFS = [
  "privacy.fingerprintingProtection.granularOverrides",
  "privacy.baselineFingerprintingProtection.granularOverrides",
];
const FP_OVERRIDE = "-AllTargets";
const RFP_EXEMPT = "privacy.resistFingerprinting.exemptedDomains";

/**
 * The site a browser shows, or null if the shield does not handle the page.
 * Literal IPv4 hosts are their own site; IPv6 literals are not handled.
 *
 * @param {XULBrowserElement} browser
 * @returns {{domain: string, priv: boolean}|null}
 */
function siteOf(browser) {
  let uri = browser?.currentURI;
  if (!uri || (uri.scheme != "http" && uri.scheme != "https")) {
    return null;
  }
  let host;
  try {
    host = uri.host;
  } catch (e) {
    return null;
  }
  if (!host || host.includes(":") || host.startsWith("[")) {
    return null;
  }
  let domain = host;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    try {
      domain = Services.eTLD.getBaseDomain(uri);
    } catch (e) {
      // A single-label host such as localhost.
    }
  }
  return { domain, priv: lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) };
}

function principalFor(domain) {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    `https://${domain}`
  );
}

function isOn(domain, type) {
  return (
    Services.perms.testExactPermissionFromPrincipal(
      principalFor(domain),
      type
    ) != Services.perms.DENY_ACTION
  );
}

function storeChoice(domain, type, value) {
  let principal = principalFor(domain);
  if (value) {
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

// Whether a control's own choice and the master are both on.
function isProtected(domain, control) {
  return isOn(domain, MASTER) && isOn(domain, CONTROLS[control]);
}

// Whether the content blocking allow list covers the site: an entry on the
// base domain (Firefox looks entries up non-exactly), or one Firefox wrote
// for the browser's own principal, such as a www. page.
function allowListed(domain, browser) {
  return (
    Services.perms.testPermissionFromPrincipal(
      principalFor(domain),
      ALLOW_LIST
    ) == Services.perms.ALLOW_ACTION ||
    (!!browser &&
      lazy.ContentBlockingAllowList.canHandle(browser) &&
      lazy.ContentBlockingAllowList.includes(browser))
  );
}

// The private-browsing master switch is a session permission on the base
// domain's private-browsing principal.
function privatePrincipal(domain) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(`https://${domain}`),
    { privateBrowsingId: 1 }
  );
}

function privateEntry(domain, browser) {
  return (
    Services.perms.testPermissionFromPrincipal(
      privatePrincipal(domain),
      ALLOW_LIST_PB
    ) == Services.perms.ALLOW_ACTION ||
    (lazy.ContentBlockingAllowList.canHandle(browser) &&
      lazy.ContentBlockingAllowList.includes(browser))
  );
}

let gObservingPrivate = false;

function setPrivateEntry(domain, off) {
  let principal = privatePrincipal(domain);
  if (off) {
    if (!gObservingPrivate) {
      gObservingPrivate = true;
      // Session permissions outlive the last private window; drop them.
      Services.obs.addObserver(() => {
        Services.perms.removeByType(ALLOW_LIST_PB);
      }, "last-pb-context-exited");
    }
    Services.perms.addFromPrincipal(
      principal,
      ALLOW_LIST_PB,
      Services.perms.ALLOW_ACTION,
      Services.perms.EXPIRE_SESSION
    );
    return;
  }
  Services.perms.removeFromPrincipal(principal, ALLOW_LIST_PB);
  for (let perm of Services.perms.getAllWithTypePrefix(ALLOW_LIST_PB)) {
    let host = perm.principal.host;
    if (perm.type == ALLOW_LIST_PB && host.endsWith(`.${domain}`)) {
      Services.perms.removePermission(perm);
    }
  }
}

// Fingerprinting protection

function fpEntryIsOurs(entry, domain) {
  return (
    entry?.firstPartyDomain === domain &&
    entry.overrides === FP_OVERRIDE &&
    !entry.thirdPartyDomain
  );
}

// Whether Firefox's fingerprinting protection has our exception for the site.
function fpOverridden(domain) {
  try {
    let list = JSON.parse(
      Services.prefs.getStringPref(FP_PREFS[0], "") || "[]"
    );
    return Array.isArray(list) && list.some(e => fpEntryIsOurs(e, domain));
  } catch (e) {
    return false;
  }
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

// The exemption list entries for a site: the base domain and its subdomains.
function rfpEntries(domain) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(domain)
    ? [domain]
    : [domain, `*.${domain}`];
}

function rfpExemptList() {
  return Services.prefs
    .getStringPref(RFP_EXEMPT, "")
    .split(",")
    .map(e => e.trim())
    .filter(Boolean);
}

// Whether resist fingerprinting exempts the site.
function rfpExempted(domain) {
  return rfpExemptList().some(e => e.toLowerCase() == domain);
}

// Adds or removes the site's entries, keeping every other entry.
function enforceRFPExemption(domain, protect) {
  let ours = rfpEntries(domain);
  let kept = rfpExemptList().filter(e => !ours.includes(e.toLowerCase()));
  if (!protect) {
    kept.push(...ours);
  }
  let value = kept.join(",");
  let initial = Services.prefs
    .getDefaultBranch("")
    .getStringPref(RFP_EXEMPT, "");
  if (value == initial) {
    Services.prefs.clearUserPref(RFP_EXEMPT);
  } else {
    Services.prefs.setStringPref(RFP_EXEMPT, value);
  }
}

// Cookies: the content blocking allow list

function enforceCookies(domain, protect) {
  let principal = principalFor(domain);
  if (!protect) {
    Services.perms.addFromPrincipal(
      principal,
      ALLOW_LIST,
      Services.perms.ALLOW_ACTION,
      Services.perms.EXPIRE_NEVER
    );
    return;
  }
  // Also entries Firefox wrote for a subdomain page.
  for (let perm of Services.perms.getAllWithTypePrefix(ALLOW_LIST)) {
    let host = perm.principal.host;
    if (
      perm.type == ALLOW_LIST &&
      (host == domain || host.endsWith(`.${domain}`))
    ) {
      Services.perms.removePermission(perm);
    }
  }
}

// Ads: uBlock Origin and Firefox's tracker blocking

function enforceAds(domain, protect) {
  return KyberUBlockBridge.setSite(domain, protect);
}

// Applies one control's current effective value to its mechanism.
function enforce(domain, control) {
  let protect = isProtected(domain, control);
  switch (control) {
    case "ads":
      return enforceAds(domain, protect);
    case "fingerprinting":
      enforceFingerprinting(domain, protect);
      enforceRFPExemption(domain, protect);
      break;
    case "cookies":
      enforceCookies(domain, protect);
      break;
  }
  return Promise.resolve(true);
}

// Every base domain with a stored choice.
function storedDomains() {
  let domains = new Set();
  for (let perm of Services.perms.getAllWithTypePrefix("kyber-shield")) {
    domains.add(perm.principal.host);
  }
  return domains;
}

// uBlock may start after the browser (or be reinstalled): give it back the
// sites the user switched ads off for.
KyberUBlockBridge.onStart(async () => {
  for (let domain of storedDomains()) {
    if (!isProtected(domain, "ads")) {
      await enforceAds(domain, false);
    }
  }
});

export const KyberShield = {
  /**
   * The shield's state for the page in a browser. For a page the shield does
   * not handle (about:, moz-extension:, file:, view-source:, blank) every
   * flag is false. The flags are the effective truth: all three read off
   * while the master switch is off, fingerprinting and cookies read off while
   * the content blocking allow list covers the site, and ads read off while
   * uBlock does not filter it. In a private window only the master switch
   * exists: perControl is false and the three controls mirror enabled.
   *
   * @param {XULBrowserElement} browser
   * @returns {{supported: boolean, perControl: boolean, enabled: boolean,
   *   ads: boolean, fingerprinting: boolean, cookies: boolean}}
   */
  state(browser) {
    let site = siteOf(browser);
    if (!site) {
      return {
        supported: false,
        perControl: false,
        enabled: false,
        ads: false,
        fingerprinting: false,
        cookies: false,
      };
    }
    let { domain, priv } = site;
    if (priv) {
      // Global state from normal windows applies here too.
      let enabled = !privateEntry(domain, browser) && !allowListed(domain);
      return {
        supported: true,
        perControl: false,
        enabled,
        ads:
          enabled &&
          !(
            KyberUBlockBridge.privateAllowed &&
            KyberUBlockBridge.isSiteOff(domain)
          ),
        fingerprinting:
          enabled && !fpOverridden(domain) && !rfpExempted(domain),
        cookies: enabled,
      };
    }
    let listed = allowListed(domain, browser);
    return {
      supported: true,
      perControl: true,
      enabled: isOn(domain, MASTER),
      ads: isProtected(domain, "ads") && !KyberUBlockBridge.isSiteOff(domain),
      fingerprinting:
        isProtected(domain, "fingerprinting") &&
        !listed &&
        !rfpExempted(domain),
      cookies: isProtected(domain, "cookies") && !listed,
    };
  },

  /**
   * Turns the whole shield on or off for the site, keeping each control's own
   * choice. In a private window this is the only switch and lasts for the
   * session.
   *
   * @param {XULBrowserElement} browser
   * @param {boolean} value
   * @returns {Promise<boolean>} False if uBlock is running but could not be
   *   reached; true otherwise, also for a page the shield does not handle.
   */
  async setEnabled(browser, value) {
    let site = siteOf(browser);
    if (!site) {
      return true;
    }
    if (site.priv) {
      setPrivateEntry(site.domain, !value);
      return true;
    }
    storeChoice(site.domain, MASTER, !!value);
    let results = await Promise.all(
      Object.keys(CONTROLS).map(control => enforce(site.domain, control))
    );
    return results.every(Boolean);
  },

  /**
   * Turns one protection on or off for the site. Does nothing in a private
   * window, which has no per-control switches.
   *
   * @param {XULBrowserElement} browser
   * @param {"ads"|"fingerprinting"|"cookies"} control
   * @param {boolean} value
   * @returns {Promise<boolean>} False if uBlock is running but could not be
   *   reached; true otherwise.
   */
  async setControl(browser, control, value) {
    let site = siteOf(browser);
    if (!site || site.priv || !Object.hasOwn(CONTROLS, control)) {
      return true;
    }
    storeChoice(site.domain, CONTROLS[control], !!value);
    return enforce(site.domain, control);
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
    return KyberUBlockBridge.blockedCount(browser);
  },

  /**
   * Whether the ad blocker filters the page in a browser. The ads flag of
   * state() is the user's choice for the site; this says whether anything
   * carries it out.
   *
   * @param {XULBrowserElement} browser
   * @returns {"running"|"private"|"stopped"} "private" in a private window
   *   the ad blocker is not allowed in; "stopped" when it is turned off or
   *   removed.
   */
  adBlocking(browser) {
    if (!KyberUBlockBridge.running) {
      return "stopped";
    }
    if (
      lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) &&
      !KyberUBlockBridge.privateAllowed
    ) {
      return "private";
    }
    return "running";
  },

  /**
   * Runs a callback each time the ad blocker starts or stops.
   *
   * @param {Function} callback
   * @returns {Function} Removes the callback.
   */
  onAdBlockingChange(callback) {
    let removers = [
      KyberUBlockBridge.onStart(callback),
      KyberUBlockBridge.onStop(callback),
    ];
    return () => removers.forEach(remove => remove());
  },
};
