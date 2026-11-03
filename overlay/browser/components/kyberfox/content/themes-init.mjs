/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Loaded as a module script by browser.xhtml. The theme sheets are
 * process-wide, so the first window starts them and later calls do nothing.
 */

const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);

KyberThemes.init();

// Recovery from custom CSS that hides the toolbar: Ctrl+Shift+Alt+T drops the
// custom file and applies Ember. A listener, not a <key>, so no browser.xhtml
// patch is needed.
window.addEventListener("keydown", event => {
  if (
    event.ctrlKey &&
    event.shiftKey &&
    event.altKey &&
    !event.metaKey &&
    (event.key.toLowerCase() == "t" || event.code == "KeyT")
  ) {
    event.preventDefault();
    KyberThemes.resetToDefault();
  }
});
