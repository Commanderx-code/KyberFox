/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Kyber Fox privacy preset group at the top of the Privacy pane of
// about:preferences. patches/kyber/privacy-presets-pane.patch imports this
// module from config/privacy.mjs and adds the group to the pane.

import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";

const { KyberPrivacyPresets } = ChromeUtils.importESModule(
  "resource:///modules/KyberPrivacyPresets.sys.mjs"
);

Preferences.addSetting({
  id: "kyberfoxPrivacyPreset",
  get: () => KyberPrivacyPresets.current(),
  set: value => {
    // Custom is only ever selected by changing a pref elsewhere.
    if (value != "custom") {
      KyberPrivacyPresets.apply(value);
    }
    return value;
  },
  setup: emitChange => KyberPrivacyPresets.observe(emitChange),
  // Custom is a state, not a choice: it shows only while it is the current
  // state, and is never greyed out.
  getControlConfig: (config, deps, setting) => ({
    ...config,
    options: config.options.map(option =>
      option.value == "custom"
        ? { ...option, hidden: setting.value != "custom" }
        : option
    ),
  }),
});

Preferences.addSetting({
  id: "kyberfoxPrivacyPresetStrictWarning",
  deps: ["kyberfoxPrivacyPreset"],
  visible: deps => deps.kyberfoxPrivacyPreset.value == "strict",
});

// "What Strict changes": a row per option Strict turns on, each reading its
// own prefs so a change made elsewhere shows at once.
const STRICT_OPTIONS = {
  kyberfoxStrictFingerprinting: ["privacy.resistFingerprinting"],
  kyberfoxStrictClearOnQuit: [
    "privacy.sanitize.sanitizeOnShutdown",
    "privacy.clearOnShutdown_v2.cookiesAndStorage",
  ],
  kyberfoxStrictWebGL: ["webgl.disabled"],
  kyberfoxStrictWebRTC: ["media.peerconnection.ice.default_address_only"],
};

Preferences.addSetting({ id: "kyberfoxStrictChanges" });
for (let [id, prefs] of Object.entries(STRICT_OPTIONS)) {
  Preferences.addSetting({
    id,
    get: () => prefs.every(pref => Services.prefs.getBoolPref(pref, false)),
    setup: emitChange => {
      for (let pref of prefs) {
        Services.prefs.addObserver(pref, emitChange);
      }
      return () => {
        for (let pref of prefs) {
          Services.prefs.removeObserver(pref, emitChange);
        }
      };
    },
    getControlConfig: (config, deps, setting) => ({
      ...config,
      l10nArgs: { state: setting.value ? "on" : "off" },
    }),
  });
}

// Opens the first-run page (recommended add-ons, default search) again.
Preferences.addSetting({
  id: "kyberfoxRecommendedAddonsLink",
  onUserClick: () => {
    window.browsingContext.topChromeWindow.switchToTabHavingURI(
      "chrome://kyberfox/content/welcome.xhtml",
      true,
      {
        triggeringPrincipal:
          Services.scriptSecurityManager.getSystemPrincipal(),
      }
    );
  },
});

SettingGroupManager.registerGroups({
  kyberfoxPrivacyPresets: {
    l10nId: "kyberfox-privacy-preset-group",
    iconSrc: "chrome://browser/skin/controlcenter/tracking-protection.svg",
    headingLevel: 2,
    items: [
      {
        id: "kyberfoxPrivacyPreset",
        control: "moz-radio-group",
        l10nId: "kyberfox-privacy-preset-label",
        options: [
          {
            id: "kyberfoxPrivacyPresetStandard",
            value: "standard",
            l10nId: "kyberfox-privacy-preset-standard",
          },
          {
            id: "kyberfoxPrivacyPresetStrict",
            value: "strict",
            l10nId: "kyberfox-privacy-preset-strict",
          },
          {
            id: "kyberfoxPrivacyPresetCustom",
            value: "custom",
            l10nId: "kyberfox-privacy-preset-custom",
          },
        ],
      },
      {
        id: "kyberfoxPrivacyPresetStrictWarning",
        l10nId: "kyberfox-privacy-preset-strict-warning",
        control: "moz-message-bar",
        controlAttrs: {
          type: "warning",
        },
      },
      {
        id: "kyberfoxStrictChanges",
        l10nId: "kyberfox-strict-changes-header",
        control: "moz-fieldset",
        headingLevel: 3,
        // Fieldsets, not box items: box items break descriptions mid-word.
        items: Object.keys(STRICT_OPTIONS).map(id => ({
          id,
          l10nId: `kyberfox-strict-${id.slice("kyberfoxStrict".length).toLowerCase()}`,
          control: "moz-fieldset",
          headingLevel: 4,
        })),
      },
      {
        id: "kyberfoxRecommendedAddonsLink",
        l10nId: "kyberfox-privacy-recommended-addons-link",
        control: "moz-box-button",
      },
    ],
  },
});
