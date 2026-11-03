/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Kyber Fox workspaces: named, tabs-only sets inside one window.
 *
 * The list of workspaces ({id, name}) lives in a pref shared by all windows.
 * A tab's workspace is a session-store custom tab value, and a window's active
 * workspace is a session-store custom window value, so both survive restarts.
 * Switching hides the tabs of the other workspaces. Pinned tabs belong to no
 * workspace in practice: they stay visible in all of them.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});

const LIST_PREF = "kyberfox.workspaces.list";
const TAB_KEY = "kyberWorkspace";
const WINDOW_KEY = "kyberActiveWorkspace";
const DEFAULT_NAME = "Home";

/** Per-window state: the listeners to undo and each workspace's last tab. */
const gWindows = new WeakMap();

function readList() {
  try {
    let list = JSON.parse(Services.prefs.getStringPref(LIST_PREF, "[]"));
    if (Array.isArray(list)) {
      return list.filter(w => w && typeof w.id == "string");
    }
  } catch (e) {
    console.error("KyberWorkspaces: unreadable workspace list", e);
  }
  return [];
}

function writeList(list) {
  Services.prefs.setStringPref(LIST_PREF, JSON.stringify(list));
}

function newId() {
  return Services.uuid.generateUUID().toString().slice(1, -1);
}

function tabWorkspace(tab) {
  return lazy.SessionStore.getCustomTabValue(tab, TAB_KEY);
}

function isKnown(id) {
  return readList().some(w => w.id == id);
}

/** The first workspace's id. Recreates the default one if the list is gone. */
function firstId() {
  let list = readList();
  if (!list.length) {
    list = [{ id: newId(), name: DEFAULT_NAME }];
    writeList(list);
  }
  return list[0].id;
}

/**
 * The window's saved active id, or "" if there is none or the session store
 * does not track the window (a closing one, or a picture-in-picture window).
 *
 * @param {Window} win
 * @returns {string}
 */
function savedActiveId(win) {
  try {
    return lazy.SessionStore.getCustomWindowValue(win, WINDOW_KEY);
  } catch (e) {
    return "";
  }
}

function saveActiveId(win, id) {
  try {
    lazy.SessionStore.setCustomWindowValue(win, WINDOW_KEY, id);
  } catch (e) {
    // Not tracked, as above. The next call falls back to the first workspace.
  }
}

function isInWorkspace(tab, id) {
  return tab.pinned || tabWorkspace(tab) == id;
}

/**
 * Shows or hides one tab according to its window's active workspace.
 *
 * @param {MozTabbrowserTab} tab
 */
function syncTab(tab) {
  let win = tab.documentGlobal;
  if (isInWorkspace(tab, KyberWorkspaces.activeId(win))) {
    win.gBrowser.showTab(tab);
  } else {
    win.gBrowser.hideTab(tab);
  }
}

/**
 * Brings a window in line with the workspace list and its active workspace:
 * fixes the active id, gives orphaned tabs a workspace, then updates which
 * tabs are visible.
 *
 * @param {Window} win
 * @param {"active"|"first"} orphanTarget
 *   Where tabs with a missing or unknown id go.
 */
function refresh(win, orphanTarget) {
  let active = savedActiveId(win);
  if (!isKnown(active)) {
    active = firstId();
  }
  saveActiveId(win, active);

  let orphanId = orphanTarget == "first" ? firstId() : active;
  for (let tab of win.gBrowser.openTabs) {
    if (!isKnown(tabWorkspace(tab))) {
      lazy.SessionStore.setCustomTabValue(tab, TAB_KEY, orphanId);
    }
  }
  applyVisibility(win);
}

/**
 * Selects a tab of the active workspace, opening one if there is none, then
 * hides every other tab. The selected tab can't be hidden, so it has to be
 * chosen first.
 *
 * @param {Window} win
 */
