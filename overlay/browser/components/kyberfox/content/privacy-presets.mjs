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
});

Preferences.addSetting({
  id: "kyberfoxPrivacyPresetStrictWarning",
  deps: ["kyberfoxPrivacyPreset"],
  visible: deps => deps.kyberfoxPrivacyPreset.value == "strict",
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
            disabled: true,
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
    ],
  },
});
