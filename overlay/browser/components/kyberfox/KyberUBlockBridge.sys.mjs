/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The bridge to uBlock Origin for the shield.
 *
 * uBlock stays the signed upstream add-on and has no external messaging, so a
 * frame script (content/shield-ublock-frame.js) runs in its background page
 * and calls the listeners its own UI uses. This module injects that script,
 * matches replies to calls, and reads uBlock's toolbar badge. See
 * docs/shield-ublock-control.md.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const UBLOCK_ID = "uBlock0@raymondhill.net";
const FRAME_SCRIPT = "chrome://kyberfox/content/shield-ublock-frame.js";
const CALL_TIMEOUT_MS = 5000;
const READY_RETRY_MS = 500;
const READY_TRIES = 40;

/** Background pages that already have the frame script. */
const gScripted = new WeakSet();
let gCallId = 0;

/** Sites uBlock does not filter, as of its last reply. */
let gOffSites = new Set();

/** Every toggle sent, for tests: {domain, protect, ok}. */
const gCallLog = [];

const gStartCallbacks = new Set();
let gWatching = false;

function extension() {
  return lazy.ExtensionParent.GlobalManager.getExtension(UBLOCK_ID);
}

// Sends one request to the frame script and waits for the matching reply.
// Resolves {ok, sites}, or null if uBlock is not running, did not answer in
// time, or could not be called.
async function send(request) {
  let bg = extension()?.backgroundContext?.xulBrowser;
  if (!bg) {
    return null;
  }
  try {
    let mm = bg.messageManager;
    if (!gScripted.has(bg)) {
      mm.loadFrameScript(FRAME_SCRIPT, true);
      gScripted.add(bg);
    }
    let id = ++gCallId;
    return await new Promise(resolve => {
      let done = reply => {
        lazy.clearTimeout(timer);
        mm.removeMessageListener("KyberShield:UblockDone", listener);
        resolve(reply);
      };
      let listener = ({ data }) => {
        if (data.id == id) {
          done(data);
        }
      };
      let timer = lazy.setTimeout(() => done(null), CALL_TIMEOUT_MS);
      mm.addMessageListener("KyberShield:UblockDone", listener);
      mm.sendAsyncMessage("KyberShield:Ublock", { id, ...request });
    });
  } catch (e) {
    console.error("KyberShield: could not reach uBlock Origin", e);
    return null;
  }
}

function watchStart() {
  if (gWatching) {
    return;
  }
  gWatching = true;
  lazy.ExtensionParent.apiManager.on("ready", async (kind, ext) => {
    if (ext.id != UBLOCK_ID) {
      return;
    }
    // uBlock registers its listeners a little after its page loads.
    for (let i = 0; i < READY_TRIES; i++) {
      if (await KyberUBlockBridge.refresh()) {
        for (let callback of gStartCallbacks) {
          callback();
        }
        return;
      }
      await new Promise(r => lazy.setTimeout(r, READY_RETRY_MS));
    }
    console.warn("KyberShield: uBlock Origin started but cannot be called");
  });
}

export const KyberUBlockBridge = {
  /** Whether uBlock Origin is running. */
  get running() {
    return !!extension();
  },

  /** The toggles sent so far, newest last. */
  get callLog() {
    return gCallLog;
  },

  /**
   * Runs a callback each time uBlock has started and answers calls.
   *
   * @param {Function} callback
   */
  onStart(callback) {
    gStartCallbacks.add(callback);
    watchStart();
  },

  // Whether uBlock does not filter a base domain (last known).
  isSiteOff(domain) {
    return gOffSites.has(domain);
  },

  /**
   * Re-reads the sites uBlock does not filter.
   *
   * @returns {Promise<boolean>} Whether uBlock answered.
   */
  async refresh() {
    let reply = await send({ op: "read" });
    if (reply?.ok) {
      gOffSites = new Set(reply.sites);
    }
    return !!reply?.ok;
  },

  /**
   * Turns uBlock's filtering on or off for a base domain (and its
   * subdomains). Resolves true when the change took effect, or when uBlock is
   * not running (nothing to do); false, with a warning, if it runs but the
   * call failed.
   *
   * @param {string} domain
   * @param {boolean} protect
   * @returns {Promise<boolean>}
   */
  async setSite(domain, protect) {
    if (!this.running) {
      return true;
    }
    let reply = await send({
      op: "toggle",
      domain,
      url: `https://${domain}/`,
      state: protect,
    });
    let ok = !!reply?.ok;
    gCallLog.push({ domain, protect, ok });
    if (reply?.sites) {
      gOffSites = new Set(reply.sites);
    }
    if (!ok) {
      console.warn(
        `KyberShield: uBlock Origin did not ${protect ? "enable" : "disable"} filtering for ${domain}`
      );
    }
    return ok;
  },

  /**
   * The text of uBlock's toolbar badge on a browser's tab: the number of
   * requests it blocked there. Empty when there are none, or uBlock is not
   * running or not allowed on the page.
   *
   * @param {XULBrowserElement} browser
   * @returns {string}
   */
  blockedCount(browser) {
    try {
      let ext = extension();
      let win = browser.documentGlobal;
      let tab = win?.gBrowser?.getTabForBrowser(browser);
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
