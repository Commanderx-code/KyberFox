# Controlling uBlock Origin per site (shield spike)

The shield engine (`KyberShield.sys.mjs`) turns uBlock Origin off and on for one
site. uBlock has no external messaging, so this records what was tried. All of
it ran against the signed upstream XPI that the assembler stages
(`uBlock0@raymondhill.net.xpi`, version 1.75.2) on the artifact build under the
mochitest harness. The XPI is never changed.

## Result

Quarantine does not work, and the fallback of patching uBlock is not needed. The
engine reaches uBlock's own per-site switch from privileged code instead.

## 1. Quarantined domains: fails

Test page: `https://example.com/.../shield_page.html` loads
`https://example.org/.../shield_ad.js`, which a uBlock user filter blocks. A
control run without uBlock confirms the script loads.

- uBlock blocks the script with `extensions.quarantinedDomains.list` empty.
- Adding `example.com` (the page) or `example.org` (the ad host) to the list
  changes nothing: the script stays blocked.
- Reason 1: uBlock carries `mozilla-recommendation.json`, and Firefox exempts
  every extension with a recommendation state from quarantine
  (`Extension.sys.mjs`: `ignoreQuarantine = isPrivileged || recommendationState
  || user opt-in`). `addon.isRecommended` and `policy.ignoreQuarantine` are true.
- Reason 2: lifting that exemption at runtime (flipping the per-add-on
  `extensions.quarantineIgnoredByUser.<id>` pref so `policy.ignoreQuarantine`
  becomes false) makes `policy.quarantinedFromURI(page)` and
  `canAccessURI(page)` report the quarantine, yet the request is still blocked.
  Quarantine gates content scripts, the extension APIs and declarativeNetRequest,
  not `webRequest` blocking, which is what uBlock uses on Firefox.
- Effect on other extensions: the list is browser-wide. Every extension that
  is not privileged, not recommended and not opted out by the user would lose
  its content scripts on the site. Recommended extensions (uBlock among them)
  are untouched. So even where quarantine worked it would be the wrong lever.

## 2. What works: uBlock's own switch, called from chrome

uBlock's background page registers message listeners in
`vAPI.messaging.listeners`. The toolbar popup's power button sends
`{what: "toggleNetFiltering", url, scope, state, tabId}` to the `popupPanel`
listener, which adds or removes the site in uBlock's trusted-sites list.
`KyberUBlockBridge` loads `content/shield-ublock-frame.js` into the background
page's browser (`messageManager.loadFrameScript`, chrome privilege) and has it
call that same listener with `url: https://<base domain>/`. Observed:

