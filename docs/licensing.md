# Licensing and trademarks

This page lists what Kyber Fox has to do because of the licenses and
trademarks of what it uses, and the questions that are still open. It is a
working summary for the maintainer, **not legal advice**. Where it says
"question", the answer needs someone qualified, and Kyber Fox does not act as
if it were settled. Fuller notes with every source are in
[research/2026-11-04-base-and-licensing.md](research/2026-11-04-base-and-licensing.md).

## Firefox source code: MPL 2.0

Firefox is under the [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/).
The parts that matter for Kyber Fox:

- **Source for binaries (section 3.2).** Anyone who receives a Kyber Fox binary
  must be able to get the source of the MPL files in it, and must be told how.
  Kyber Fox meets this by publishing this repository (patches, overlay,
  settings, tools) and pinning the exact Firefox tarball by version and hash in
  `pins.toml`. Question: is "public patch repository plus the upstream tarball"
  enough under 3.2, or should each release also attach the assembled source?
- **Modified files stay MPL (section 3.1).** Patched Firefox files, and files
  derived from LibreWolf's MPL patches, stay under the MPL. The copyleft is per
  file ([MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)).
- **Keep notices (section 3.4).** License headers in Firefox and LibreWolf
  files are not removed or changed.
- **No trademark rights (section 2.3).** The MPL does not grant rights to
  Mozilla's names or logos; see Trademarks below.

Kyber Fox's own code is also MPL 2.0 ([LICENSE](../LICENSE)).

## Other licenses Kyber Fox ships

| Component | License | How it is handled |
|---|---|---|
| Firefox's third-party code | Various; listed on `about:license`, which the build generates from `LICENSES` declarations in the tree ([Mozilla docs](https://firefox-source-docs.mozilla.org/mozbuild/vendor/licensing.html)) | Shipped as Firefox ships it |
| LibreWolf patches and settings | MPL 2.0 ([LibreWolf](https://librewolf.net/license-disclaimers/)) | Notices kept; credited in the README |
| uBlock Origin | GPL-3.0 | Shipped unmodified as a separate extension, not combined with MPL code; license and source link on `about:license` |
| firefox-gx, firefox-one, starry-fox skins | MPL 2.0 | Vendored at pinned commits; see [themes/NOTICES.md](../themes/NOTICES.md) |
| Catppuccin and Tokyo Night palettes | MIT | Credited in themes/NOTICES.md |
| Kyber Fox logo | Owned by the maintainer | In `branding/` |

Questions:

- Which LibreWolf patches Kyber Fox keeps carry MPL headers, and what license
  LibreWolf's patch repository states as a whole.
- Before any filter list is bundled inside the binary (not fetched at runtime,
  as uBlock Origin does today), check the list's license: EasyList is GPLv3 or
  CC BY-SA 3.0, uBlock's lists are GPL-3.0. See
  [content-blocking-research.md](content-blocking-research.md).

## Trademarks

Mozilla's [Trademark Guidelines](https://www.mozilla.org/en-US/foundation/trademarks/policy/)
apply to forks. Under "Open Source Project Guidelines", a project built on
Mozilla code **must not**:

- "Use any Mozilla trademark in connection with the user-facing name or branding of your project."
- "Use any Mozilla trademark or any part of any Mozilla trademark to incorrectly suggest or give the impression your software is actually published by, affiliated with, or endorsed by Mozilla. For example, please do not name your project, [Something]-fox, Moz-[Something], or [Something]-zilla."

A project **may** "State in words (not using logos or images) that your project
is based on Mozilla open source technology, if that is true, as long as you
also include a statement that your project is not officially associated with
Mozilla or its products", with the statement shown "equally prominently":
"[Brand Name] and [Product Name] are not officially associated with Mozilla or
its products."

What Kyber Fox does today:

- Its own branding directory (`browser/branding/kyberfox`), never Mozilla's
  `official` branding, with its own logo, names and icons.
- No Firefox or Mozilla logos used as branding.
- The README credits Firefox and says "Kyber Fox is not made or endorsed by
  Mozilla."

Questions, most important first:

1. **The name.** Does "Kyber Fox" fall under the "[Something]-fox" example?
   The example sits under the rule about suggesting Mozilla made or endorsed a
   project. Kyber Fox is two words, uses its own logo and says it is not
   Mozilla's, but the guideline names this pattern. If the answer is unclear,
   renaming before a public release is far cheaper than after.
2. **Describing the base.** The README and docs say "a Firefox fork" and "based
   on Firefox". The guideline's permitted wording is "based on Mozilla open
   source technology" plus the non-affiliation sentence above. Should the
   public wording change to match it?
3. **Mozilla services.** Kyber Fox contacts Mozilla's Remote Settings (security
   lists), add-on blocklist and addons.mozilla.org, like LibreWolf. No primary
   source was found that either allows or forbids this for forks. Is written
   permission needed? The contact for trademark permission is
   trademark-permissions@mozilla.com.

### Name and theme names

- "Kyber" is also the Star Wars term "kyber crystal" (Lucasfilm) and the name
  of the post-quantum algorithm CRYSTALS-Kyber, which NIST standardized as
  ML-KEM in FIPS 203 ([NIST](https://csrc.nist.gov/news/2024/postquantum-cryptography-fips-approved)).
  Third-party aggregator sites list other companies' KYBER trademark filings in
  unrelated classes; none was confirmed on the USPTO site, which could not be
  queried. Question: a proper search in USPTO, EUIPO and WIPO, in the software
  classes.
- "Jedi" is a Lucasfilm trademark according to aggregator sites (not confirmed
  on USPTO). Until that is checked, no theme or feature is named "Jedi" or with
  other Star Wars terms; a Jedi-inspired palette gets a neutral name.
- Brave, Opera and other browsers' names and logos are not used as branding.
  The shield is described as "in the style of Brave Shields" in design notes
  only.

## Hosted services and API terms

| Service | Status | Notes |
|---|---|---|
| Google Safe Browsing | Kyber Fox's own API key, set at build time | Google's terms say the API is "for non-commercial use only" and do not define commercial ([terms](https://developers.google.com/safe-browsing/terms)). Question: does that still hold if the project ever takes donations or sponsors? The terms also set attribution and warning-wording rules, and a 30-minute freshness limit; Firefox's built-in client is assumed to follow them, which has not been checked against Kyber Fox's build. |
| Mozilla Location Service | Not used | Mozilla removed third-party API keys on 2024-06-12 ([announcement](https://github.com/mozilla/ichnaea/issues/2065)). Kyber Fox uses BeaconDB. |
| Mozilla Remote Settings, add-on blocklist, addons.mozilla.org | Used | See question 3 above |
| Mozilla accounts, Firefox Sync, Mozilla push | Turned off | Not used by Kyber Fox |
| Firefox update servers | Not used | Kyber Fox has its own update manifest and signing key |

## Open questions for a lawyer

1. Is "Kyber Fox" acceptable under Mozilla's "[Something]-fox" guidance, or should the product be renamed before a public release?
2. Are there live KYBER marks in software, security or browser classes, and does using a Star Wars term in a product name carry risk?
3. Is "based on Firefox" acceptable for a modified build, or should the wording be "based on Mozilla open source technology"?
4. Does section 3.2 of the MPL need more than the public repository plus the pinned upstream tarball?
5. May a rebranded build use Mozilla-hosted services (Remote Settings, add-on blocklist, addons.mozilla.org), or is written permission needed?
6. Does Safe Browsing use stay "non-commercial" if the project takes donations?
