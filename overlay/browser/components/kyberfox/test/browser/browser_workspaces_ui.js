/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { KyberWorkspaces } = ChromeUtils.importESModule(
  "resource:///modules/KyberWorkspaces.sys.mjs"
);

const LIST_PREF = "kyberfox.workspaces.list";

// Runs `task(win, home, work)` in a fresh window whose workspace list is
// freshly created: "Home" (active) and "Work".
async function withWorkspaces(task) {
  Services.prefs.clearUserPref(LIST_PREF);
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    KyberWorkspaces.init(win);
    let home = KyberWorkspaces.list()[0];
    let work = KyberWorkspaces.create("Work");
    await task(win, home, work);
  } finally {
    await BrowserTestUtils.closeWindow(win);
    Services.prefs.clearUserPref(LIST_PREF);
  }
}

function button(win) {
  return win.document.getElementById("kyber-workspace-button");
}

function panel(win) {
  return win.document.getElementById("kyber-workspace-panel");
}

async function openPanel(win) {
  let shown = BrowserTestUtils.waitForEvent(
    win.document,
    "popupshown",
    false,
    e => e.target.id == "kyber-workspace-panel"
  );
  EventUtils.synthesizeMouseAtCenter(button(win), {}, win);
  await shown;
  return panel(win);
}

async function closePanel(win) {
  let p = panel(win);
  if (p.state == "closed") {
    return;
  }
  let hidden = BrowserTestUtils.waitForEvent(p, "popuphidden");
  p.hidePopup();
  await hidden;
}

function rows(win) {
  return [...panel(win).querySelectorAll(".kyber-workspace-item")];
}

function rowFor(win, id) {
  return rows(win).find(r => r.getAttribute("workspace-id") == id);
}

function clickItem(win, el) {
  EventUtils.synthesizeMouseAtCenter(el, {}, win);
}

