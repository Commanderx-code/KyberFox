/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Kyber Shields: the Crystal Guard button at the right end of the address bar
 * and the panel it opens. The engine is KyberShield.sys.mjs; this file only
 * draws and drives it. Everything the panel shows comes from real state: the
 * engine's per-site switches, uBlock Origin's blocked count for the page and
 * Firefox's site permissions. Loaded as a module script by browser.xhtml, once
 * per browser window.
 */

const { KyberShield } = ChromeUtils.importESModule(
  "resource:///modules/KyberShield.sys.mjs"
);

const { KyberUBlockBridge } = ChromeUtils.importESModule(
  "resource:///modules/KyberUBlockBridge.sys.mjs"
);

const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
);

const { SitePermissions } = ChromeUtils.importESModule(
  "resource:///modules/SitePermissions.sys.mjs"
);

const CONTROLS = ["ads", "fingerprinting", "cookies"];

const UBLOCK_ID = "uBlock0@raymondhill.net";

// uBlock may count a few more blocked requests after the page has loaded.
const LATE_COUNT_MS = 1000;

/**
 * The icon state for a page, from the engine's state: "unavailable" for pages
 * the shield does not handle, "off" with the site switched off, "attention"
 * when the site wants ads blocked but the ad blocker is not running,
 * "partial" with the site on but one protection off, "on" otherwise. A
 * protection the user switched off is a choice, never "attention".
 *
 * @param {object} state KyberShield.state()
 * @param {string} adBlocking KyberShield.adBlocking()
 * @returns {"on"|"partial"|"off"|"attention"|"unavailable"}
 */
function stateName(state, adBlocking) {
  if (!state.supported) {
    return "unavailable";
  }
  if (!state.enabled) {
    return "off";
  }
  if (state.ads && adBlocking == "stopped") {
    return "attention";
  }
  return CONTROLS.every(control => state[control]) ? "on" : "partial";
}

/**
 * The next step of "Site not working?": the protection to turn off next for
 * the site, the one that loses the least first. Cookie protection (which
 * also lifts Firefox's tracker blocking there) breaks sign-ins and embeds
 * most often, then ad blocking, then the whole shield. A private window has
 * only the whole shield.
 *
 * @param {object} state KyberShield.state()
 * @param {string} adBlocking KyberShield.adBlocking()
 * @returns {"cookies"|"ads"|"master"|null} null when nothing is left on.
 */
