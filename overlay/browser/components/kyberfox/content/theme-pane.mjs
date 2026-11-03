/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Kyber Fox theme group at the top of the Appearance pane of
// about:preferences: a card grid of every theme in KyberThemes.available(),
// an Import custom CSS button and a Reset button.
// patches/kyber/theme-pane.patch imports this module from
// config/appearance.mjs and adds the group to the pane.

import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const { KyberThemes } = ChromeUtils.importESModule(
  "resource:///modules/KyberThemes.sys.mjs"
);

const ID_PREF = "kyberfox.theme.id";
const CUSTOM_PREF = "kyberfox.theme.custom";

/**
 * One card per theme. `value` is the current theme id; choosing a card sets
 * it and fires "change", which the setting group turns into a Setting change.
 */
class KyberfoxThemePicker extends MozLitElement {
  static properties = {
    value: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.value = KyberThemes.current();
    this.disabled = false;
  }

  choose(id) {
    if (this.disabled) {
      return;
    }
    this.value = id;
    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  cardTemplate(theme) {
    let vars = KyberThemes.palette(theme.id)?.vars ?? {};
    let current = theme.id == this.value;
    return html`<button
      class="card"
      type="button"
      role="radio"
      data-theme-id=${theme.id}
      aria-checked=${current}
      ?disabled=${theme.disabled || this.disabled}
      @click=${() => this.choose(theme.id)}
    >
      <span
        class="preview"
        style="background: ${vars["--kf-bg"]}; color: ${vars[
          "--kf-fg"
        ]}; font-family: ${vars["--kf-font"]}"
      >
        <span
          class="band toolbar"
          style="background: ${vars["--kf-bg-toolbar"]}"
          >${theme.name}</span
        >
        <span
          class="band accent"
          style="background: ${vars["--kf-accent"]}"
        ></span>
      </span>
      <span class="name">${theme.name}</span>
      ${current
        ? html`<span
            class="note"
            data-l10n-id="kyberfox-theme-card-current"
          ></span>`
        : ""}
      ${theme.disabled
        ? html`<span
            class="note"
            data-l10n-id="kyberfox-theme-card-off"
          ></span>`
        : ""}
    </button>`;
  }

  render() {
    return html`
      <style>
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
          gap: var(--space-medium);
        }
        .card {
          display: flex;
          flex-direction: column;
          gap: var(--space-xsmall);
          padding: var(--space-small);
          border: 2px solid transparent;
          border-radius: var(--border-radius-medium);
          background: var(--background-color-box);
          color: var(--text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .card[aria-checked="true"] {
          border-color: var(--color-accent-primary);
        }
        .card:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .card:focus-visible {
          outline: 2px solid var(--focus-outline-color);
          outline-offset: 2px;
        }
        .preview {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          min-height: 4.5rem;
          border-radius: var(--border-radius-small);
          overflow: hidden;
        }
        .band {
          display: block;
          padding: var(--space-xxsmall) var(--space-small);
          font-size: 0.85em;
        }
        .accent {
          height: 0.5rem;
          padding: 0;
        }
        .name {
          font-weight: 600;
        }
        .note {
          font-size: 0.85em;
          color: var(--text-color-deemphasized);
        }
      </style>
      <div class="grid" role="radiogroup" data-l10n-id="kyberfox-theme-grid">
        ${KyberThemes.available().map(theme => this.cardTemplate(theme))}
      </div>
    `;
  }
}
customElements.define("kyberfox-theme-picker", KyberfoxThemePicker);

// The last import error, shown in a message bar until the next import.
let importErrorCode = null;
const errorListeners = new Set();

function setImportError(code) {
  importErrorCode = code;
  for (let emitChange of errorListeners) {
    emitChange();
  }
}

async function chooseAndImport() {
  try {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(
      window.browsingContext,
      await document.l10n.formatValue("kyberfox-theme-import-title"),
      Ci.nsIFilePicker.modeOpen
    );
    fp.appendFilter("CSS", "*.css");
    let result = await new Promise(resolve => fp.open(resolve));
    if (result != Ci.nsIFilePicker.returnOK) {
      return;
    }
    await KyberThemes.importCustomCss(fp.file);
    setImportError(null);
  } catch (e) {
    console.error("Kyber Fox: custom CSS import failed", e);
    setImportError(e.code ?? "unreadable");
  }
}

Preferences.addSetting({
  id: "kyberfoxTheme",
  get: () => KyberThemes.current(),
  set: value => {
    KyberThemes.apply(value);
    return value;
  },
  setup: emitChange => {
    let observer = { observe: () => emitChange() };
    Services.prefs.addObserver(ID_PREF, observer);
    return () => Services.prefs.removeObserver(ID_PREF, observer);
  },
});

Preferences.addSetting({
  id: "kyberfoxThemeImport",
  onUserClick: () => {
    chooseAndImport();
  },
});

Preferences.addSetting({
  id: "kyberfoxThemeReset",
  onUserClick: () => {
    KyberThemes.resetToDefault();
    setImportError(null);
  },
});

Preferences.addSetting({ id: "kyberfoxThemeCssWarning" });

Preferences.addSetting({
  id: "kyberfoxThemeImportError",
  visible: () => importErrorCode !== null,
  getControlConfig: config => ({
    ...config,
    l10nId: `kyberfox-theme-error-${importErrorCode ?? "unreadable"}`,
  }),
  setup: emitChange => {
    errorListeners.add(emitChange);
    // A reset from the keyboard shortcut makes the last error stale.
    let observer = {
      observe: () => {
        if (importErrorCode !== null) {
          setImportError(null);
        }
      },
    };
    Services.prefs.addObserver(CUSTOM_PREF, observer);
    return () => {
      errorListeners.delete(emitChange);
      Services.prefs.removeObserver(CUSTOM_PREF, observer);
    };
  },
});

SettingGroupManager.registerGroups({
  kyberfoxTheme: {
    l10nId: "kyberfox-theme-group",
    iconSrc: "chrome://browser/skin/customize.svg",
    headingLevel: 2,
    items: [
      {
        id: "kyberfoxTheme",
        control: "kyberfox-theme-picker",
      },
      {
        id: "kyberfoxThemeImport",
        control: "moz-button",
        l10nId: "kyberfox-theme-import",
      },
      {
        id: "kyberfoxThemeCssWarning",
        l10nId: "kyberfox-theme-css-warning",
        control: "moz-message-bar",
        controlAttrs: { type: "warning" },
      },
      {
        id: "kyberfoxThemeImportError",
        l10nId: "kyberfox-theme-error-unreadable",
        control: "moz-message-bar",
        controlAttrs: { type: "error" },
      },
      {
        id: "kyberfoxThemeReset",
        control: "moz-button",
        l10nId: "kyberfox-theme-reset",
      },
    ],
  },
});
