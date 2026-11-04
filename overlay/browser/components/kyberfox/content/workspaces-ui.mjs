/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The workspace button at the start of the tab bar and the panel it opens.
 * The engine is KyberWorkspaces.sys.mjs; this file only draws and drives it.
 * Loaded as a module script by browser.xhtml, once per browser window.
 */

const { KyberWorkspaces, TAB_KEY } = ChromeUtils.importESModule(
  "resource:///modules/KyberWorkspaces.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});

const LIST_PREF = "kyberfox.workspaces.list";
const HTML_NS = "http://www.w3.org/1999/xhtml";

// Fill is supplied by CSS (context-fill), so one icon serves every color.
const DOT_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
      '<circle cx="8" cy="8" r="5" fill="context-fill"/></svg>'
  );

const PALETTE = [
  "#5b8def",
  "#e5484d",
  "#30a46c",
  "#f5a524",
  "#8e4ec6",
  "#12a594",
  "#e93d82",
  "#6f6f78",
];

/**
 * A workspace's dot color: a stable hash of its id into PALETTE.
 *
 * @param {string} id
 * @returns {string}
 */
function colorFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/**
 *
 */
class WorkspaceButton {
  constructor(win) {
    this.win = win;
    this.doc = win.document;
    this.button = this.doc.getElementById("kyber-workspace-button");
    this.panel = null;
  }

  async init() {
    if (lazy.PrivateBrowsingUtils.isWindowPrivate(this.win)) {
      // Workspaces are not offered in private windows.
      this.button.hidden = true;
      return;
    }
    // gBrowser does not exist yet while module scripts run.
    await this.win.delayedStartupPromise;

    this.button.addEventListener("command", () => this.openPanel());
    this.refreshButton();

    // The list changes from any window, and init() or a session restore can
    // change the active workspace without touching the list.
    let observer = () => this.refreshAll();
    Services.prefs.addObserver(LIST_PREF, observer);
    this.win.gBrowser.tabContainer.addEventListener("TabSelect", observer);
    this.win.addEventListener("SSWindowStateReady", observer);
    this.win.addEventListener(
      "unload",
      () => Services.prefs.removeObserver(LIST_PREF, observer),
      { once: true }
    );
  }

  activeWorkspace() {
    let id = KyberWorkspaces.activeId(this.win);
    return KyberWorkspaces.list().find(w => w.id == id);
  }

  setColor(el, id) {
    el.style.setProperty("--kyber-workspace-color", colorFor(id));
  }

  refreshButton() {
    // activeId() already falls back to the first workspace; the explicit
    // fallback keeps the label right if the list changes in between.
    let active = this.activeWorkspace() ?? KyberWorkspaces.list()[0];
    if (!active) {
      return;
    }
    this.button.setAttribute("label", active.name);
    this.button.setAttribute("image", DOT_ICON);
    this.setColor(this.button, active.id);
  }

  refreshAll() {
    this.refreshButton();
    if (this.panel?.state == "open" && !this.editing) {
      this.renderRows();
    }
  }

  /** Builds the panel on first use. */
  ensurePanel() {
    if (this.panel) {
      return this.panel;
    }
    let panel = this.doc.createXULElement("panel");
    panel.id = "kyber-workspace-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "menu");
    panel.setAttribute("data-l10n-id", "kyberfox-workspace-panel");

    let list = this.doc.createXULElement("vbox");
    list.id = "kyber-workspace-list";
    list.className = "panel-subview-body";
    this.list = list;

    let footer = this.doc.createXULElement("vbox");
    footer.className = "panel-subview-body kyber-workspace-footer";
    footer.append(
      this.footerButton("new"),
      this.footerButton("rename"),
      this.footerButton("delete")
    );

    panel.append(list, footer);
    panel.addEventListener("popupshowing", () => this.renderRows());
    panel.addEventListener("popuphidden", () => {
      this.editing = false;
    });
    panel.addEventListener("command", e => this.onCommand(e));
    panel.setAttribute("context", "kyber-workspace-context");
    let menu = this.doc.createXULElement("menupopup");
    menu.id = "kyber-workspace-context";
    let rename = this.doc.createXULElement("menuitem");
    rename.id = "kyber-workspace-context-rename";
    rename.setAttribute("data-l10n-id", "kyberfox-workspace-rename");
    menu.append(rename);
    menu.addEventListener("popupshowing", e => {
      this.contextRow = menu.triggerNode?.closest?.(".kyber-workspace-item");
      if (!this.contextRow) {
        e.preventDefault();
      }
    });
    menu.addEventListener("command", () => {
      this.startRename(this.contextRow.getAttribute("workspace-id"));
    });
    this.doc.getElementById("mainPopupSet").append(menu);
    this.doc.getElementById("mainPopupSet").appendChild(panel);
    this.panel = panel;
    return panel;
  }

  footerButton(kind) {
    let btn = this.doc.createXULElement("toolbarbutton");
    btn.id = `kyber-workspace-${kind}`;
    btn.className = "subviewbutton";
    btn.setAttribute("data-l10n-id", `kyberfox-workspace-${kind}`);
    return btn;
  }