add_task(async function test_button_first_in_tab_bar() {
  await withWorkspaces(async (win, home) => {
    let btn = button(win);
    Assert.ok(btn, "the workspace button exists");
    Assert.equal(btn.localName, "toolbarbutton", "it is a toolbarbutton");
    let items = win.document.querySelector("#TabsToolbar .toolbar-items");
    Assert.equal(btn.parentNode, items, "it lives in the tab bar");
    let first = [...items.children].find(c => c.localName != "toolbartabstop");
    Assert.equal(first, btn, "it is the first item");
    Assert.equal(
      btn.nextElementSibling.id,
      "TabsToolbar-customization-target",
      "the tab strip follows it"
    );
    Assert.ok(
      btn.compareDocumentPosition(
        win.document.getElementById("tabbrowser-tabs")
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
      "it comes before the tabs"
    );
    Assert.ok(BrowserTestUtils.isVisible(btn), "it is visible");
    await TestUtils.waitForCondition(
      () => btn.label == home.name,
      "the button shows the active workspace name"
    );
    Assert.ok(
      btn.style.getPropertyValue("--kyber-workspace-color"),
      "the dot has a color"
    );
  });
});

add_task(async function test_panel_lists_workspaces() {
  await withWorkspaces(async (win, home, work) => {
    await openPanel(win);
    Assert.deepEqual(
      rows(win).map(r => r.label),
      ["Home", "Work"],
      "every workspace is listed, in order"
    );
    Assert.equal(
      rowFor(win, home.id).getAttribute("aria-checked"),
      "true",
      "the active workspace is marked"
    );
    Assert.equal(
      rowFor(win, work.id).getAttribute("aria-checked"),
      "false",
      "the others are not"
    );

    let hidden = BrowserTestUtils.waitForEvent(panel(win), "popuphidden");
    clickItem(win, rowFor(win, work.id));
    await hidden;
    Assert.equal(KyberWorkspaces.activeId(win), work.id, "click switches");
    await TestUtils.waitForCondition(
      () => button(win).label == "Work",
      "the button follows the switch"
    );

    KyberWorkspaces.rename(work.id, "Job");
    await TestUtils.waitForCondition(
      () => button(win).label == "Job",
      "the button follows a rename"
    );

    // Delete is disabled while only one workspace exists.
    KyberWorkspaces.remove(home.id, win);
    await openPanel(win);
    Assert.ok(
      panel(win).querySelector("#kyber-workspace-delete").disabled,
      "Delete is disabled for the last workspace"
    );
    await closePanel(win);
  });
});

add_task(async function test_create_rename_delete_from_panel() {
  await withWorkspaces(async (win, home, work) => {
    // Create: the new workspace becomes active and its name is editable.
    await openPanel(win);
    clickItem(win, panel(win).querySelector("#kyber-workspace-new"));
    let input = await TestUtils.waitForCondition(() =>
      panel(win).querySelector(".kyber-workspace-rename-input")
    );
    let list = KyberWorkspaces.list();
    Assert.equal(list.length, 3, "a workspace was created");
    let created = list[2];
    Assert.equal(KyberWorkspaces.activeId(win), created.id, "it is active");

    // Rename it inline.
    input.value = "Research";
    EventUtils.synthesizeKey("KEY_Enter", {}, win);
    Assert.equal(
      KyberWorkspaces.list()[2].name,
      "Research",
      "Enter commits the new name"
    );
    Assert.ok(
      !panel(win).querySelector(".kyber-workspace-rename-input"),
      "the input is gone"
    );
    await TestUtils.waitForCondition(
      () => button(win).label == "Research",
      "the button shows the new name"
    );

    // Rename through the footer item, then cancel with Escape.
    clickItem(win, panel(win).querySelector("#kyber-workspace-rename"));
    input = await TestUtils.waitForCondition(() =>
      panel(win).querySelector(".kyber-workspace-rename-input")
    );
    input.value = "Nope";
    EventUtils.synthesizeKey("KEY_Escape", {}, win);
    Assert.equal(
      KyberWorkspaces.list()[2].name,
      "Research",
      "Escape keeps the old name"
    );
    Assert.equal(panel(win).state, "open", "Escape only ends the edit");

    // Delete with tabs: the prompt can be declined...
    let dialog = BrowserTestUtils.promiseAlertDialog("cancel");
    clickItem(win, panel(win).querySelector("#kyber-workspace-delete"));
    await dialog;
    Assert.equal(KyberWorkspaces.list().length, 3, "Cancel keeps it");

    // ...and accepted. The tabs move to the first workspace.
    await openPanelIfClosed(win);
    dialog = BrowserTestUtils.promiseAlertDialog("accept");
    clickItem(win, panel(win).querySelector("#kyber-workspace-delete"));
    await dialog;
    await TestUtils.waitForCondition(
      () => KyberWorkspaces.list().length == 2,
      "OK deletes the workspace"
    );
    Assert.equal(KyberWorkspaces.activeId(win), home.id, "Home is active");
    await closePanel(win);

    // A workspace without tabs in this window is deleted without a prompt.
    KyberWorkspaces.switchTo(win, work.id);
    KyberWorkspaces.assign(win.gBrowser.selectedTab, home.id);
    await openPanelIfClosed(win);
    clickItem(win, panel(win).querySelector("#kyber-workspace-delete"));
    await TestUtils.waitForCondition(
      () => KyberWorkspaces.list().length == 1,
      "an empty workspace is deleted without a prompt"
    );
    await closePanel(win);
  });
});

async function openPanelIfClosed(win) {
  if (panel(win).state != "open") {
    await openPanel(win);
  }
}

add_task(async function test_hidden_in_private_window() {
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    let btn = button(win);
    Assert.ok(
      !btn || !BrowserTestUtils.isVisible(btn),
      "workspaces are not offered in a private window"
    );
    Assert.ok(!panel(win), "and no panel is built");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_tabs_on_top_toolbar_below() {
  Assert.strictEqual(
    Services.prefs.getBoolPref("sidebar.verticalTabs"),
    false,
    "vertical tabs stay off"
  );
  let toolbox = document.getElementById("navigator-toolbox");
  let ids = [...toolbox.children].map(c => c.id);
  Assert.less(
    ids.indexOf("TabsToolbar"),
    ids.indexOf("nav-bar"),
    "the tab bar is above the nav bar"
  );
  Assert.greaterOrEqual(ids.indexOf("TabsToolbar"), 0, "TabsToolbar found");
});

// Upstream behavior Kyber Fox leaves untouched. These catch a regression
// when Firefox is rebased.

add_task(async function test_split_view_opens_from_tab_menu() {
  Assert.ok(
    Services.prefs.getBoolPref("browser.tabs.splitView.enabled"),
    "split view is on by default"
  );
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    let tab = BrowserTestUtils.addTab(win.gBrowser, "about:blank");
    let menu = win.document.getElementById("tabContextMenu");
    let shown = BrowserTestUtils.waitForPopupEvent(menu, "shown");
    EventUtils.synthesizeMouseAtCenter(
      tab,
      { type: "contextmenu", button: 2 },
      win
    );
    await shown;
    let item = win.document.getElementById("context_moveTabToSplitView");
    Assert.ok(!item.hidden && !item.disabled, "the menu offers split view");
    let hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");
    menu.activateItem(item);
    await hidden;

    await TestUtils.waitForCondition(
      () => tab.splitview,
      "the tab joined a split view"
    );
    Assert.equal(tab.splitview.tabs.length, 2, "two panes");
    Assert.ok(
      win.document
        .getElementById("tabbrowser-tabpanels")
        .hasAttribute("splitview"),
      "the content area shows the split"
    );
    // Upstream already outlines the focused pane; no Kyber rule is needed.
    let pane = win.document.querySelector(
      ".split-view-panel.deck-selected > .browserContainer"
    );
    Assert.ok(pane, "the focused pane exists");
    Assert.notEqual(
      win.getComputedStyle(pane).borderTopColor,
      "rgba(0, 0, 0, 0)",
      "the focused pane has a visible focus border"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    Services.prefs.clearUserPref("browser.tabs.splitview.hasUsed");
  }
});

add_task(async function test_tab_group_create() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    let tabs = [
      BrowserTestUtils.addTab(win.gBrowser, "about:blank"),
      BrowserTestUtils.addTab(win.gBrowser, "about:blank"),
    ];
    let group = win.gBrowser.addTabGroup(tabs, {
      label: "Reading",
      insertBefore: tabs[0],
    });
    Assert.ok(group, "a group was created");
    Assert.equal(group.label, "Reading", "it has its label");
    Assert.deepEqual(group.tabs, tabs, "it holds both tabs");
    Assert.ok(
      tabs.every(t => t.group == group),
      "each tab reports the group"
    );
    Assert.ok(
      win.gBrowser.tabGroups.includes(group),
      "the window lists the group"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});
