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

// Used when palettes.json cannot be read, so the engine still works.
const FALLBACK = {
  ember: {
    name: "Ember",
    kind: "color",
    scheme: "dark",
    vars: {
      "--kf-bg": "#1c1b22",
      "--kf-bg-toolbar": "#2b2a33",
      "--kf-bg-tab-active": "#42414d",
      "--kf-bg-urlbar": "#42414d",
      "--kf-fg": "#fbfbfe",
      "--kf-fg-muted": "#cfcfd8",
      "--kf-accent": "#ff7139",
      "--kf-border": "#52525e",
      "--kf-radius": "4px",
      "--kf-font": "inherit",
      "--kf-bg-image": "none",
    },
  },
};

const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
  Ci.nsIStyleSheetService
);

let gPalettes = null;
let gStatus = null;
let gInitialized = false;
let gBaseUri = null;
let gPaletteUri = null;
let gCurrent = DEFAULT_ID;
let gOnFallback = false;

function readJSON(name) {
  let uri = Services.io.newURI(THEMES_URI + name);
  return JSON.parse(Cu.readUTF8URI(uri));
}

/** Never throws: a bad palettes.json leaves the built-in Ember. */
function load() {
  if (gPalettes) {
    return;
  }
  try {
    let palettes = readJSON("palettes.json");
    let status = readJSON("status.json");
    if (!palettes.ember || !Array.isArray(status.disabled)) {
      throw new Error("palettes.json or status.json has the wrong shape");
    }
    gPalettes = palettes;
    gStatus = status;
  } catch (e) {
    console.error("KyberThemes: cannot read the theme files", e);
    gPalettes = FALLBACK;
    gOnFallback = true;
    gStatus = { disabled: [] };
  }
}

function stringPref(name, fallback) {
  try {
    return Services.prefs.getStringPref(name, fallback);
  } catch (e) {
    console.error(`KyberThemes: ${name} is not a string pref`, e);
    return fallback;
  }
}

function disabledIds() {
  let ids = new Set(gStatus.disabled ?? []);
  for (let id of stringPref(DISABLED_PREF, "").split(",")) {
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

function paletteCss(palette) {
  let body = Object.entries(palette.vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
  // color-scheme settles Firefox's light-dark() tokens in the browser window
  // whatever browser.theme.* says (LightweightThemeConsumer rewrites those),
  // and leaves the websites' own appearance setting alone.
  let scheme = palette.scheme == "light" ? "light" : "dark";
  // Menus, panels and tooltips reset color-scheme to "light dark" themselves.
  let css = `:root { color-scheme: ${scheme} !important; ${body} } menupopup, panel, tooltip { color-scheme: ${scheme} !important; }`;
  // Only a palette with its own image overrides toolbar images, so
  // WebExtension themes keep theirs under the other palettes.
  if (palette.vars["--kf-bg-image"] != "none") {
    css += ` #TabsToolbar, #nav-bar { background-image: var(--kf-bg-image) !important; background-size: 240px 60px !important; background-repeat: repeat !important; }`;
  }
  return `@-moz-document url-prefix("chrome://browser/content/browser.xhtml") { ${css} }`;
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
    // On the built-in fallback every other id looks unknown. That may be a
    // temporary read error, so keep the stored choice.
    let keepPref = gOnFallback && id != DEFAULT_ID;
    if (!usable(id)) {
      id = DEFAULT_ID;
    }
    if (!gBaseUri) {
      gBaseUri = Services.io.newURI(THEMES_URI + "base.css");
      register(gBaseUri);
    }
    let palette = gPalettes[id];
    let next = Services.io.newURI(
      "data:text/css," + encodeURIComponent(paletteCss(palette))
    );
    register(next);
    if (gPaletteUri) {
      sss.unregisterSheet(gPaletteUri, sss.USER_SHEET);
    }
    gPaletteUri = next;

    if (!keepPref) {
      try {
        Services.prefs.setStringPref(ID_PREF, id);
      } catch (e) {
        // A pref of another type: replace it.
        Services.prefs.clearUserPref(ID_PREF);
        Services.prefs.setStringPref(ID_PREF, id);
      }
    }
    gCurrent = id;
  },

  /** Applies the stored theme. Called from every window; the first call wins. */
  init() {
    if (gInitialized) {
      return;
    }
    gInitialized = true;
    this.apply(stringPref(ID_PREF, DEFAULT_ID));
  },
};
