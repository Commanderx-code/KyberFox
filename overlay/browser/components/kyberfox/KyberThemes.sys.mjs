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
const SKIN_BACKUP_PREF = "kyberfox.theme.skinPrefBackup";
// Kyber Crystal is what a new profile gets; Ember is where every failure,
// and the reset, lands, because it needs no skin sheets.
const DEFAULT_ID = "kyber-crystal";
const FALLBACK_ID = "ember";
const KYBER_IDS = ["kyber-crystal", "kyber-crimson", "kyber-azure"];
// Set once the one-time move from Ember to Kyber Crystal has run.
const MOVED_PREF = "kyberfox.theme.movedToKyber";
const GLOW_PREF = "kyberfox.theme.reduceGlow";
// The documents the Kyber sheets style.
const KYBER_SCOPE =
  'url-prefix("chrome://"), url("about:newtab"), url("about:home"), url("about:privatebrowsing")';
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
let gCurrent = FALLBACK_ID;
let gGlowUri = null;
let gGlowObserved = false;
let gOnFallback = false;
let gCustomUri = null;
// Skins: id -> skin.json, and the sheets of the skin in effect.
let gSkins = {};
let gSkinUris = [];
let gSkinId = null;
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
    loadSkins();
  } catch (e) {
    console.error("KyberThemes: cannot read the theme files", e);
    gPalettes = FALLBACK;
    gOnFallback = true;
    gStatus = { disabled: [] };
  }
}

/**
 * Adds every skin listed in skins/index.json to gPalettes as kind "skin".
 * A skin that cannot be read is left out and logged; the others still load.
 */
function loadSkins() {
  let ids;
  try {
    ids = readJSON("skins/index.json").skins;
  } catch (e) {
    console.error("KyberThemes: cannot read skins/index.json", e);
    return;
  }
  for (let id of Array.isArray(ids) ? ids : []) {
    try {
      let skin = readJSON(`skins/${id}/skin.json`);
      if (
        skin.id != id ||
        skin.kind != "skin" ||
        !Array.isArray(skin.sheets) ||
        !skin.sheets.length ||
        (skin.shared !== undefined && !sharedPathsValid(skin.shared)) ||
        Object.hasOwn(gPalettes, id)
      ) {
        throw new Error("skin.json has the wrong shape");
      }
      gSkins[id] = skin;
      gPalettes[id] = {
        name: skin.name,
        kind: "skin",
        scheme: skin.scheme,
        vars: skin.vars,
      };
    } catch (e) {
      console.error(`KyberThemes: cannot read skin ${id}`, e);
    }
  }
}

/** "shared" lists paths under themes/: plain relative names, no "..". */
function sharedPathsValid(paths) {
  return (
    Array.isArray(paths) &&
    paths.every(
      p =>
        typeof p == "string" &&
        /^[a-z0-9][a-z0-9/_.-]*\.css$/.test(p) &&
        !p.split("/").includes("..")
    )
  );
}

/** Registers or drops the reduce-glow sheet to match the pref. */
function syncGlow() {
  let on = false;
  try {
    on = Services.prefs.getBoolPref(GLOW_PREF, false);
  } catch (e) {
    console.error(`KyberThemes: ${GLOW_PREF} is not a bool pref`, e);
  }
  if (on && !gGlowUri) {
    gGlowUri = Services.io.newURI(
      "data:text/css," +
        encodeURIComponent(
          `@-moz-document ${KYBER_SCOPE} { :root { --kyber-glow-strength: 0.25 !important; } }`
        )
    );
    register(gGlowUri);
  } else if (!on && gGlowUri) {
    sss.unregisterSheet(gGlowUri, sss.USER_SHEET);
    gGlowUri = null;
  }
}

function observeGlow() {
  if (!gGlowObserved) {
    gGlowObserved = true;
    Services.prefs.addObserver(GLOW_PREF, syncGlow);
  }
  syncGlow();
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
  // A skin brings its own colors; it only gets the color-scheme rules.
  let body =
    palette.kind == "skin"
      ? ""
      : Object.entries(palette.vars)
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
  if (palette.kind != "skin" && palette.vars["--kf-bg-image"] != "none") {
    css += ` #TabsToolbar, #nav-bar { background-image: var(--kf-bg-image) !important; background-size: 240px 60px !important; background-repeat: repeat !important; }`;
  }
  // A skin's sheets reach every chrome:// document (the Library, dialogs), so
  // its scheme rule does too.
  let scope =
    palette.kind == "skin"
      ? "chrome://"
      : "chrome://browser/content/browser.xhtml";
  return `@-moz-document url-prefix("${scope}") { ${css} }`;
}

