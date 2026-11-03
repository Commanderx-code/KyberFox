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
