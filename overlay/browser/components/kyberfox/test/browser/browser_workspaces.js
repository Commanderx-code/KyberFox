/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { KyberWorkspaces, TAB_KEY } = ChromeUtils.importESModule(
  "resource:///modules/KyberWorkspaces.sys.mjs"
);

const LIST_PREF = "kyberfox.workspaces.list";

// Runs `task(win, home, work)` in a fresh window whose workspace list is
// freshly created: "Personal" (active) and "Work".
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

function addTab(win, url = "about:blank") {
  return BrowserTestUtils.addTab(win.gBrowser, url);
}

function workspaceOf(tab) {
  return SessionStore.getCustomTabValue(tab, TAB_KEY);
}

add_task(async function test_switch_hides_other_tabs() {
  await withWorkspaces(async (win, home, work) => {
    let homeTab = win.gBrowser.selectedTab;
    let workTab = addTab(win);
    KyberWorkspaces.assign(workTab, work.id);
    Assert.equal(workspaceOf(workTab), work.id, "assign stores the id");

    KyberWorkspaces.switchTo(win, work.id);
    Assert.equal(KyberWorkspaces.activeId(win), work.id, "Work is active");
    Assert.ok(homeTab.hidden, "Home tab is hidden");
    Assert.ok(!workTab.hidden, "Work tab is shown");
    Assert.equal(win.gBrowser.selectedTab, workTab, "Work tab is selected");

    KyberWorkspaces.switchTo(win, home.id);
    Assert.ok(!homeTab.hidden, "Home tab is shown again");
    Assert.ok(workTab.hidden, "Work tab is hidden again");
  });
});

// The urlbar's "Switch to tab" and the All Tabs menu select a hidden tab
// directly; the window follows the tab to its workspace.
add_task(async function test_selecting_other_workspace_tab_switches() {
  await withWorkspaces(async (win, home, work) => {
    let homeTab = win.gBrowser.selectedTab;
    let workTab = addTab(win);
    KyberWorkspaces.assign(workTab, work.id);
    Assert.ok(workTab.hidden, "the Work tab starts hidden");

    win.gBrowser.selectedTab = workTab;
    await TestUtils.waitForCondition(
      () => KyberWorkspaces.activeId(win) == work.id,
      "Work becomes active"
    );
    Assert.equal(win.gBrowser.selectedTab, workTab, "the chosen tab stays selected");
    Assert.ok(!workTab.hidden, "the Work tab is shown");
    Assert.ok(homeTab.hidden, "the Home tab is hidden");

    win.gBrowser.selectedTab = homeTab;
    await TestUtils.waitForCondition(
      () => KyberWorkspaces.activeId(win) == home.id,
      "Home becomes active again"
    );
    Assert.ok(!homeTab.hidden, "the Home tab is shown again");
    Assert.ok(workTab.hidden, "the Work tab is hidden again");
  });
});

add_task(async function test_new_tab_joins_active_workspace() {
  await withWorkspaces(async (win, home, work) => {
    KyberWorkspaces.switchTo(win, work.id);
    let tab = addTab(win);
    Assert.equal(workspaceOf(tab), work.id, "new tab is in Work");
    Assert.ok(!tab.hidden, "new tab is visible");
  });
});

add_task(async function test_link_opened_tab_joins_active_workspace() {
  await withWorkspaces(async (win, home, work) => {
    KyberWorkspaces.switchTo(win, work.id);
    let opener = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.com/"
    );
    let newTabPromise = BrowserTestUtils.waitForNewTab(
      win.gBrowser,
      "about:blank",
      false,
      true
    );
    await SpecialPowers.spawn(opener.linkedBrowser, [], () => {
      content.open("about:blank", "_blank");
    });
    let tab = await newTabPromise;
    Assert.equal(workspaceOf(tab), work.id, "opened tab is in Work");
    Assert.ok(!tab.hidden, "opened tab is visible");
  });
});

add_task(async function test_switch_to_empty_opens_tab() {
  await withWorkspaces(async (win, home, work) => {
    let before = win.gBrowser.openTabs.length;
    KyberWorkspaces.switchTo(win, work.id);
    Assert.equal(win.gBrowser.openTabs.length, before + 1, "one tab opened");
    let tab = win.gBrowser.selectedTab;
    Assert.equal(workspaceOf(tab), work.id, "the new tab is in Work");

    KyberWorkspaces.switchTo(win, home.id);
    KyberWorkspaces.switchTo(win, work.id);
    Assert.equal(
      win.gBrowser.openTabs.length,
      before + 1,
      "switching back does not open another tab"
    );
  });
});