function register(uri) {
  sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
}

function readPref(name) {
  switch (Services.prefs.getPrefType(name)) {
    case Services.prefs.PREF_BOOL:
      return Services.prefs.getBoolPref(name);
    case Services.prefs.PREF_INT:
      return Services.prefs.getIntPref(name);
    case Services.prefs.PREF_STRING:
      return Services.prefs.getStringPref(name);
  }
  return undefined;
}

function writePref(name, value) {
  switch (typeof value) {
    case "boolean":
      Services.prefs.setBoolPref(name, value);
      break;
    case "number":
      Services.prefs.setIntPref(name, value);
      break;
    case "string":
      Services.prefs.setStringPref(name, value);
      break;
    default:
      throw new Error(`unsupported value for ${name}`);
  }
}

/** The saved user values of the skin prefs, or null when nothing is saved. */
function readBackup() {
  let raw = stringPref(SKIN_BACKUP_PREF, "");
  if (!raw) {
    return null;
  }
  try {
    let backup = JSON.parse(raw);
    return backup && typeof backup == "object" ? backup : null;
  } catch (e) {
    console.error("KyberThemes: skin pref backup is damaged", e);
    return null;
  }
}

/** Puts every backed-up pref back (clearing those with no user value). */
function restoreSkinPrefs() {
  let backup = readBackup();
  for (let [name, saved] of Object.entries(backup ?? {})) {
    try {
      if (saved.had) {
        writePref(name, saved.value);
      } else {
        Services.prefs.clearUserPref(name);
      }
    } catch (e) {
      console.error(`KyberThemes: cannot restore ${name}`, e);
    }
  }
  Services.prefs.clearUserPref(SKIN_BACKUP_PREF);
}

/**
 * Saves the user values of the skin's prefs, then sets the skin's values.
 * A backup that already covers exactly these prefs (a restart, or a crash
 * after the backup was written) is kept as is, so it never records the
 * skin's own values as the user's; the skin's values are written again.
 *
 * @param {object} prefs Pref name to value, from skin.json.
 */
function applySkinPrefs(prefs) {
  let names = Object.keys(prefs);
  let backup = readBackup();
  let covered =
    backup &&
    names.length == Object.keys(backup).length &&
    names.every(n => Object.hasOwn(backup, n));
  if (!covered) {
    restoreSkinPrefs();
    let saved = {};
    for (let name of names) {
      let had = Services.prefs.prefHasUserValue(name);
      saved[name] = had ? { had, value: readPref(name) } : { had };
    }
    // Written before any pref changes, so a crash cannot lose the user's values.
    Services.prefs.setStringPref(SKIN_BACKUP_PREF, JSON.stringify(saved));
  }
  // Always written: a crash between the backup and these writes leaves the
  // backup in place and the skin's values not yet set.
  for (let [name, value] of Object.entries(prefs)) {
    try {
      writePref(name, value);
    } catch (e) {
      console.error(`KyberThemes: cannot set ${name}`, e);
    }
  }
}

