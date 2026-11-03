/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Standard and Strict privacy presets of the Privacy pane. Each preset
// is a table of pref names and values, applied as user values. Firefox's own
// Standard radio only clears user values, which would leave Kyber Fox's
// strict defaults in force, so it cannot express these presets. libpref
// drops a user value equal to the default, so Standard effectively means
// "matches the shipped defaults".

const RECORD_PREF = "kyberfox.privacy.preset";

// The shipped defaults (settings/kyberfox.cfg).
const STANDARD = {
  "browser.contentblocking.category": "strict",
  "privacy.resistFingerprinting": false,
  "privacy.resistFingerprinting.letterboxing": false,
  "privacy.fingerprintingProtection": true,
  "privacy.sanitize.sanitizeOnShutdown": false,
  "dom.security.https_only_mode": true,
  "network.cookie.cookieBehavior": 1,
  "webgl.disabled": false,
  "media.peerconnection.ice.default_address_only": false,
};

// Standard plus the options that cost some convenience. The
// privacy.clearOnShutdown_v2.* prefs are the ones Firefox 159 reads when
// privacy.sanitize.sanitizeOnShutdown is on; history and downloads stay.
const STRICT = {
  ...STANDARD,
  "privacy.resistFingerprinting": true,
  "privacy.resistFingerprinting.letterboxing": true,
  "privacy.sanitize.sanitizeOnShutdown": true,
  "privacy.clearOnShutdown_v2.cookiesAndStorage": true,
  "privacy.clearOnShutdown_v2.cache": true,
  "privacy.clearOnShutdown_v2.browsingHistoryAndDownloads": false,
  "webgl.disabled": true,
  "media.peerconnection.ice.default_address_only": true,
};

const PRESETS = { standard: STANDARD, strict: STRICT };

function setPref(name, value) {
  switch (typeof value) {
    case "boolean":
      Services.prefs.setBoolPref(name, value);
      break;
    case "number":
      Services.prefs.setIntPref(name, value);
      break;
    default:
      Services.prefs.setStringPref(name, value);
  }
}

function matches(name, value) {
  // A pref turned into another type in about:config never matches.
  let types = {
    boolean: Services.prefs.PREF_BOOL,
    number: Services.prefs.PREF_INT,
    string: Services.prefs.PREF_STRING,
  };
  if (Services.prefs.getPrefType(name) != types[typeof value]) {
    return false;
  }
  switch (typeof value) {
    case "boolean":
      return Services.prefs.getBoolPref(name) === value;
    case "number":
      return Services.prefs.getIntPref(name) === value;
    default:
      return Services.prefs.getStringPref(name) === value;
  }
}

// While apply() runs, pref changes are collected into one notification.
let applying = false;
const listeners = new Set();
function notifyAll() {
  for (let callback of listeners) {
    callback();
  }
}

export const KyberPrivacyPresets = {
  PRESETS,

  /**
   * Sets every pref of a preset as a user value.
   *
   * @param {"standard"|"strict"} name
   */
  apply(name) {
    if (!Object.hasOwn(PRESETS, name)) {
      throw new Error(`Unknown privacy preset "${name}"`);
    }
    applying = true;
    try {
      for (let [pref, value] of Object.entries(PRESETS[name])) {
        setPref(pref, value);
      }
      Services.prefs.setStringPref(RECORD_PREF, name);
    } finally {
      applying = false;
      notifyAll();
    }
  },

  /**
   * The preset the live pref values match. The recorded name is only a
   * hint for the user; the live values decide.
   *
   * @returns {"standard"|"strict"|"custom"}
   */
  current() {
    for (let name of ["strict", "standard"]) {
      if (
        Object.entries(PRESETS[name]).every(([pref, value]) =>
          matches(pref, value)
        )
      ) {
        return name;
      }
    }
    return "custom";
  },

  /**
   * Calls a function whenever a pref of either preset changes.
   *
   * @param {Function} callback
   * @returns {Function} Stops the observing.
   */
  observe(callback) {
    let names = new Set([...Object.keys(STANDARD), ...Object.keys(STRICT)]);
    listeners.add(callback);
    let observer = {
      observe() {
        if (!applying) {
          callback();
        }
      },
    };
    for (let name of names) {
      Services.prefs.addObserver(name, observer);
    }
    return () => {
      listeners.delete(callback);
      for (let name of names) {
        Services.prefs.removeObserver(name, observer);
      }
    };
  },
};
