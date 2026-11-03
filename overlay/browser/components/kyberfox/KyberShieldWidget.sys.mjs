/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Registers the shield button with CustomizableUI, so that every window gets
 * a node built by it wherever the button lands (toolbar, overflow, palette).
 * This has to live in a system module: a callback defined by a window's
 * script would die with that window. The button's behavior is in
 * content/shield-ui.mjs, which each window attaches through
 * window.kyberShieldAttach.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

const SHIELD_BUTTON_ID = "kyber-shield-button";

export const KyberShieldWidget = {
  /** Registers the widget; later calls do nothing. */
  ensure() {
    // getWidget() answers for any id, as a XUL widget when none is registered.
    let existing = lazy.CustomizableUI.getWidget(SHIELD_BUTTON_ID);
    if (existing?.provider == lazy.CustomizableUI.PROVIDER_API) {
      return;
    }
    lazy.CustomizableUI.createWidget({
      id: SHIELD_BUTTON_ID,
      type: "button",
      defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
      l10nId: "kyberfox-shield-button",
      removable: true,
      onCreated(node) {
        // The toolbar button builds its badge only when asked to.
        node.setAttribute("badged", "true");
        node.documentGlobal.kyberShieldAttach?.(node);
      },
    });
  },
};