  openPanel() {
    this.ensurePanel().openPopup(this.button, "after_start");
  }

  /** Redraws the workspace rows and the state of the footer. */
  renderRows() {
    let active = KyberWorkspaces.activeId(this.win);
    let workspaces = KyberWorkspaces.list();
    let rows = workspaces.map(w => {
      let row = this.doc.createXULElement("toolbarbutton");
      row.className = "subviewbutton kyber-workspace-item";
      row.setAttribute("workspace-id", w.id);
      row.setAttribute("label", w.name);
      row.setAttribute("image", DOT_ICON);
      row.setAttribute("role", "menuitemradio");
      row.setAttribute("aria-checked", w.id == active);
      this.setColor(row, w.id);
      return row;
    });
    this.list.replaceChildren(...rows);
    // The engine ignores removing the last workspace.
    this.panel.querySelector("#kyber-workspace-delete").disabled =
      workspaces.length < 2;
  }

  onCommand(event) {
    if (this.editing) {
      return;
    }
    let target = event.target;
    let active = KyberWorkspaces.activeId(this.win);
    if (target.classList.contains("kyber-workspace-item")) {
      KyberWorkspaces.switchTo(this.win, target.getAttribute("workspace-id"));
      this.refreshButton();
      this.panel.hidePopup();
      return;
    }
    switch (target.id) {
      case "kyber-workspace-new":
        this.createWorkspace();
        break;
      case "kyber-workspace-rename":
        this.startRename(active);
        break;
      case "kyber-workspace-delete":
        this.deleteWorkspace(active);
        break;
    }
  }

  async createWorkspace() {
    let defaultName = await this.doc.l10n.formatValue(
      "kyberfox-workspace-default-name",
      { number: KyberWorkspaces.list().length + 1 }
    );
    let created = KyberWorkspaces.create(defaultName);
    KyberWorkspaces.switchTo(this.win, created.id);
    this.refreshButton();
    this.renderRows();
    this.startRename(created.id);
  }

  /**
   * Replaces a row's label with a text field. Enter saves, Escape keeps.
   *
   * @param {string} id
   */
  startRename(id) {
    let row = this.list.querySelector(`[workspace-id="${CSS.escape(id)}"]`);
    if (!row || this.editing) {
      return;
    }
    this.editing = true;
    let input = this.doc.createElementNS(HTML_NS, "input");
    input.className = "kyber-workspace-rename-input";
    input.value = row.getAttribute("label");
    input.setAttribute("data-l10n-id", "kyberfox-workspace-name-input");
    let finish = save => {
      if (!this.editing) {
        return;
      }
      this.editing = false;
      this.win.removeEventListener("keydown", onKey, true);
      let newName = input.value.trim();
      if (save && newName) {
        KyberWorkspaces.rename(id, newName);
      }
      this.refreshAll();
    };
    // Captured on the window, ahead of the popup manager, so that Escape ends
    // the edit instead of closing the panel.
    let onKey = e => {
      if (e.key == "Enter" || e.key == "Escape") {
        e.stopPropagation();
        e.preventDefault();
        finish(e.key == "Enter");
      }
    };
    this.win.addEventListener("keydown", onKey, true);
    input.addEventListener("blur", () => finish(false));
    // Nothing typed or clicked in the field may reach the row, which would
    // switch to it (click, Space) and close the panel.
    for (let type of ["click", "mousedown", "mouseup", "keypress", "keyup"]) {
      input.addEventListener(type, e => e.stopPropagation());
    }
    input.addEventListener("keydown", e => {
      if (e.key != "Enter" && e.key != "Escape") {
        e.stopPropagation();
      }
    });
    row.replaceChildren(input);
    row.setAttribute("editing", "true");
    input.focus();
    input.select();
  }

  async deleteWorkspace(id) {
    let workspace = KyberWorkspaces.list().find(w => w.id == id);
    if (!workspace || KyberWorkspaces.list().length < 2) {
      return;
    }
    let count = this.win.gBrowser.openTabs.filter(
      t => lazy.SessionStore.getCustomTabValue(t, TAB_KEY) == id
    ).length;
    if (count) {
      let [title, message, deleteLabel] = await this.doc.l10n.formatValues([
        {
          id: "kyberfox-workspace-delete-title",
          args: { name: workspace.name },
        },
        { id: "kyberfox-workspace-delete-message", args: { count } },
        { id: "kyberfox-workspace-delete-confirm" },
      ]);
      let flags =
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
        Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL;
      this.panel.hidePopup();
      let choice = Services.prompt.confirmEx(
        this.win,
        title,
        message,
        flags,
        deleteLabel,
        null,
        null,
        null,
        {}
      );
      if (choice != 0) {
        return;
      }
    }
    KyberWorkspaces.remove(id, this.win);
    this.refreshAll();
  }
}

// The module is evaluated by a script element, so `window` is the browser
// window itself.
new WorkspaceButton(window).init().catch(console.error);