function unregisterSkinSheets() {
  for (let uri of gSkinUris) {
    sss.unregisterSheet(uri, sss.USER_SHEET);
  }
  gSkinUris = [];
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

const CUSTOM_SCOPE = `@-moz-document url-prefix("chrome://browser/content/browser.xhtml")`;

function parsingWindow() {
  let win =
    Services.wm.getMostRecentWindow(null) || Services.appShell.hiddenDOMWindow;
  if (!win) {
    throw new KyberThemeImportError("unreadable", "no window to parse in");
  }
  return win;
}

/**
 * The CSS for the custom sheet: the file's own rules, scoped to the browser
 * window like the palette is (a user sheet would otherwise also hit every
 * web page). The text is parsed first and only the parsed top-level rules'
 * serialization is used, so a stray "}" in the file cannot close the scope.
 *
 * @import and @namespace rules are dropped. The result is parsed again and
 * must be exactly one scope rule. Throws "not-css" otherwise. Nothing is
 * fetched or run by parsing.
 *
 * @param {string} text
 * @returns {string}
 */
function scopeCustomCss(text) {
  let win = parsingWindow();
  let rules;
  try {
    let sheet = new win.CSSStyleSheet();
    sheet.replaceSync(text);
    rules = [...sheet.cssRules]
      .filter(
        r =>
          !win.CSSImportRule.isInstance(r) &&
          !win.CSSNamespaceRule.isInstance(r)
      )
      .map(r => r.cssText);
  } catch (e) {
    throw new KyberThemeImportError("not-css", e.message);
  }
  if (!rules.length) {
    throw new KyberThemeImportError("not-css", "no CSS rules");
  }
  let css = `${CUSTOM_SCOPE} { ${rules.join("\n")} }`;
  let check = new win.CSSStyleSheet();
  check.replaceSync(css);
  if (
    check.cssRules.length != 1 ||
    check.cssRules[0].constructor.name != "CSSMozDocumentRule" ||
    !check.cssRules[0].cssText.startsWith(CUSTOM_SCOPE)
  ) {
    throw new KyberThemeImportError("not-css", "cannot be scoped");
  }
  return css;
}

/**
 * Registers (or re-registers) the custom sheet above the palette sheet.
 *
 * @param {string} scopedCss The result of scopeCustomCss.
 */
function registerCustom(scopedCss) {
  unregisterCustom();
  gCustomUri = Services.io.newURI(
    "data:text/css," + encodeURIComponent(scopedCss)
  );
  register(gCustomUri);
}

function unregisterCustom() {
  if (gCustomUri) {
    sss.unregisterSheet(gCustomUri, sss.USER_SHEET);
    gCustomUri = null;
  }
}

/**
 * Re-registers the stored custom file on start, when the pref says so. The
 * file is parsed and scoped again, so a hand-edited file gets no more reach
 * than an imported one.
 */
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
    let css = scopeCustomCss(await IOUtils.readUTF8(path));
    // A reset while the file was being read wins.
    if (Services.prefs.getBoolPref(CUSTOM_PREF, false)) {
      registerCustom(css);
    }
  } catch (e) {
    // A missing or damaged file must not leave the pref claiming otherwise.
    console.error("KyberThemes: cannot load custom CSS", e);
    Services.prefs.clearUserPref(CUSTOM_PREF);
  }
}