add_task(async function test_pinned_visible_in_all() {
  await withWorkspaces(async (win, home, work) => {
    let pinned = addTab(win);
    win.gBrowser.pinTab(pinned);
    KyberWorkspaces.assign(pinned, home.id);
    KyberWorkspaces.switchTo(win, work.id);
    Assert.ok(!pinned.hidden, "pinned tab stays visible in Work");
    Assert.equal(workspaceOf(pinned), home.id, "pinned tab keeps its id");

    KyberWorkspaces.assign(pinned, work.id);
    KyberWorkspaces.switchTo(win, home.id);
    Assert.ok(!pinned.hidden, "pinned tab stays visible in Home");
  });
});

add_task(async function test_tab_group_hides_with_workspace() {
  await withWorkspaces(async (win, home, work) => {
    let tabs = [addTab(win), addTab(win)];
    let group = win.gBrowser.addTabGroup(tabs, { insertBefore: tabs[0] });
    Assert.ok(group, "group created");
    for (let tab of tabs) {
      KyberWorkspaces.assign(tab, work.id);
    }
    KyberWorkspaces.switchTo(win, work.id);
    Assert.ok(
      tabs.every(t => !t.hidden),
      "group tabs are visible in Work"
    );

    KyberWorkspaces.switchTo(win, home.id);
    Assert.ok(
      tabs.every(t => t.hidden),
      "every tab of the group is hidden with its workspace"
    );
    Assert.equal(group.tabs.length, 2, "the group itself is untouched");
  });
});

add_task(async function test_remove_moves_tabs_to_first() {
  await withWorkspaces(async (win, home, work) => {
    KyberWorkspaces.switchTo(win, work.id);
    let workTab = win.gBrowser.selectedTab;

    KyberWorkspaces.remove(work.id, win);
    Assert.deepEqual(
      KyberWorkspaces.list().map(w => w.id),
      [home.id],
      "Work is gone"
    );
    Assert.equal(workspaceOf(workTab), home.id, "its tab moved to Home");
    Assert.equal(KyberWorkspaces.activeId(win), home.id, "Home is active");
    Assert.ok(!workTab.hidden, "the moved tab is visible");
  });
});

add_task(async function test_cannot_remove_last() {
  await withWorkspaces(async (win, home, work) => {
    KyberWorkspaces.remove(work.id, win);
    KyberWorkspaces.remove(home.id, win);
    Assert.deepEqual(
      KyberWorkspaces.list().map(w => w.id),
      [home.id],
      "the last workspace stays"
    );
  });
});

// Restores a state into a new background tab, through the real session
// restore path, and resolves once it has started restoring.
async function restoreTabInto(win, workspaceId) {
  let tab = addTab(win);
  let restoring = BrowserTestUtils.waitForEvent(tab, "SSTabRestoring");
  SessionStore.setTabState(
    tab,
    JSON.stringify({
      entries: [
        {
          url: "about:blank",
          triggeringPrincipal_base64: E10SUtils.SERIALIZED_SYSTEMPRINCIPAL,
        },
      ],
      index: 1,
      extData: { [TAB_KEY]: workspaceId },
    })
  );
  await restoring;
  return tab;
}

add_task(async function test_restore_preserves_assignment() {
  await withWorkspaces(async (win, home, work) => {
    let tab = await restoreTabInto(win, work.id);
    Assert.equal(workspaceOf(tab), work.id, "assignment survives restoring");
    Assert.ok(tab.hidden, "tab is hidden while Home is active");

    KyberWorkspaces.switchTo(win, work.id);
    Assert.ok(!tab.hidden, "tab shows in its own workspace");
  });
});

add_task(async function test_restore_with_unknown_id_lands_in_first_visible() {
  await withWorkspaces(async (win, home, work) => {
    KyberWorkspaces.switchTo(win, work.id);
    let tab = await restoreTabInto(win, "no-such-workspace");
    Assert.equal(workspaceOf(tab), work.id, "tab joined the active workspace");
    Assert.ok(!tab.hidden, "tab is visible");
  });
});

add_task(async function test_unknown_window_id_falls_back_to_first() {
  await withWorkspaces(async (win, home, work) => {
    KyberWorkspaces.switchTo(win, work.id);
    SessionStore.setCustomWindowValue(win, "kyberActiveWorkspace", "nope");
    Assert.equal(
      KyberWorkspaces.activeId(win),
      home.id,
      "an unknown saved id reads as the first workspace"
    );
  });
});

add_task(async function test_active_id_does_not_write_the_list() {
  await withWorkspaces(async (win, home) => {
    let before = Services.prefs.getStringPref(LIST_PREF);
    KyberWorkspaces.activeId(win);
    Assert.equal(Services.prefs.getStringPref(LIST_PREF), before, "unchanged");
    Assert.equal(KyberWorkspaces.list()[0].id, home.id, "Home is first");
  });
});
