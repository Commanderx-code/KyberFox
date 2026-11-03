# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Workspaces. The workspace button sits at the start of the tab bar.

kyberfox-workspace-button =
    .tooltiptext = Switch workspace
kyberfox-workspace-panel =
    .aria-label = Workspaces
# Variables:
#   $number (number) - One more than the number of existing workspaces.
kyberfox-workspace-default-name = Workspace { $number }
kyberfox-workspace-new =
    .label = New workspace
kyberfox-workspace-rename =
    .label = Rename
kyberfox-workspace-delete =
    .label = Delete
kyberfox-workspace-name-input =
    .aria-label = Workspace name
# Variables:
#   $name (string) - The name of the workspace being deleted.
kyberfox-workspace-delete-title = Delete “{ $name }”?
# Variables:
#   $count (number) - How many tabs the workspace has in this window.
kyberfox-workspace-delete-message =
    { $count ->
        [one] This workspace has { $count } tab in this window. The tab moves to the first workspace.
       *[other] This workspace has { $count } tabs in this window. The tabs move to the first workspace.
    }
kyberfox-workspace-delete-confirm = Delete workspace

## Shield. The button sits right of the address bar and opens a per-site panel.

kyberfox-shield-button =
    .label = Shield
    .tooltiptext = Site protection
kyberfox-shield-panel =
    .aria-label = Site protection
# Variables:
#   $site (string) - The site the shield applies to, for example example.com.
kyberfox-shield-master =
    .label = Shield for { $site }
kyberfox-shield-ads =
    .label = Ads and trackers
kyberfox-shield-fingerprinting =
    .label = Fingerprinting
kyberfox-shield-cookies =
    .label = Cookies
kyberfox-shield-cookies-note = Also turns off Firefox’s tracker and fingerprint blocking for this site. uBlock Origin keeps blocking ads.
kyberfox-shield-private-note = Private window: one switch for this site, kept only for this session.
kyberfox-shield-unreachable = uBlock Origin not reachable.

## Privacy presets. The preset group tops the Privacy pane of about:preferences.

kyberfox-privacy-preset-group =
    .label = Kyber Fox privacy preset
    .description = Every option below stays adjustable; changing one switches the preset to Custom.
kyberfox-privacy-preset-label =
    .label = Privacy preset
kyberfox-privacy-preset-standard =
    .label = Standard
    .description = Blocks trackers and third-party cookies and upgrades sites to HTTPS. Sites work as usual.
kyberfox-privacy-preset-strict =
    .label = Strict
    .description = Also resists fingerprinting, turns off WebGL, and clears cookies, site data, and the cache when you quit.
kyberfox-privacy-preset-custom =
    .label = Custom
    .description = You changed an option a preset controls. Pick a preset to set them all again.
kyberfox-privacy-preset-strict-warning =
    .message = Strict turns on resist fingerprinting. Some sites may break, and the clock reads as UTC.

## DRM. The checkbox sits in the Digital Rights Management (DRM) group.

kyberfox-privacy-drm =
    .label = Play DRM-controlled content
    .accesskey = P
    .description = Uses Google’s closed-source Widevine module, downloaded when you turn this on.

## Themes. The theme group tops the Appearance pane of about:preferences.

kyberfox-theme-group =
    .label = Kyber Fox theme
    .description = Colors for the toolbar, tabs, and menus. A theme applies right away.
kyberfox-theme-grid =
    .aria-label = Themes
kyberfox-theme-card-current = Current
kyberfox-theme-card-off = Off in this release
kyberfox-theme-import =
    .label = Import custom CSS…
kyberfox-theme-import-title = Import custom CSS
kyberfox-theme-css-warning =
    .message = Imported CSS can load images from the internet. Only import files you trust.
kyberfox-theme-error-too-large =
    .message = That file is larger than 1 MB.
kyberfox-theme-error-not-css =
    .message = That file is not a CSS file.
kyberfox-theme-error-unreadable =
    .message = Kyber Fox could not read that file. Your theme is unchanged.
kyberfox-theme-error-write-failed =
    .message = Kyber Fox could not save that file in your profile. Your theme is unchanged.
kyberfox-theme-reset =
    .label = Reset to Ember
    .description = Removes imported CSS and switches to Ember. Press Ctrl+Shift+Alt+T in any window to do the same.

## Welcome page. Add-on names, summaries, and notes come from
## settings/recommended-addons.json and are not translated.

kyberfox-welcome-title = Welcome to Kyber Fox
kyberfox-welcome-heading = Welcome to Kyber Fox
kyberfox-welcome-intro = Pick a search engine and any add-ons you want. Nothing is selected for you, and nothing is downloaded until you choose Install selected.
kyberfox-welcome-search-heading = Default search
kyberfox-welcome-search-group =
    .aria-label = Default search engine
kyberfox-welcome-addons-heading = Recommended add-ons
kyberfox-welcome-addons-hint = These come from addons.mozilla.org, are signed by Mozilla, and update on their own. You can remove any of them later.
kyberfox-welcome-included = Included
kyberfox-welcome-install = Install selected
kyberfox-welcome-skip = Skip
kyberfox-welcome-working = Working…
kyberfox-welcome-installing = Installing…
kyberfox-welcome-installed = Installed
kyberfox-welcome-canceled = Canceled
kyberfox-welcome-error-network = Could not reach addons.mozilla.org. Check your connection and try again.
kyberfox-welcome-error-failed = Install failed.
kyberfox-welcome-done = Done. You can find this page again under Privacy & Security in Settings.
kyberfox-welcome-done-errors = Finished, but some add-ons did not install. You can try again.
kyberfox-welcome-failed = Something went wrong. Nothing else was changed.
kyberfox-privacy-recommended-addons-link =
    .label = Recommended add-ons
    .description = Choose add-ons and a default search engine from Kyber Fox's short list.
