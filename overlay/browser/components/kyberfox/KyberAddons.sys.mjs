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

export const KyberAddons = {
  WELCOME_URL,

  /** Replaces the AMO call in tests: async (url) => void, rejects on failure. */
  _installForTests: null,

  /** Lets a test open the page again in the same process. */
  _resetForTests() {
    gOpened = false;
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
   * The install URL for a listed add-on, or null when the id is not listed.
   *
   * @param {string} id
   */
  installURL(id) {
    let entry = load().addons.find(a => a.id == id);
    return entry
      ? AMO_PREFIX + encodeURIComponent(entry.slug) + AMO_SUFFIX
      : null;
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
   * add-on and never reject the whole call.
   *
   * @param {string[]} ids
   * @param {(result: {id, ok, error?}|{id, installing: true}) => void} [onProgress]
   * @returns {Promise<{id: string, ok: boolean, error?: string}[]>}
   */
  async install(ids, onProgress = null) {
    let results = [];
    for (let id of ids) {
      let result = { id, ok: true };
      onProgress?.({ id, installing: true });
      try {
        let url = this.installURL(id);
        if (!url) {
          throw new Error("Not a recommended add-on.");
        }
        if (this._installForTests) {
          await this._installForTests(url);
        } else {
          let install = await lazy.AddonManager.getInstallForURL(url, {
            telemetryInfo: { source: "kyberfox-welcome" },
          });
          await install.install();
        }
      } catch (e) {
        result = { id, ok: false, error: e?.message || String(e) };
      }
      results.push(result);
      onProgress?.(result);
    }
    return results;
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
   * window, and only while kyberfox.welcome.shown is false.
   *
   * @param {Window} window
   * @returns {?XULElement} the tab, or null when nothing was opened.
   */
  maybeOpenWelcome(window) {
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
