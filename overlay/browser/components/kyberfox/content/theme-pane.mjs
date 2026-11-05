/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Kyber Fox theme group at the top of the Appearance pane of
// about:preferences: a card grid of every theme in KyberThemes.available(),
// a Reduce glow checkbox, an Import custom CSS button and a Reset button.
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
const GLOW_PREF = "kyberfox.theme.reduceGlow";

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

  onCardKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    let keys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) {
      return;
    }
    let cards = [
      ...this.shadowRoot.querySelectorAll("button.card:not(:disabled)"),
    ];
    let index = cards.indexOf(event.target.closest("button.card"));
    if (index < 0) {
      return;
    }
    event.preventDefault();
    let backwards =
      event.key == "ArrowUp" ||
      (event.key == "ArrowLeft" && !this.matches(":dir(rtl)")) ||
      (event.key == "ArrowRight" && this.matches(":dir(rtl)"));
    let next = (index + (backwards ? -1 : 1) + cards.length) % cards.length;
    if (event.key == "Home") {
      next = 0;
    } else if (event.key == "End") {
      next = cards.length - 1;
    }
    let id = cards[next].dataset.themeId;
    this.choose(id);
    this.updateComplete.then(() => {
      [...this.shadowRoot.querySelectorAll("button.card")]
        .find(card => card.dataset.themeId == id)
        ?.focus();
    });
  }

  cardTemplate(theme, focusId) {
    let palette = KyberThemes.palette(theme.id);
    let vars = palette?.vars ?? {};
    let current = theme.id == this.value;
    return html`<button
      class="card"
      type="button"
      role="radio"
      data-theme-id=${theme.id}
      aria-checked=${current}
      tabindex=${theme.id == focusId && !this.disabled ? 0 : -1}
      ?disabled=${theme.disabled || this.disabled}
      @click=${() => this.choose(theme.id)}
    >
      <span
        class="preview"
        aria-hidden="true"
        style="background: ${vars["--kf-bg"]}; color: ${vars[
          "--kf-fg"
        ]}; font-family: ${vars["--kf-font"]}; --preview-accent: ${vars[
          "--kf-accent"
        ]}; --preview-field: ${vars["--kf-bg-urlbar"]}"
      >
        <span class="toolbar" style="background: ${vars["--kf-bg-toolbar"]}">
          <span
            class="preview-tab"
            style="background: ${vars["--kf-bg-tab-active"]}"
          ></span>
        </span>
        <span class="preview-address"></span>
        <span class="preview-page">
          <img
            class="preview-logo"
            src=${palette?.logo ?? "chrome://branding/content/icon32.png"}
            alt=""
          />
          <span class="preview-search"></span>
        </span>
        <span class="accent" style="background: ${vars["--kf-accent"]}"></span>
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
    let available = KyberThemes.available();
    let themes = [
      ...available.filter(theme => KyberThemes.isKyber(theme.id)),
      ...available.filter(theme => !KyberThemes.isKyber(theme.id)),
    ];
    let focusId =
      themes.find(theme => theme.id == this.value && !theme.disabled)?.id ??
      themes.find(theme => !theme.disabled)?.id;
    return html`
      <style>
        .grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(min(100%, 11.5rem), 1fr)
          );
          gap: 14px;
        }
        .card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
          padding: 10px;
          border: 2px solid
            var(
              --kyber-theme-card-border,
              var(--border-color-interactive, transparent)
            );
          border-radius: 12px;
          background: var(--background-color-box);
          color: var(--text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .card:not(:disabled):hover,
        .card[aria-checked="true"] {
          border-color: var(--color-accent-primary);
        }
        .card:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .card:focus-visible {
          outline: 2px solid var(--focus-outline-color);
          outline-offset: 3px;
        }
        .preview {
          display: flex;
          flex-direction: column;
          min-height: 108px;
          border-radius: 6px;
          overflow: hidden;
        }
        .toolbar {
          display: flex;
          padding: 6px 8px 0;
        }
        .preview-tab {
          width: 44%;
          height: 10px;
          border-radius: 4px 4px 0 0;
          border-block-start: 2px solid var(--preview-accent);
        }
        .preview-address {
          height: 8px;
          margin: 6px 10px;
          border-radius: 4px;
          background: var(--preview-field);
          border: 1px solid currentColor;
          opacity: 0.6;
        }
        .preview-page {
          display: flex;
          flex: 1;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px;
        }
        .preview-logo {
          width: 24px;
          height: 24px;
        }
        .preview-search {
          width: 65%;
          height: 8px;
          border-radius: 10px;
          border: 1px solid var(--preview-accent);
          background: var(--preview-field);
        }
        .accent {
          height: 3px;
        }
        .name {
          font-weight: 600;
        }
        .note {
          font-size: 0.8em;
          color: var(--text-color-deemphasized);
        }
        @media (forced-colors: active) {
          .card[aria-checked="true"] {
            border-color: Highlight;
          }
        }
      </style>
      <div
        class="grid"
        role="radiogroup"
        data-l10n-id="kyberfox-theme-grid"
        @keydown=${this.onCardKeyDown}
      >
        ${themes.map(theme => this.cardTemplate(theme, focusId))}
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
  id: "kyberfoxThemeReduceGlow",
  // The pref, not reduceGlow(): the observer below runs before the sheet
  // that reduceGlow() reports is registered.
  get: () => Services.prefs.getBoolPref(GLOW_PREF, false),
  set: checked => {
    KyberThemes.setReduceGlow(checked);
    return checked;
  },
  setup: emitChange => {
    let observer = { observe: () => emitChange() };
    Services.prefs.addObserver(GLOW_PREF, observer);
    return () => Services.prefs.removeObserver(GLOW_PREF, observer);
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
        id: "kyberfoxThemeReduceGlow",
        l10nId: "kyberfox-theme-reduce-glow",
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
