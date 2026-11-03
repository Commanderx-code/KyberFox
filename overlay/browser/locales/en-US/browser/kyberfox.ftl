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
