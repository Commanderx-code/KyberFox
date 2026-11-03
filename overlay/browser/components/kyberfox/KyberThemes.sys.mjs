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
const CUSTOM_PREF = "kyberfox.theme.custom";
const DEFAULT_ID = "ember";
const CUSTOM_MAX_BYTES = 1024 * 1024;
const CUSTOM_NAME = "kyberfox-custom.css";

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
let gCustomUri = null;
let gCustomLoading = Promise.resolve();
// Awaited by every import so a reset cannot delete a file imported after it.
let gFileWork = Promise.resolve();

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

/** The only place custom CSS is ever read from or written to. */
function customPath() {
  return PathUtils.join(PathUtils.profileDir, "chrome", CUSTOM_NAME);
}

/** Thrown by importCustomCss. `code`: too-large, not-css, unreadable or write-failed. */
export class KyberThemeImportError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "KyberThemeImportError";
    this.code = code;
  }
}

/**
 * Parses text with the engine's own CSS parser. A CSSStyleSheet needs a
 * window to be constructed in; replaceSync does not throw on bad syntax, it
 * drops it, so text that yields no rules at all is not CSS.
 *
 * @param {string} text
 */
function cssHasRules(text) {
  let win =
    Services.wm.getMostRecentWindow(null) || Services.appShell.hiddenDOMWindow;
  if (!win) {
    throw new KyberThemeImportError("unreadable", "no window to parse in");
  }
  try {
    let sheet = new win.CSSStyleSheet();
    sheet.replaceSync(text);
    return !!sheet.cssRules.length;
  } catch (e) {
    return false;
  }
}

/**
 * The custom file's rules, scoped to the browser window like the palette is:
 * a user sheet would otherwise also hit every web page.
 *
 * @param {string} text
 */
function customSheetUri(text) {
  let css = `@-moz-document url-prefix("chrome://browser/content/browser.xhtml") { ${text} }`;
  return Services.io.newURI("data:text/css," + encodeURIComponent(css));
}

/**
 * Registers (or re-registers) the custom sheet above the palette sheet.
 *
 * @param {string} text
 */
function registerCustom(text) {
  unregisterCustom();
  gCustomUri = customSheetUri(text);
  register(gCustomUri);
}

function unregisterCustom() {
  if (gCustomUri) {
    sss.unregisterSheet(gCustomUri, sss.USER_SHEET);
    gCustomUri = null;
  }
}

/** Re-registers the stored custom file on start, when the pref says so. */
async function loadCustom() {
  if (!Services.prefs.getBoolPref(CUSTOM_PREF, false)) {
    return;
  }
  try {
    let path = customPath();
    let info = await IOUtils.stat(path);
    if (info.type != "regular" || info.size > CUSTOM_MAX_BYTES) {
      throw new Error("not a regular file within the size limit");
    }
    registerCustom(await IOUtils.readUTF8(path));
  } catch (e) {
    // A missing or damaged file must not leave the pref claiming otherwise.
    console.error("KyberThemes: cannot load custom CSS", e);
    Services.prefs.clearUserPref(CUSTOM_PREF);
  }
}

export const KyberThemes = {
  /** Test hook: overrides Services.appinfo.inSafeMode when not undefined. */
  _safeModeForTests: undefined,

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
    // Sheets later in registration order win; keep the custom file on top.
    if (gCustomUri) {
      let uri = gCustomUri;
      sss.unregisterSheet(uri, sss.USER_SHEET);
      register(uri);
    }

    // Before the pref write: pref observers call current().
    gCurrent = id;
    if (!keepPref) {
      try {
        Services.prefs.setStringPref(ID_PREF, id);
      } catch (e) {
        // A pref of another type: replace it.
        Services.prefs.clearUserPref(ID_PREF);
        Services.prefs.setStringPref(ID_PREF, id);
      }
    }
  },

  /**
   * Applies the stored theme and the stored custom CSS. Called from every
   * window; the first call wins. Does nothing in safe mode. Returns the
   * promise of the custom file load.
   */
  init() {
    if (this._safeModeForTests ?? Services.appinfo.inSafeMode) {
      return gCustomLoading;
    }
    if (gInitialized) {
      return gCustomLoading;
    }
    gInitialized = true;
    this.apply(stringPref(ID_PREF, DEFAULT_ID));
    gCustomLoading = loadCustom();
    return gCustomLoading;
  },

  /**
   * Copies a CSS file into <profile>/chrome/kyberfox-custom.css and applies
   * it above the theme. The file's bytes are copied; nothing links to the
   * original. On any error nothing changes and the promise rejects with a
   * KyberThemeImportError whose `code` is "too-large", "not-css",
   * "unreadable" or "write-failed".
   *
   * @param {nsIFile} file
   */
  async importCustomCss(file) {
    await gFileWork;
    if (!file.leafName.toLowerCase().endsWith(".css")) {
      throw new KyberThemeImportError("not-css", file.leafName);
    }
    let bytes;
    try {
      let info = await IOUtils.stat(file.path);
      if (info.type != "regular") {
        throw new Error("not a regular file");
      }
      if (info.size > CUSTOM_MAX_BYTES) {
        throw new KyberThemeImportError("too-large", `${info.size} bytes`);
      }
      bytes = await IOUtils.read(file.path, { maxBytes: CUSTOM_MAX_BYTES + 1 });
    } catch (e) {
      if (e instanceof KyberThemeImportError) {
        throw e;
      }
      throw new KyberThemeImportError("unreadable", e.message);
    }
    if (bytes.length > CUSTOM_MAX_BYTES) {
      throw new KyberThemeImportError("too-large", `${bytes.length} bytes`);
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
      throw new KyberThemeImportError("not-css", "not UTF-8 text");
    }
    if (!cssHasRules(text)) {
      throw new KyberThemeImportError("not-css", "no CSS rules");
    }
    let dest = customPath();
    try {
      await IOUtils.makeDirectory(PathUtils.parent(dest), {
        createAncestors: true,
      });
      // Remove first so a symlink at the destination is replaced, not
      // written through into some other file.
      await IOUtils.remove(dest, { ignoreAbsent: true });
      await IOUtils.write(dest, bytes, { tmpPath: dest + ".tmp" });
    } catch (e) {
      throw new KyberThemeImportError("write-failed", e.message);
    }
    registerCustom(text);
    Services.prefs.setBoolPref(CUSTOM_PREF, true);
  },

  /**
   * Drops the custom CSS (sheet, file and pref) and applies Ember. This is
   * the way back from CSS that hides the toolbar; Ctrl+Shift+Alt+T calls it.
   */
  resetToDefault() {
    unregisterCustom();
    Services.prefs.clearUserPref(CUSTOM_PREF);
    gFileWork = gFileWork
      .then(() => IOUtils.remove(customPath(), { ignoreAbsent: true }))
      .catch(e => console.error("KyberThemes: cannot delete custom CSS", e));
    this.apply(DEFAULT_ID);
  },

  /** Resolves when a reset's file deletion has finished. */
  filesSettled() {
    return gFileWork;
  },

  /** Forget everything init() did, so tests can run it again. */
  _resetForTests() {
    for (let uri of [gBaseUri, gPaletteUri, gCustomUri]) {
      if (uri) {
        sss.unregisterSheet(uri, sss.USER_SHEET);
      }
    }
    gBaseUri = gPaletteUri = gCustomUri = null;
    gInitialized = false;
    gCurrent = DEFAULT_ID;
    gCustomLoading = Promise.resolve();
    this._safeModeForTests = undefined;
  },
};
