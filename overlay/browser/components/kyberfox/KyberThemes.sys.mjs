/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Kyber Fox themes. A theme is an entry of themes/palettes.json: a set of
 * `--kf-*` variables. base.css maps those onto Firefox's own variables and is
 * registered once as a user sheet; the palette is a second user sheet built
 * as a data: URI. Replacing the palette sheet restyles every open and future
 * window at once.
 */

const THEMES_URI = "chrome://kyberfox/content/themes/";
const ID_PREF = "kyberfox.theme.id";
const DISABLED_PREF = "kyberfox.theme.disabled";
const DEFAULT_ID = "ember";
const SCHEME_PREFS = [
  "browser.theme.toolbar-theme",
  "browser.theme.content-theme",
];

const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
  Ci.nsIStyleSheetService
);

let gPalettes = null;
let gStatus = null;
let gInitialized = false;
let gBaseUri = null;
let gPaletteUri = null;
let gCurrent = DEFAULT_ID;

function readJSON(name) {
  let uri = Services.io.newURI(THEMES_URI + name);
  return JSON.parse(Cu.readUTF8URI(uri));
}

function load() {
  if (!gPalettes) {
    gPalettes = readJSON("palettes.json");
    gStatus = readJSON("status.json");
  }
}

function disabledIds() {
  let ids = new Set(gStatus.disabled ?? []);
  for (let id of Services.prefs.getStringPref(DISABLED_PREF, "").split(",")) {
    if (id.trim()) {
      ids.add(id.trim());
    }
  }
  return ids;
}

function usable(id) {
  return (
    typeof id == "string" &&
    Object.hasOwn(gPalettes, id) &&
    !disabledIds().has(id)
  );
}

function paletteCss(vars) {
  let body = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
  return `@-moz-document url-prefix("chrome://browser/content/browser.xhtml") { :root { ${body} } }`;
}

function register(uri) {
  sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
}

export const KyberThemes = {
  /** Every theme in palettes.json, with whether it is currently disabled. */
  available() {
    load();
    let off = disabledIds();
    return Object.entries(gPalettes).map(([id, p]) => ({
      id,
      name: p.name,
      kind: p.kind,
      disabled: off.has(id),
    }));
  },

  /**
   * The raw palettes.json entry: {name, kind, scheme, vars}.
   *
   * @param {string} id
   */
  palette(id) {
    load();
    return Object.hasOwn(gPalettes, id) ? gPalettes[id] : null;
  },

  /** The id of the theme in effect. */
  current() {
    return gCurrent;
  },

  /**
   * Applies a theme and stores it. An unknown or disabled id applies Ember
   * and stores that, so the pref and current() agree.
   *
   * @param {string} id
   */
  apply(id) {
    load();
    if (!usable(id)) {
      id = DEFAULT_ID;
    }
    if (!gBaseUri) {
      gBaseUri = Services.io.newURI(THEMES_URI + "base.css");
      register(gBaseUri);
    }
    let palette = gPalettes[id];
    let next = Services.io.newURI(
      "data:text/css," + encodeURIComponent(paletteCss(palette.vars))
    );
    register(next);
    if (gPaletteUri) {
      sss.unregisterSheet(gPaletteUri, sss.USER_SHEET);
    }
    gPaletteUri = next;

    // Firefox's own text colors and in-content pages follow the scheme.
    let scheme = palette.scheme == "light" ? 1 : 0;
    for (let pref of SCHEME_PREFS) {
      Services.prefs.setIntPref(pref, scheme);
    }
    Services.prefs.setStringPref(ID_PREF, id);
    gCurrent = id;
  },

  /** Applies the stored theme. Called from every window; the first call wins. */
  init() {
    if (gInitialized) {
      return;
    }
    gInitialized = true;
    load();
    this.apply(Services.prefs.getStringPref(ID_PREF, DEFAULT_ID));
  },
};
