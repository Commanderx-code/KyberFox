/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Loads kyberfox.cfg from the install directory. Derived from LibreWolf's
// defaults/pref/local-settings.js.

// The .cfg file name; its path cannot be changed.
pref("general.config.filename", "kyberfox.cfg");

// The .cfg file is plain text, not obfuscated.
pref("general.config.obscure_value", 0);

// Keep the autoconfig sandbox on.
pref("general.config.sandbox_enabled", true);