- With the switch off for `example.com`, the ad script loads on `example.com`
  and on `www.example.com` (uBlock's list matches subdomains). Turning it back
  on blocks it again on the next load.
- uBlock persists the list itself, so the choice survives a restart.
- The bridge passes `tabId: -1` (`vAPI.noTabId`), which is not a real tab.
  uBlock keeps a "behind the scene" page store for it that always exists, so
  no window or tab lookup is needed.
- The frame script treats `vAPI.messaging.UNHANDLED` as a failure, and reads
  the trusted-sites list back (`getWhitelist` through the default handler)
  after every toggle and compares the effective state (the host or a parent
  domain trusted) with the request; a call that found no page store changes
  nothing and shows up as a mismatch. The parent warns on a failed call and the shield's
  `setEnabled` / `setControl` resolve to `false`.
- When uBlock's background starts (`ready` event), the shield re-applies every
  stored ads-off domain.
- `blockedCount` reads the badge: `browserActionFor(extension).action
  .getContextData(tab).badgeText` (the API object keeps the action in
  `.action`). It is `"1"` after the page blocks one request, `""` when none.

Dependencies on uBlock internals: `vAPI.messaging.listeners`, the
`popupPanel` channel, the `toggleNetFiltering` and `getWhitelist` messages.
Version 1.75.2 is pinned in `pins.toml`; `browser_shield.js` fails if an update
changes them.

## Mapping of the three controls

- ads: uBlock's switch for the base domain, and nothing else. Firefox's own
  tracker blocking stays on whatever this control says. (The
  `urlclassifier.trackingSkipURLs` prefs were tried and dropped: they are
  matched against the blocked tracker resource's URL, not the page, so an entry
  for a site exempts that site's resources everywhere and changes nothing on
  the site itself.)
- fingerprinting: an entry `{firstPartyDomain, overrides: "-AllTargets"}` in
  `privacy.fingerprintingProtection.granularOverrides` (and the baseline
  variant), plus `<domain>,*.<domain>` in
  `privacy.resistFingerprinting.exemptedDomains`. With resistFingerprinting on
  (the Strict preset) Firefox reads no override, so the exemption list is the
  only per-site lever there. Other entries in the list are kept.
- cookies: the `trackingprotection` permission on the base-domain principal.

## Coupling

The `trackingprotection` permission is Firefox's content blocking allow list,
its only per-site lever for cookie blocking, and the only thing that lifts
Firefox's tracker blocking for a site. With cookies off, Firefox's tracker and
fingerprinting protection are lifted for that site too, while uBlock keeps
blocking. `state()` reports this: `fingerprinting` and `cookies` read false
whenever the allow list covers the site (an entry on the base domain, or one
Firefox wrote for the page's own principal), and `ads` follows uBlock's actual
state. The shield owns a site's exceptions in Kyber Fox: re-enabling cookies
(or the master switch) removes the entry and any entries for subdomains of the
base domain, including ones Firefox wrote.

## Running uBlock offline under the harness

The harness kills the browser at the first non-local connection, and uBlock
fetches lists from the network on first run. What worked, keeping
`--exclude-extension=uBlock0@raymondhill.net.xpi` on the command line:

1. Set uBlock's managed storage before installing it:
   `Services.policies.wrappedJSObject.setExtensionPolicies({[id]: {adminSettings}})`.
   `EnterprisePolicyTesting.setupPolicyEngineWithJson` does not work here: the
   Kyber `distribution/policies.json` exists, and the alternate policy path is
   only read when that file is absent. `3rdparty` policies are applied before
   add-ons start, so the helper cannot re-apply them anyway.
2. `adminSettings` is a JSON string. `assetsBootstrapLocation` (a key of
   `adminSettings`, not of `advancedSettings`) points at a local `assets.json`
   (`shield_assets.json`, served by the harness) that lists only
   `assets.json` and `public_suffix_list.dat`, both files inside the XPI.
   Without it uBlock fetches the default asset list and `pgl.yoyo.org`.
   `userSettings: {autoUpdate: false}` stops updates,
   `selectedFilterLists: ["user-filters"]` selects the one list left, and
   `userFilters` holds the rule under test.
3. Install the staged XPI as a permanent add-on:
   `AddonManager.getInstallForFile(file)` then `install()`. It is up in about a
   second; poll a page load until the ad script is blocked.

The page and ad script must be HTTPS. With an HTTP ad script on an HTTPS-upgraded
page, Firefox blocks it as mixed content and the test passes for the wrong
reason.

For Task 4's open check: uBlock starts and blocks offline with this setup. The
bundled `filters.txt` lists were not used; the test rule is a user filter.

## Private windows

Nothing global is ever written from a private window: no fingerprinting
override and no uBlock call. uBlock's trusted-sites list and the prefs are
shared with normal windows and are saved to disk. The only lever is the master
switch, as the session-only `trackingprotection-pb` permission written on the
`https://<base domain>` principal with `privateBrowsingId: 1` (read non-exactly,
so a `www.` page and the base domain share it; removed with the last private
window). `state().perControl` is false there and `ads`, `fingerprinting` and
`cookies` mirror `enabled`, except that `state()` still reports global state
written from normal windows, which applies in private windows too: an allow
list entry, a fingerprinting exception, and (if uBlock is allowed in private
windows) a site uBlock does not filter. `setControl` does nothing there.

## IP hosts

A literal IPv4 host is its own site (the host is the key). IPv6 literals are
unsupported.
