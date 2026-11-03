/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Kyber Fox first-run welcome page: recommended add-ons and the default
 * search engine. The list lives in settings/recommended-addons.json (shipped
 * as chrome://kyberfox/content/recommended-addons.json). Nothing here touches
 * the network until install() is called.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

const LIST_URI = "chrome://kyberfox/content/recommended-addons.json";
export const WELCOME_URL = "chrome://kyberfox/content/welcome.xhtml";
const SHOWN_PREF = "kyberfox.welcome.shown";
// The only place an install URL comes from: this prefix plus a listed slug.
const AMO_PREFIX = "https://addons.mozilla.org/firefox/downloads/latest/";
const AMO_SUFFIX = "/latest.xpi";

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

let gList = null;
let gOpened = false;

function load() {
  if (!gList) {
    let data = JSON.parse(Cu.readUTF8URI(Services.io.newURI(LIST_URI)));
    if (!Array.isArray(data.groups) || !Array.isArray(data.addons)) {
      throw new Error("recommended-addons.json has the wrong shape");
    }
    gList = data;
  }
  return gList;
}

/** An install that did not finish: kind is "canceled", "network" or "failed". */
class InstallError extends Error {
  constructor(kind, code) {
    super(`${kind}: ${code}`);
    this.kind = kind;
    this.code = String(code);
  }
}

/**
 * Turns anything an install threw into {canceled} or {kind, code}.
 *
 * @param {*} e
 */
function describeError(e) {
  if (e instanceof InstallError) {
    return e.kind == "canceled"
      ? { canceled: true }
      : { kind: e.kind, code: e.code };
  }
  if (e?.canceled) {
    return { canceled: true };
  }
  if (e?.addonErrorCode === lazy.AddonManager.ERROR_NETWORK_FAILURE) {
    return { kind: "network", code: String(e.addonErrorCode) };
  }
  return { kind: "failed", code: String(e?.addonErrorCode ?? e?.message ?? e) };
}

/**
 * Starts the install through the AOM path, which shows the permission prompt,
 * and resolves when it ends. Declining the prompt rejects as "canceled".
 *
 * @param {string} url
 * @param {XULElement} browser
 */
async function installFromAMO(url, browser) {
  if (!browser) {
    throw new InstallError("failed", "no-browser");
  }
  let install = await lazy.AddonManager.getInstallForURL(url, {
    telemetryInfo: { source: "kyberfox-welcome" },
  });
  await new Promise((resolve, reject) => {
    let finish = (fn, value) => {
      install.removeListener(listener);
      fn(value);
    };
    let failed = i => finish(reject, new InstallError("failed", i.error));
    let canceled = () => finish(reject, new InstallError("canceled", 0));
    let listener = {
      onInstallEnded: () => finish(resolve),
      onDownloadFailed: i =>
        finish(
          reject,
          new InstallError(
            i.error == lazy.AddonManager.ERROR_NETWORK_FAILURE
              ? "network"
              : "failed",
            i.error
          )
        ),
      onInstallFailed: failed,
      onDownloadCancelled: canceled,
      onInstallCancelled: canceled,
    };
    install.addListener(listener);
    try {
      lazy.AddonManager.installAddonFromAOM(
        browser,
        Services.io.newURI(WELCOME_URL),
        install
      );
    } catch (e) {
      finish(reject, e);
    }
  });
}

export const KyberAddons = {
  WELCOME_URL,

  /** Replaces the AMO call in tests: async (url) => void, rejects on failure. */
  _installForTests: null,

  /** Lets a test call maybeOpenWelcome although the browser is in automation. */
  _ignoreAutomationForTests: false,

  /** Lets a test open the page again in the same process. */
  _resetForTests() {
    gOpened = false;
    this._ignoreAutomationForTests = false;
  },

  /** The group names, in display order. */
  groups() {
    return [...load().groups];
  },

  /** @returns {{id, slug, name, summary, group, note?}[]} */
  recommended() {
    return load().addons.map(a => ({ ...a }));
  },

  /**
   * The install URL for a listed add-on, or null when the id is not listed or
   * its slug is not a plain AMO slug.
   *
   * @param {string} id
   */
  installURL(id) {
    let entry = load().addons.find(a => a.id == id);
    if (!entry || !SLUG.test(entry.slug)) {
      return null;
    }
    return AMO_PREFIX + entry.slug + AMO_SUFFIX;
  },

  /**
   * Whether the add-on is already installed.
   *
   * @param {string} id
   */
  async installed(id) {
    return !!(await lazy.AddonManager.getAddonByID(id));
  },

  /**
   * Installs the listed add-ons one after the other. Errors are reported per
   * add-on and never reject the whole call. Firefox's own permission prompt
   * and "added" doorhangers show, because the install goes through
   * AddonManager.installAddonFromAOM with the page's browser.
   *
   * A failed result has `canceled: true` when the user declined the prompt,
   * otherwise `kind` ("network" or "failed") and a `code` for support.
   *
   * @param {string[]} ids
   * @param {Function} [onProgress] called with {id, installing: true} and
   *   then with each result
   * @param {?XULElement} [browser] the welcome tab's browser
   * @returns {Promise<{id: string, ok: boolean, canceled?: boolean, kind?: string, code?: string}[]>}
   */
  async install(ids, onProgress = null, browser = null) {
    let results = [];
    let report = r => {
      try {
        onProgress?.(r);
      } catch (e) {
        console.error("KyberAddons: progress callback failed", e);
      }
    };
    for (let id of ids) {
      let result = { id, ok: true };
      report({ id, installing: true });
      try {
        let url = this.installURL(id);
        if (!url) {
          throw new InstallError("failed", "not-listed");
        }
        if (this._installForTests) {
          await this._installForTests(url);
        } else {
          await installFromAMO(url, browser);
        }
      } catch (e) {
        result = { id, ok: false, ...describeError(e) };
      }
      results.push(result);
      report(result);
    }
    return results;
  },

  /** The name of the current default search engine. */
  async defaultSearch() {
    await lazy.SearchService.init();
    return lazy.SearchService.defaultEngine.name;
  },

  /**
   * Makes the named engine the default for normal and private windows.
   *
   * @param {string} engineName
   * @returns {Promise<boolean>} false when there is no such engine.
   */
  async setSearchDefault(engineName) {
    try {
      await lazy.SearchService.init();
      let engine = lazy.SearchService.getEngineByName(engineName);
      if (!engine) {
        return false;
      }
      await lazy.SearchService.setDefault(
        engine,
        lazy.SearchService.CHANGE_REASON.USER
      );
      await lazy.SearchService.setDefaultPrivate(
        engine,
        lazy.SearchService.CHANGE_REASON.USER
      );
      return true;
    } catch (e) {
      console.error("KyberAddons: cannot set the default search engine", e);
      return false;
    }
  },

  /** Marks the page as used or skipped, so it is not opened again. */
  markShown() {
    Services.prefs.setBoolPref(SHOWN_PREF, true);
  },

  /**
   * Opens the welcome page in a tab, once per process, in the first normal
   * window, only while kyberfox.welcome.shown is false, and never in automation.
   *
   * @param {Window} window
   * @returns {?XULElement} the tab, or null when nothing was opened.
   */
  maybeOpenWelcome(window) {
    // Test runs never get a welcome tab. Plain Marionette sessions do
    // (Cu.isInAutomation is false there); scripts set kyberfox.welcome.shown.
    if (Cu.isInAutomation && !this._ignoreAutomationForTests) {
      return null;
    }
    if (
      gOpened ||
      Services.prefs.getBoolPref(SHOWN_PREF, false) ||
      window.closed ||
      lazy.PrivateBrowsingUtils.isWindowPrivate(window) ||
      !window.toolbar.visible
    ) {
      return null;
    }
    gOpened = true;
    let tab = window.gBrowser.addTab(WELCOME_URL, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    window.gBrowser.selectedTab = tab;
    return tab;
  },
};