function applyVisibility(win) {
  let { gBrowser } = win;
  let id = KyberWorkspaces.activeId(win);
  let own = gBrowser.openTabs.filter(t => !t.pinned && tabWorkspace(t) == id);

  if (!own.length) {
    gBrowser.selectedTab = gBrowser.addTab("about:newtab", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  } else if (!isInWorkspace(gBrowser.selectedTab, id)) {
    let remembered = gWindows.get(win)?.lastTabs.get(id)?.deref();
    gBrowser.selectedTab = own.includes(remembered) ? remembered : own[0];
  }

  for (let tab of gBrowser.openTabs) {
    syncTab(tab);
  }
}

export const KyberWorkspaces = {
  /** @returns {{id: string, name: string}[]} */
  list() {
    return readList();
  },

  create(name) {
    let workspace = { id: newId(), name: String(name).trim() };
    writeList([...readList(), workspace]);
    return workspace;
  },

  rename(id, name) {
    writeList(
      readList().map(w =>
        w.id == id ? { ...w, name: String(name).trim() } : w
      )
    );
  },

  /**
   * Deletes a workspace. Its tabs move to the first remaining workspace, in
   * every window. The last workspace can't be deleted.
   *
   * @param {string} id
   * @param {Window} win
   */
  remove(id, win) {
    let list = readList();
    if (list.length < 2 || !list.some(w => w.id == id)) {
      return;
    }
    writeList(list.filter(w => w.id != id));
    // Windows that called init() react to the pref change too; this covers
    // `win` when it did not.
    refresh(win, "first");
  },

  /**
   * @param {Window} win
   * @returns {string} The id of the window's active workspace.
   */
  activeId(win) {
    let id = savedActiveId(win);
    return isKnown(id) ? id : firstId();
  },

  /**
   * @param {Window} win
   * @param {string} id
   */
  switchTo(win, id) {
    if (!isKnown(id)) {
      throw new Error(`Unknown workspace ${id}`);
    }
    saveActiveId(win, id);
    applyVisibility(win);
  },

  /**
   * @param {MozTabbrowserTab} tab
   * @param {string} id
   */
  assign(tab, id) {
    lazy.SessionStore.setCustomTabValue(tab, TAB_KEY, id);
    syncTab(tab);
  },

  /**
   * Starts managing a window. Creates the default workspace on first use.
   * Safe to call more than once per window.
   *
   * @param {Window} win
   */
  init(win) {
    if (gWindows.has(win) || !win.gBrowser) {
      return;
    }

    let state = { lastTabs: new Map() };
    gWindows.set(win, state);
    let tabContainer = win.gBrowser.tabContainer;

    let onTabOpen = event => {
      if (!isKnown(tabWorkspace(event.target))) {
        this.assign(event.target, this.activeId(win));
      }
    };
    let onTabRestoring = event => {
      let tab = event.target;
      if (isKnown(tabWorkspace(tab))) {
        syncTab(tab);
      } else {
        this.assign(tab, this.activeId(win));
      }
    };
    let onTabSelect = event => {
      let tab = event.target;
      if (!tab.pinned) {
        state.lastTabs.set(tabWorkspace(tab), new WeakRef(tab));
      }
    };
    let onTabUnpinned = event => syncTab(event.target);
    // Session restore brings back the window's saved active workspace.
    let onWindowRestored = () => refresh(win, "active");
    let prefObserver = () => refresh(win, "first");

    tabContainer.addEventListener("TabOpen", onTabOpen);
    tabContainer.addEventListener("SSTabRestoring", onTabRestoring);
    tabContainer.addEventListener("TabSelect", onTabSelect);
    tabContainer.addEventListener("TabUnpinned", onTabUnpinned);
    win.addEventListener("SSWindowStateReady", onWindowRestored);
    Services.prefs.addObserver(LIST_PREF, prefObserver);
    win.addEventListener(
      "unload",
      () => {
        Services.prefs.removeObserver(LIST_PREF, prefObserver);
        gWindows.delete(win);
      },
      { once: true }
    );

    refresh(win, "active");
  },
};
