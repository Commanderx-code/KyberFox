/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The shield button right of the address bar and the panel it opens. The
 * engine is KyberShield.sys.mjs; this file only draws and drives it. Loaded
 * as a module script by browser.xhtml, once per browser window.
 */

const { KyberShield } = ChromeUtils.importESModule(
  "resource:///modules/KyberShield.sys.mjs"
);

const { KyberShieldWidget } = ChromeUtils.importESModule(
  "resource:///modules/KyberShieldWidget.sys.mjs"
);

const CONTROLS = ["ads", "fingerprinting", "cookies"];

const UBLOCK_ID = "uBlock0@raymondhill.net";

// uBlock may count a few more blocked requests after the page has loaded.
const LATE_COUNT_MS = 1000;

/**
 * One window's shield button and panel.
 */
class ShieldButton {
  constructor(win) {
    this.win = win;
    this.doc = win.document;
    this.button = null;
    this.panel = null;
    this.busy = false;
    this.unreachable = false;
    this.lateTimers = new WeakMap();
    this.started = false;
    this.unloaded = false;
  }

  /**
   * Wires the button node CustomizableUI built for this window. Called from
   * the widget's onCreated, which may run before or after delayed startup.
   *
   * @param {XULElement} node
   */
  attach(node) {
    if (this.button == node) {
      return;
    }
    this.button = node;
    node.addEventListener("command", () => this.openPanel());
    this.start().catch(console.error);
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    // gBrowser does not exist yet while module scripts run, and the widget's
    // node can be built that early.
    await this.delayedStartup();
    let { gBrowser } = this.win;

    this.refreshButton();

    let listener = {
      onLocationChange: (browser, webProgress) => {
        if (webProgress.isTopLevel) {
          this.refreshFor(browser);
        }
      },
      onStateChange: (browser, webProgress, request, flags) => {
        let { STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
        if (
          webProgress.isTopLevel &&
          flags & STATE_STOP &&
          flags & STATE_IS_WINDOW
        ) {
          this.refreshFor(browser);
          this.refreshLater(browser);
        }
      },
    };
    gBrowser.addTabsProgressListener(listener);
    let onSelect = () => this.refreshButton();
    gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
    this.win.addEventListener(
      "unload",
      () => {
        gBrowser.removeTabsProgressListener(listener);
        gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
        this.unloaded = true;
      },
      { once: true }
    );
  }

  delayedStartup() {
    if (this.win.gBrowserInit?.delayedStartupFinished) {
      return Promise.resolve();
    }
    const TOPIC = "browser-delayed-startup-finished";
    return new Promise(resolve => {
      let observer = subject => {
        if (subject == this.win) {
          Services.obs.removeObserver(observer, TOPIC);
          resolve();
        }
      };
      Services.obs.addObserver(observer, TOPIC);
    });
  }

  get browser() {
    return this.win.gBrowser.selectedBrowser;
  }

  refreshFor(browser) {
    if (browser == this.browser) {
      this.refreshButton();
      if (this.panel?.state == "open") {
        this.render();
      }
    }
  }

  refreshLater(browser) {
    // One timer per browser: a background tab finishing must not cancel the
    // foreground tab's late refresh.
    this.win.clearTimeout(this.lateTimers.get(browser));
    this.lateTimers.set(
      browser,
      this.win.setTimeout(() => {
        if (!this.unloaded) {
          this.refreshFor(browser);
        }
      }, LATE_COUNT_MS)
    );
  }

  /** Redraws the button for the selected tab. */
  refreshButton() {
    let state = KyberShield.state(this.browser);
    let count =
      state.supported && state.enabled
        ? KyberShield.blockedCount(this.browser)
        : "";
    this.button.disabled = !state.supported;
    this.button.toggleAttribute(
      "shield-off",
      state.supported && !state.enabled
    );
    if (count) {
      this.button.setAttribute("badge", count);
    } else {
      this.button.removeAttribute("badge");
    }
  }

  /** The base domain the shield keys its settings by, for display. */
  siteName() {
    let uri = this.browser.currentURI;
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch (e) {
      return uri.displayHost;
    }
  }

  /** Builds the panel on first use. */
  ensurePanel() {
    if (this.panel) {
      return this.panel;
    }
    let el = (tag, props = {}) => {
      let node = this.doc.createXULElement(tag);
      Object.assign(node, props);
      return node;
    };
    let html = (tag, props = {}) => {
      let node = this.doc.createElement(tag);
      Object.assign(node, props);
      return node;
    };

    let panel = el("panel", { id: "kyber-shield-panel" });
    panel.setAttribute("type", "arrow");
    panel.setAttribute("data-l10n-id", "kyberfox-shield-panel");

    let body = el("vbox", { className: "kyber-shield-body" });
    let site = html("h2", { id: "kyber-shield-site" });
    let master = html("moz-toggle", { id: "kyber-shield-master" });

    let rows = el("vbox", { className: "kyber-shield-rows" });
    for (let control of CONTROLS) {
      let row = html("moz-toggle", { id: `kyber-shield-${control}` });
      row.setAttribute("data-l10n-id", `kyberfox-shield-${control}`);
      rows.append(row);
    }

    let note = (id, l10nId) => {
      let node = html("p", {
        id,
        className: "kyber-shield-note",
        hidden: true,
      });
      node.setAttribute("data-l10n-id", l10nId);
      return node;
    };
    // Opens uBlock Origin's dashboard for custom filters and lists.
    let advanced = html("moz-button", { id: "kyber-shield-advanced" });
    advanced.setAttribute("type", "ghost");
    advanced.setAttribute("data-l10n-id", "kyberfox-shield-advanced");
    advanced.addEventListener("click", () => this.openAdvanced());
    body.append(
      site,
      master,
      rows,
      note("kyber-shield-cookies-note", "kyberfox-shield-cookies-note"),
      note("kyber-shield-private-note", "kyberfox-shield-private-note"),
      note("kyber-shield-error", "kyberfox-shield-unreachable"),
      advanced
    );
    panel.append(body);

    panel.addEventListener("popupshowing", () => {
      this.unreachable = false;
      this.render();
    });
    panel.addEventListener("toggle", e => this.onToggle(e));
    this.doc.getElementById("mainPopupSet").append(panel);
    this.panel = panel;
    return panel;
  }

  openAdvanced() {
    let policy = WebExtensionPolicy.getByID(UBLOCK_ID);
    if (!policy) {
      return;
    }
    this.panel.hidePopup();
    this.win.openTrustedLinkIn(policy.getURL("dashboard.html"), "tab");
  }

  openPanel() {
    this.ensurePanel().openPopup(this.button, "after_end");
  }

  /** Redraws the panel from the stored state of the selected tab. */
  render() {
    let panel = this.panel;
    let state = KyberShield.state(this.browser);
    let query = id => panel.querySelector(`#kyber-shield-${id}`);

    query("site").textContent = this.siteName();
    let master = query("master");
    this.doc.l10n.setAttributes(master, "kyberfox-shield-master", {
      site: this.siteName(),
    });
    master.pressed = state.enabled;
    for (let control of CONTROLS) {
      let row = query(control);
      row.hidden = !state.perControl;
      row.pressed = state[control];
      // A control cannot be switched on while the whole shield is off.
      row.disabled = !state.enabled;
    }
    query("cookies-note").hidden = !(
      state.perControl &&
      state.enabled &&
      !state.cookies
    );
    query("private-note").hidden = state.perControl;
    query("error").hidden = !this.unreachable;
    query("advanced").hidden = !WebExtensionPolicy.getByID(UBLOCK_ID);
  }

  async onToggle(event) {
    let target = event.target;
    let control = target.id.replace("kyber-shield-", "");
    if (this.busy || (control != "master" && !CONTROLS.includes(control))) {
      this.render();
      return;
    }
    this.busy = true;
    let browser = this.browser;
    let value = target.pressed;
    try {
      let ok =
        control == "master"
          ? await KyberShield.setEnabled(browser, value)
          : await KyberShield.setControl(browser, control, value);
      this.unreachable = !ok;
      this.render();
      // The page must reload for the change to take effect. If uBlock could
      // not be reached nothing changed, so there is nothing to reload.
      if (ok) {
        browser.reload();
      }
      this.refreshButton();
    } finally {
      this.busy = false;
    }
  }
}

// The module is evaluated by a script element, so `window` is the browser
// window itself.
const shield = new ShieldButton(window);
// CustomizableUI builds this window's button later and hands it over here.
window.kyberShieldAttach = node => shield.attach(node);
KyberShieldWidget.ensure();