export const KyberThemes = {
  /** Test hook: overrides Services.appinfo.inSafeMode when not undefined. */
  _safeModeForTests: undefined,

  /**
   * Test hook: makes registering a skin sheet throw, as an unreadable sheet
   * would. (A really missing chrome:// file crashes the browser, so a test
   * cannot use one.)
   */
  _skinSheetFailsForTests: false,

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
   * Applies a theme and stores it. An unknown id applies Ember (FALLBACK_ID)
   * and stores that. A known but disabled id applies Ember and keeps the
   * stored choice, so the theme comes back once it is on again.
   *
   * @param {string} id
   */
  apply(id) {
    load();
    // On the built-in fallback every other id looks unknown. That may be a
    // temporary read error, so keep the stored choice.
    let keepPref =
      (gOnFallback && id != FALLBACK_ID) ||
      (typeof id == "string" &&
        Object.hasOwn(gPalettes, id) &&
        disabledIds().has(id));
    if (!usable(id)) {
      id = FALLBACK_ID;
    }
    let palette = gPalettes[id];
    let skin = palette.kind == "skin" ? gSkins[id] : null;
    // Whatever skin was in effect goes first: sheets off, prefs back.
    unregisterSkinSheets();
    if (skin) {
      if (gBaseUri) {
        sss.unregisterSheet(gBaseUri, sss.USER_SHEET);
        gBaseUri = null;
      }
    } else {
      restoreSkinPrefs();
      if (!gBaseUri) {
        gBaseUri = Services.io.newURI(THEMES_URI + "base.css");
        register(gBaseUri);
      }
    }
    let next = Services.io.newURI(
      "data:text/css," + encodeURIComponent(paletteCss(palette))
    );
    register(next);
    if (gPaletteUri) {
      sss.unregisterSheet(gPaletteUri, sss.USER_SHEET);
    }
    gPaletteUri = next;
    if (skin) {
      // Another skin's prefs go back first. After a restart gSkinId is null
      // and a matching backup is kept (see applySkinPrefs).
      if (gSkinId !== null) {
        restoreSkinPrefs();
      }
      try {
        for (let sheet of skin.sheets) {
          if (this._skinSheetFailsForTests) {
            throw new Error(`cannot load ${sheet}`);
          }
          let uri = Services.io.newURI(`${THEMES_URI}skins/${id}/${sheet}`);
          register(uri);
          gSkinUris.push(uri);
        }
        // Sheets several skins share, from themes/, after the skin's own.
        for (let rel of skin.shared ?? []) {
          if (this._skinSheetFailsForTests) {
            throw new Error(`cannot load ${rel}`);
          }
          let uri = Services.io.newURI(THEMES_URI + rel);
          register(uri);
          gSkinUris.push(uri);
        }
        applySkinPrefs(skin.prefs ?? {});
      } catch (e) {
        console.error(`KyberThemes: cannot apply skin ${id}`, e);
        unregisterSkinSheets();
        restoreSkinPrefs();
        gSkinId = null;
        this.apply(FALLBACK_ID);
        return;
      }
    }
    gSkinId = skin ? id : null;
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
    // Once per profile: Ember, the old default, moves to Kyber Crystal. Any
    // other stored theme is kept, and Ember picked again later stays.
    let stored = stringPref(ID_PREF, "");
    let moved = false;
    try {
      moved = Services.prefs.getBoolPref(MOVED_PREF, false);
    } catch (e) {
      console.error(`KyberThemes: ${MOVED_PREF} is not a bool pref`, e);
    }
    let moving = !moved && (!stored || stored == FALLBACK_ID);
    if (moving) {
      stored = DEFAULT_ID;
    }
    this.apply(stored || DEFAULT_ID);
    // A move that ended on Ember (Kyber Crystal off or unreadable) is tried
    // again on the next start.
    if (!moved && (!moving || gCurrent == DEFAULT_ID)) {
      Services.prefs.setBoolPref(MOVED_PREF, true);
    }
    observeGlow();
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
    let scoped = scopeCustomCss(text);
    let dest = customPath();
    try {
      await IOUtils.makeDirectory(PathUtils.parent(dest), {
        createAncestors: true,
      });
      // Remove first so a symlink at the destination is replaced, not
      // written through into some other file.
      await IOUtils.remove(dest, { ignoreAbsent: true });
      await IOUtils.write(dest, bytes);
    } catch (e) {
      throw new KyberThemeImportError("write-failed", e.message);
    }
    registerCustom(scoped);
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
    this.apply(FALLBACK_ID);
  },

  /**
   * Whether the id is one of the Kyber themes (Kyber Crystal, Crimson, Azure).
   *
   * @param {string} id
   */
  isKyber(id) {
    return KYBER_IDS.includes(id);
  },

  /** Whether "Reduce glow" is on. */
  reduceGlow() {
    return gGlowUri !== null;
  },

  /**
   * Turns "Reduce glow" on or off: a sheet that lowers --kyber-glow-strength.
   *
   * @param {boolean} on
   */
  setReduceGlow(on) {
    Services.prefs.setBoolPref(GLOW_PREF, !!on);
    syncGlow();
  },

  /** Resolves when a reset's file deletion has finished. */
  filesSettled() {
    return gFileWork;
  },

  /**
   * Test hook: adds (or, with null, removes) a skin from a manifest object,
   * as if it were listed in skins/index.json.
   *
   * @param {string} id
   * @param {object|null} manifest
   */
  _setSkinForTests(id, manifest) {
    load();
    if (!manifest) {
      delete gSkins[id];
      delete gPalettes[id];
      return;
    }
    gSkins[id] = manifest;
    gPalettes[id] = {
      name: manifest.name,
      kind: "skin",
      scheme: manifest.scheme,
      vars: manifest.vars,
    };
  },

  /** Forget everything init() did, so tests can run it again. */
  _resetForTests() {
    unregisterSkinSheets();
    gSkinId = null;
    for (let uri of [gBaseUri, gPaletteUri, gCustomUri, gGlowUri]) {
      if (uri) {
        sss.unregisterSheet(uri, sss.USER_SHEET);
      }
    }
    gBaseUri = gPaletteUri = gCustomUri = gGlowUri = null;
    gInitialized = false;
    gCurrent = FALLBACK_ID;
    gCustomLoading = Promise.resolve();
    this._safeModeForTests = undefined;
    this._skinSheetFailsForTests = false;
  },
};