function nextFixStep(state, adBlocking) {
  if (!state.supported || !state.enabled) {
    return null;
  }
  if (!state.perControl) {
    return "master";
  }
  // With the ad blocker stopped, switching ads off would change nothing.
  return (
    ["cookies", "ads"].find(
      control =>
        state[control] && !(control == "ads" && adBlocking == "stopped")
    ) ?? "master"
  );
}

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

  /** Builds the button as the last icon in the address bar. */
  build() {
    let box = this.doc.createXULElement("hbox");
    box.id = "kyber-shield-button";
    box.className = "urlbar-page-action";
    box.setAttribute("role", "button");
    box.setAttribute("tabindex", "-1");
    box.setAttribute("data-l10n-id", "kyberfox-shield-button-unavailable");
    let icon = this.doc.createXULElement("image");
    icon.className = "urlbar-icon kyber-shield-icon";
    let badge = this.doc.createXULElement("label");
    badge.className = "kyber-shield-badge";
    box.append(icon, badge);
    this.doc.getElementById("page-action-buttons").append(box);

    box.addEventListener("click", event => {
      if (event.button == 0) {
        this.activate();
      }
    });
    box.addEventListener("keypress", event => {
      if (event.key == "Enter" || event.key == " ") {
        event.preventDefault();
        this.activate({ keyboard: true });
      }
    });
    this.button = box;
    this.start().catch(console.error);
  }

  activate({ keyboard = false } = {}) {
    if (!this.button.hasAttribute("disabled")) {
      this.openPanel({ keyboard });
    }
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    // gBrowser does not exist yet while module scripts run, and the widget's
    // node can be built that early.
    await this.delayedStartup();
    KyberUBlockBridge.allowInPrivateOnce().catch(console.error);
    let { gBrowser } = this.win;

    // Earlier versions put the shield in the toolbar; drop that placement.
    if (CustomizableUI.getPlacementOfWidget("kyber-shield-button")) {
      CustomizableUI.removeWidgetFromArea("kyber-shield-button");
    }
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
    // The ad blocker turned off, removed or back on.
    let stopWatching = KyberShield.onAdBlockingChange(() => {
      if (this.unloaded) {
        return;
      }
      this.refreshButton();
      if (this.panel?.state == "open") {
        this.render();
      }
    });
    this.win.addEventListener(
      "unload",
      () => {
        gBrowser.removeTabsProgressListener(listener);
        gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
        stopWatching();
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
    let shieldState = stateName(state, KyberShield.adBlocking(this.browser));
    this.button.setAttribute("shield-state", shieldState);
    this.doc.l10n.setAttributes(
      this.button,
      `kyberfox-shield-button-${shieldState}`
    );
    this.button.toggleAttribute("disabled", !state.supported);
    this.button.toggleAttribute(
      "shield-off",
      state.supported && !state.enabled
    );
    if (count) {
      this.button.setAttribute("badge", count);
    } else {
      this.button.removeAttribute("badge");
    }
    this.button.querySelector(".kyber-shield-badge").textContent = count || "";
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

    let l10n = (node, id) => {
      node.setAttribute("data-l10n-id", id);
      return node;
    };
    let icon = (className, src) => {
      let img = html("img", { className, alt: "" });
      img.src = src;
      return img;
    };

    let panel = el("panel", { id: "kyber-shield-panel" });
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "kyber-shield-title");

    let body = el("vbox", { className: "kyber-shield-body" });

    // Header: the emblem, the name and the site the switches apply to.
    let header = html("div", { className: "kyber-shield-header" });
    // Fox Guard: decoration, so screen readers skip it.
    let emblem = icon(
      "kyber-shield-emblem",
      "chrome://kyberfox/content/fox-guard.png"
    );
    let title = l10n(
      html("h2", { id: "kyber-shield-title" }),
      "kyberfox-shield-title"
    );
    let site = html("p", { id: "kyber-shield-site" });
    header.append(emblem, title, site);

    // Status card: what is on, said in words and by the icon, and the switch.
    let card = html("div", { id: "kyber-shield-status-card" });
    let statusText = html("span", { id: "kyber-shield-status" });
    statusText.setAttribute("aria-live", "polite");
    let master = html("moz-toggle", { id: "kyber-shield-master" });
    card.append(
      html("span", { className: "kyber-shield-status-icon" }),
      statusText,
      master
    );

    // uBlock Origin's count for the page in the tab.
    let stat = html("div", { className: "kyber-shield-stat" });
    stat.append(
      icon("kyber-shield-row-icon", "chrome://global/skin/icons/block.svg"),
      l10n(
        html("span", { className: "kyber-shield-row-label" }),
        "kyberfox-shield-blocked-label"
      ),
      html("span", {
        id: "kyber-shield-blocked",
        className: "kyber-shield-row-value",
      })
    );

    let rows = el("vbox", { className: "kyber-shield-rows" });
    rows.append(
      l10n(
        html("h3", { className: "kyber-shield-controls-heading" }),
        "kyberfox-shield-controls-heading"
      )
    );
    for (let control of CONTROLS) {
      let row = html("moz-toggle", { id: `kyber-shield-${control}` });
      l10n(row, `kyberfox-shield-${control}`);
      rows.append(row);
    }

    let note = (id, l10nId) =>
      l10n(
        html("p", {
          id,
          className: "kyber-shield-note",
          hidden: true,
        }),
        l10nId
      );

    // Rows that lead to Firefox's own controls, never a copy of them.
    let link = (id, src, onClick, withValue = false) => {
      let row = html("button", { id, className: "kyber-shield-link" });
      row.append(
        icon("kyber-shield-row-icon", src),
        l10n(
          html("span", { className: "kyber-shield-row-label" }),
          `kyberfox-${id.slice(6)}`
        )
      );
      if (withValue) {
        row.append(html("span", { className: "kyber-shield-row-value" }));
      }
      row.append(
        icon(
          "kyber-shield-chevron",
          "chrome://global/skin/icons/arrow-right.svg"
        )
      );
      row.addEventListener("click", onClick);
      return row;
    };
    // "Site not working?": the steps fold out under the row.
    let fix = link(
      "kyber-shield-fix",
      "chrome://global/skin/icons/help.svg",
      () => this.toggleFix()
    );
    fix.setAttribute("aria-expanded", "false");
    fix.setAttribute("aria-controls", "kyber-shield-fix-section");
    let fixSection = html("div", {
      id: "kyber-shield-fix-section",
      hidden: true,
    });
    let fixNext = html("moz-button", { id: "kyber-shield-fix-next" });
    fixNext.addEventListener("click", () => this.fixNext());
    let fixReset = html("moz-button", { id: "kyber-shield-fix-reset" });
    fixReset.setAttribute("type", "ghost");
    l10n(fixReset, "kyberfox-shield-fix-reset");
    fixReset.addEventListener("click", () => this.fixReset());
    let fixButtons = html("div", { className: "kyber-shield-fix-buttons" });
    fixButtons.append(fixNext, fixReset);
    fixSection.append(html("p", { id: "kyber-shield-fix-text" }), fixButtons);

    let links = html("div", { className: "kyber-shield-links" });
    links.append(
      // Shown only while the ad blocker is off: where to turn it back on.
      link(
        "kyber-shield-addons",
        "chrome://mozapps/skin/extensions/extension.svg",
        () => this.openAddons()
      ),
      fix,
      fixSection,
      link(
        "kyber-shield-permissions",
        "chrome://browser/skin/permissions.svg",
        () => this.openPermissions(),
        true
      ),
      link(
        "kyber-shield-settings",
        "chrome://global/skin/icons/settings.svg",
        () => this.openSettings()
      ),
      // Opens uBlock Origin's dashboard for custom filters and lists.
      link(
        "kyber-shield-advanced",
        "chrome://kyberfox/content/crystal-guard.svg",
        () => this.openAdvanced()
      )
    );

    body.append(
      header,
      card,
      stat,
      rows,
      note("kyber-shield-cookies-note", "kyberfox-shield-cookies-note"),
      note("kyber-shield-private-note", "kyberfox-shield-private-note"),
      note("kyber-shield-error", "kyberfox-shield-unreachable"),
      note("kyber-shield-blocker-note", "kyberfox-shield-blocker-note"),
      links
    );
    panel.append(body);

    panel.addEventListener("popupshowing", () => {
      this.unreachable = false;
      this.render();
    });
    panel.addEventListener("toggle", e => this.onToggle(e));
    panel.addEventListener("popuphidden", () => this.toggleFix(false));
    panel.addEventListener("popupshown", () => {
      if (this.focusOnShow) {
        this.focusOnShow = false;
        master.focus();
      }
    });
    this.doc.getElementById("mainPopupSet").append(panel);
    this.panel = panel;
    return panel;
  }

  /**
   * Folds the "Site not working?" steps out or in.
   *
   * @param {boolean} [expand] Toggles when left out.
   */
  toggleFix(expand) {
    let row = this.panel.querySelector("#kyber-shield-fix");
    let show = expand ?? row.getAttribute("aria-expanded") != "true";
    row.setAttribute("aria-expanded", show);
    this.panel.querySelector("#kyber-shield-fix-section").hidden = !show;
  }

  /** Turns off the next protection for the site and reloads the page. */
  fixNext() {
    let step = nextFixStep(
      KyberShield.state(this.browser),
      KyberShield.adBlocking(this.browser)
    );
    if (!step) {
      return Promise.resolve();
    }
    return this.change(browser =>
      step == "master"
        ? KyberShield.setEnabled(browser, false)
        : KyberShield.setControl(browser, step, false)
    );
  }

  /** Turns the shield and every protection back on for the site. */
  fixReset() {
    return this.change(async browser => {
      let ok = await KyberShield.setEnabled(browser, true);
      if (KyberShield.state(browser).perControl) {
        for (let control of CONTROLS) {
          ok = (await KyberShield.setControl(browser, control, true)) && ok;
        }
      }
      return ok;
    });
  }

  /** Firefox's Page Info window on its Permissions tab for the page. */
  openPermissions() {
    let browser = this.browser;
    this.panel.hidePopup();
    this.win.BrowserCommands.pageInfo(null, "permTab", null, null, browser);
  }

  /** Add-ons and themes, where the ad blocker is turned back on. */
  openAddons() {
    this.panel.hidePopup();
    this.win.BrowserAddonUI.openAddonsMgr("addons://list/extension");
  }

  /** Firefox's Privacy settings, where the browser-wide protections live. */
  openSettings() {
    this.panel.hidePopup();
    this.win.openPreferences("privacy");
  }

  /**
   * How many permissions the site holds as allowed, from Firefox's own
   * permission store, as Page Info lists them.
   *
   * @returns {number}
   */
  allowedPermissions() {
    return SitePermissions.getAllForBrowser(this.browser).filter(
      p => p.state == SitePermissions.ALLOW
    ).length;
  }

  openAdvanced() {
    let policy = WebExtensionPolicy.getByID(UBLOCK_ID);
    if (!policy) {
      return;
    }
    this.panel.hidePopup();
    this.win.openTrustedLinkIn(policy.getURL("dashboard.html"), "tab");
  }

  openPanel({ keyboard = false } = {}) {
    this.focusOnShow = keyboard;
    this.ensurePanel().openPopup(
      this.button.querySelector(".kyber-shield-icon"),
      "bottomright topright"
    );
  }

  /** Redraws the panel from the stored state of the selected tab. */
  render() {
    let panel = this.panel;
    let state = KyberShield.state(this.browser);
    let adBlocking = KyberShield.adBlocking(this.browser);
    let query = id => panel.querySelector(`#kyber-shield-${id}`);

    let shieldState = stateName(state, adBlocking);
    query("site").textContent = this.siteName();
    query("status-card").setAttribute("state", shieldState);
    this.doc.l10n.setAttributes(
      query("status"),
      `kyberfox-shield-status-${shieldState}`
    );
    let master = query("master");
    this.doc.l10n.setAttributes(master, "kyberfox-shield-master", {
      site: this.siteName(),
    });
    master.pressed = state.enabled;

    let count = state.ads ? KyberShield.blockedCount(this.browser) : "";
    let blocked = query("blocked");
    if (!state.ads) {
      this.doc.l10n.setAttributes(blocked, "kyberfox-shield-blocked-off");
    } else if (adBlocking != "running") {
      // No count to show: nothing is blocking ads here.
      this.doc.l10n.setAttributes(
        blocked,
        `kyberfox-shield-blocked-${adBlocking}`
      );
    } else if (
      !WebExtensionPolicy.getByID(UBLOCK_ID) ||
      // uBlock's badge reads "!" for a page loaded before it was ready.
      (count && !/\d/.test(count))
    ) {
      this.doc.l10n.setAttributes(blocked, "kyberfox-shield-blocked-unknown");
    } else if (count) {
      this.doc.l10n.setAttributes(blocked, "kyberfox-shield-blocked-count", {
        count,
      });
    } else {
      this.doc.l10n.setAttributes(blocked, "kyberfox-shield-blocked-none");
    }

    let allowed = this.allowedPermissions();
    let permissions = query("permissions").querySelector(
      ".kyber-shield-row-value"
    );
    if (allowed) {
      this.doc.l10n.setAttributes(
        permissions,
        "kyberfox-shield-permissions-allowed",
        { count: allowed }
      );
    } else {
      this.doc.l10n.setAttributes(
        permissions,
        "kyberfox-shield-permissions-none"
      );
    }
    panel.querySelector(".kyber-shield-controls-heading").hidden =
      !state.perControl;

    let step = nextFixStep(state, adBlocking);
    let textId = "done";
    if (step) {
      textId = state.perControl ? step : "private";
    }
    this.doc.l10n.setAttributes(
      query("fix-text"),
      `kyberfox-shield-fix-${textId}-text`
    );
    let next = query("fix-next");
    next.hidden = !step;
    if (step) {
      this.doc.l10n.setAttributes(next, `kyberfox-shield-fix-${textId}-button`);
    }
    query("fix-reset").hidden =
      state.enabled && CONTROLS.every(control => state[control]);
    for (let control of CONTROLS) {
      let row = query(control);
      row.hidden = !state.perControl;
      row.pressed = state[control];
      // A control cannot be switched on while the whole shield is off, and
      // the ads switch does nothing while the ad blocker is stopped.
      row.disabled =
        !state.enabled || (control == "ads" && adBlocking == "stopped");
    }
    query("cookies-note").hidden = !(
      state.perControl &&
      state.enabled &&
      !state.cookies
    );
    query("private-note").hidden = state.perControl;
    query("error").hidden = !this.unreachable;
    query("blocker-note").hidden = adBlocking != "stopped";
    query("addons").hidden = adBlocking != "stopped";
    query("advanced").hidden = !WebExtensionPolicy.getByID(UBLOCK_ID);
  }

  async onToggle(event) {
    let target = event.target;
    let control = target.id.replace("kyber-shield-", "");
    if (this.busy || (control != "master" && !CONTROLS.includes(control))) {
      this.render();
      return;
    }
    let value = target.pressed;
    await this.change(browser =>
      control == "master"
        ? KyberShield.setEnabled(browser, value)
        : KyberShield.setControl(browser, control, value)
    );
  }

  /**
   * Runs one change through the engine, then redraws and reloads the page.
   *
   * @param {function(XULBrowserElement): Promise<boolean>} apply Resolves to
   *   false if uBlock could not be reached.
   */
  async change(apply) {
    if (this.busy) {
      return;
    }
    this.busy = true;
    let browser = this.browser;
    try {
      let ok = await apply(browser);
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
shield.build();
