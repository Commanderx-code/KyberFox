/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Settings draws no divider lines (kyberfox/content/preferences.css): no card
// outlines, no sidebar separators, no box outlines, and buttons are filled.
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

// Pre-existing faults of the redesigned panes; see browser_privacy_presets.js.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /can't assign to property "value" on (true|false)/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /No Setting with id "kyberfoxWebGLPrompt(Hide)?"/
);

const TRANSPARENT = "rgba(0, 0, 0, 0)";

// A border shows only with a style, a width and a visible color; the computed
// color alone is currentColor even when no border is drawn.
function hasLine(style, side = "Top") {
  return (
    style[`border${side}Style`] != "none" &&
    parseFloat(style[`border${side}Width`]) > 0 &&
    style[`border${side}Color`] != TRANSPARENT
  );
}

async function openPane(pane, ready) {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `about:preferences#${pane}`
  );
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));
  let doc = tab.linkedBrowser.contentDocument;
  let el = await TestUtils.waitForCondition(() => ready(doc), `${pane} loaded`);
  await el.updateComplete;
  return { doc, el, win: doc.defaultView };
}

add_task(async function test_cards_sidebar_and_boxes_have_no_lines() {
  let { doc, el, win } = await openPane("privacy", d =>
    d.getElementById("kyberfoxRecommendedAddonsLink")
  );
  let card = doc.querySelector("moz-card");
  Assert.ok(card, "the pane has a section card");
  Assert.ok(!hasLine(win.getComputedStyle(card)), "card outline");

  let separator = doc.getElementById("nav-separator");
  Assert.ok(!hasLine(win.getComputedStyle(separator)), "sidebar line");
  let navHr = doc.querySelector("moz-page-nav").shadowRoot.querySelector("hr");
  if (navHr) {
    Assert.equal(win.getComputedStyle(navHr).backgroundColor, TRANSPARENT, "sidebar line above the secondary items");
  }

  // moz-box-common draws the outline on the element itself; the fill is on its button.
  let boxStyle = win.getComputedStyle(el);
  for (let side of ["Top", "Bottom", "Left", "Right"]) {
    Assert.ok(!hasLine(boxStyle, side), `box outline (${side})`);
  }
  let fill = win.getComputedStyle(el.shadowRoot.querySelector("button"));
  Assert.notEqual(fill.backgroundColor, TRANSPARENT, "the box keeps a fill");
});

add_task(async function test_buttons_are_filled_not_outlined() {
  let { el, win } = await openPane("appearance", d => d.getElementById("kyberfoxTheme"));
  let doc = el.ownerDocument;
  let button = await TestUtils.waitForCondition(
    () => doc.getElementById("kyberfoxThemeImport"),
    "the Import custom CSS button is in the pane"
  );
  await button.updateComplete;
  // The visible part of a moz-button; its <button> is always transparent.
  let style = win.getComputedStyle(button.shadowRoot.querySelector(".button-background"));
  // moz-button's own stylesheet loads after the first render.
  await TestUtils.waitForCondition(
    () => style.backgroundColor != TRANSPARENT,
    "the button is filled"
  );
  Assert.ok(!hasLine(style), "button outline");

  // The sidebar items read the same tokens and must stay unfilled.
  let navButton = doc.querySelector("moz-page-nav-button:not([selected])");
  let inner = navButton.shadowRoot.querySelector("button, a");
  Assert.equal(win.getComputedStyle(inner).backgroundColor, TRANSPARENT, "sidebar item fill");
});
