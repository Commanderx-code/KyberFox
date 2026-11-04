# Research notes: Firefox base, build docs, licensing, trademarks, Safe Browsing, name

Research date: 2026-11-04. Pages were read through a fetcher that summarizes them, so quotes may be approximate; re-read the linked page before relying on any wording. The Mozilla Trademark Guidelines quotes in [licensing.md](../licensing.md) were re-read verbatim from the page. This document is research, not legal advice. Items marked **[UNVERIFIED]** were not confirmed on a primary page.

---

## 1. Release vs ESR as a fork base

### Current versions and schedule

- The release channel is Firefox 159, beta is 160, nightly is 161, and ESR is shown as "153 / 115". Firefox 160 ships on November 10, 2026. ([whattrainisitnow.com](https://whattrainisitnow.com/))
- Firefox 159.0 shipped October 27, 2026. Firefox 159.0.1 was first offered to release-channel users on November 3, 2026 and includes one security fix (MFSA 2026-123) plus bug fixes. ([release notes 159.0.1](https://www.firefox.com/en-US/firefox/159.0.1/releasenotes/), [calendar](https://whattrainisitnow.com/calendar/), [advisories index](https://www.mozilla.org/en-US/security/advisories/))
- The source tarball for 159.0.1 exists at `firefox-159.0.1.source.tar.xz` (780M, modified 03-Nov-2026) with a `.asc` signature file. ([archive.mozilla.org](https://archive.mozilla.org/pub/firefox/releases/159.0.1/source/))
- The release cadence is now two weeks, not four. Mozilla's own post says Firefox is moving to a two-week release cycle, with Firefox 155 on September 1, 2026 as the first release on the new schedule. ([Mozilla SUMO blog](https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/))
- Mozilla's release process wiki says: "The standard release interval of Firefox is two weeks (not counting urgent patch updates)." It also says the interval is sometimes lengthened for holidays or business needs. ([Release Process wiki](https://wiki.mozilla.org/Release_Management/Release_Process))
- The enterprise docs say "a new major release is made every two weeks." ([Firefox admin docs, channels](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/))
- The calendar shows releases 158.0 on Oct 13, 159.0 on Oct 27, 160 on Nov 10, 161 on Nov 24, 162 on Dec 8, and 163 on Jan 12, 2027 (a longer gap around the holidays). ([calendar](https://whattrainisitnow.com/calendar/))
- The Mozilla post says the change does not mean twice as many features, and that dot releases may still occur when needed, though less often. ([Mozilla SUMO blog](https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/))
- Mozilla's own post does not mention ESR. Secondary reports disagree on ESR impact, so do not rely on them. ([Mozilla SUMO blog](https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/))

### ESR schedule

- Firefox ESR 153 is the current ESR. The enterprise release notes say "Firefox ESR 153 is the new ESR - enterprise changes are no longer backported to Firefox ESR 140." ([Firefox admin docs, release notes](https://firefox-admin-docs.mozilla.org/release-notes/))
- Firefox 153.0 was first offered on July 21, 2026. ([153.0 release notes](https://www.firefox.com/en-US/firefox/153.0/releasenotes/))
- ESR 140 went out of support with Firefox 157; 140.17.0 was its final build. ([Firefox admin docs, release notes](https://firefox-admin-docs.mozilla.org/release-notes/))
- ESR 115 is still being updated for Windows 7/8 and macOS 10.12 to 10.14. The admin release notes state an extension "to August 2026" in the Firefox 150 notes, and an ESR 115.44 advisory exists dated October 27, 2026. The calendar lists 115.x point releases through Firefox 168 (March 23, 2027). ([Firefox admin docs, release notes](https://firefox-admin-docs.mozilla.org/release-notes/), [advisories index](https://www.mozilla.org/en-US/security/advisories/), [calendar](https://whattrainisitnow.com/calendar/)) The March 2027 end date itself came from a search-result summary, not a Mozilla page that was opened. **[UNVERIFIED]**
- The calendar pairs each Firefox release with an ESR 153 point release (159.0 with 153.6, 160 with 153.7) and shows the next ESR line, 175, starting with Firefox 175 on June 29, 2027. The 153 mapping from 143 onward in the tool's notes looked garbled, so read the table directly. ([calendar](https://whattrainisitnow.com/calendar/)) **[UNVERIFIED for dates beyond the next few rows]**
- ESR versions are released annually. ([Firefox admin docs, channels](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/))
- Overlap: a search-result summary of Mozilla's "Firefox ESR release cycle" support page says there is an overlap of at least 12 weeks between a new ESR and the end of life of the previous one, and that ESR point releases come at least every four weeks. The page itself would not load here, so confirm on it. ([Firefox ESR release cycle](https://support.mozilla.org/en-US/kb/firefox-esr-release-cycle)) **[UNVERIFIED]**

### How security fixes reach each

- Release channel: security fixes ship in major releases and in dot releases. Example: 159.0.1 on November 3, 2026 carries a security fix (MFSA 2026-123). ([release notes 159.0.1](https://www.firefox.com/en-US/firefox/159.0.1/releasenotes/), [advisories index](https://www.mozilla.org/en-US/security/advisories/))
- ESR: "each ESR version receives incremental security updates as minor or patch release versions." ([Firefox admin docs, channels](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/))
- Example advisory: MFSA 2026-120, "Security Vulnerabilities fixed in Firefox ESR 153.6", announced October 27, 2026, impact High, lists 145 CVEs. Mozilla now issues an advisory per bug. ([MFSA 2026-120](https://www.mozilla.org/en-US/security/advisories/mfsa2026-120/))
- Backport criteria: security fixes and some major stability fixes that landed on beta, or regressions specific to ESR. Later in an ESR's life the bar narrows to security and high-severity stability fixes. ([ESR Landing Process](https://wiki.mozilla.org/Release_Management/ESR_Landing_Process), [ESR wiki](https://wiki.mozilla.org/ESR_Extended_Support_Release))

### What ESR lacks

- "Other features, such as UI or UX improvements, are excluded from the ESR channel, and are limited to annual ESR releases." ([Firefox admin docs, channels](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/))
- Release builds include "new features, enhancements, and bug fixes." ([Firefox admin docs, channels](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/))
- Mozilla notes that privacy or security changes may need testing "in a more frequent cadence" on the release channel than on ESR. ([Firefox admin docs, channels](https://firefox-admin-docs.mozilla.org/guides/firefox-channels/))
- This research did not find a Mozilla page that lists exactly which user-visible features a given ESR lacks versus release.

### Which forks use which

| Fork | Base | Source |
|---|---|---|
| LibreWolf | Release (stable). The FAQ says "LibreWolf is always built from the latest Firefox stable source." Its source repo is at version 159.0.1-1. | [LibreWolf FAQ](https://librewolf.net/docs/faq/), [LibreWolf source](https://codeberg.org/librewolf/source) |
| Floorp | Release. Floorp 12.21.0 (Oct 27) uses Firefox 159, 12.20.2 uses 158, 12.20.0 uses 157.0.1. | [Floorp releases](https://github.com/Floorp-Projects/Floorp/releases) |
| Zen | Release. README says Release channel is built using Firefox 158.0 (it lagged one version when read). | [Zen README](https://github.com/zen-browser/desktop) |
| Mullvad Browser | Stable stays on ESR. Alpha moved to Rapid Release starting with 16.0a1 (post dated March 26, 2026). | [Mullvad blog](https://mullvad.net/en/blog/mullvad-browser-alpha-moves-to-firefox-rapid-release-and-adds-linux-arm-support) |
| Tor Browser | ESR. Tor Browser 16.0 (Oct 29, 2026) is the first stable release based on Firefox ESR 153, updated to 153.6.0esr. | [Tor Project blog](https://blog.torproject.org/new-release-tor-browser-160/) |

- Mullvad's post gives these reasons for keeping Stable on ESR: the Stable channel is recommended for at-risk users who need a reliably working browser, and Stable expects one major release per year under the new model. ([Mullvad blog](https://mullvad.net/en/blog/mullvad-browser-alpha-moves-to-firefox-rapid-release-and-adds-linux-arm-support))
- Floorp history (ESR from 10.0.0, back to rapid release in 12.1.0, August 2025) is from Wikipedia, a secondary source. ([Wikipedia: Floorp](https://en.wikipedia.org/wiki/Floorp)) **[UNVERIFIED on primary]**

### Trade-offs for a small fork (analysis, not sourced)

These are inferences, not claims from the sources above.

- Rebase work: with a two-week release cadence, tracking release means a new base every two weeks (for example 159.0.1 to 160 on Nov 10, 161 on Nov 24). Patches that touch frequently changing files will break more often. ESR holds one major base for about a year, so patches rebase mostly against point releases, but one large jump is needed each annual ESR change.
- Features: release gets UI and feature work immediately; ESR waits for the annual jump.
- Security: both receive security fixes. ESR backports are limited to what Mozilla chooses to uplift, and the ESR Landing Process describes criteria (security and high-severity stability), so a fork on ESR depends on that selection. Release gets every fix as it lands. A fork must also ship its own build promptly after each Mozilla advisory in either case.
- The Kyber Fox build already pins to the release-channel tarball (159.0.1), which matches LibreWolf's approach.

---

## 2. Official Linux build docs

Page: "Building Firefox On Linux". ([firefox-source-docs: Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))

- Memory: "4GB RAM minimum, 8GB+ recommended." ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- Disk: "At least 30GB of free disk space." ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- OS: a 64-bit Linux install; a supported distribution and a fully up-to-date system are advised. ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- Time as written: "Getting set up can take a while - we need to download a lot of bytes!" and "Even on a fast connection, this can take ten to fifteen minutes of work, spread out over an hour or two." This describes setup and download, not compile time. The page gives no compile-time figure. ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- Python: 3.10 or later. Debian-based: `sudo apt update && sudo apt install curl python3 python3-venv git make`. Fedora: `sudo dnf install python3 git`. A `uv`-based path for newer Python is also shown. ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- Bootstrap as documented: download `bootstrap.py` from `https://raw.githubusercontent.com/mozilla-firefox/firefox/refs/heads/main/python/mozboot/bin/bootstrap.py` and run `python3 bootstrap.py`. This clones the repository (the page says the download is large, "years of Firefox history!") and runs an interactive setup. Then `cd firefox`, `git pull`, `./mach build`. ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- The current page uses git and the GitHub repo `mozilla-firefox/firefox`. It does not mention `mozilla-unified` or Mercurial. ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- Artifact builds: "If you aren't modifying the Firefox backend, then select one of the Artifact Mode options." ([Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html))
- What artifact builds do: they download prebuilt compiled components instead of compiling C++ locally, and they cannot change C, C++, or Rust code. Enable with `ac_add_options --enable-artifact-builds`. Artifact builds are usable for front-end work only, so they are not a way to produce a distributable fork binary. ([Artifact builds](https://firefox-source-docs.mozilla.org/contributing/build/artifact_builds.html))
- Source tarball path: the Linux page does not describe the tarball. The release tarball is at archive.mozilla.org, listed above. ([archive.mozilla.org](https://archive.mozilla.org/pub/firefox/releases/159.0.1/source/))
- LibreWolf documents the tarball path in its README: download and extract the tarball, run `./mach --no-interactive bootstrap --application-choice=browser` once, then `./mach build && ./mach package` (or `./mach run`). ([LibreWolf source README](https://codeberg.org/librewolf/source)) This is a third-party description, not a Mozilla statement that bootstrap supports tarballs.
- Search results mention Bugzilla reports that `mach bootstrap` had problems when run from a tarball (bugs 1687908, 1847288). This research did not open them. **[UNVERIFIED]** ([Bug 1847288](https://bugzilla.mozilla.org/show_bug.cgi?id=1847288))
- Build options page (mozconfig, objdir, parallel compilation) is at [Configuring Build Options](https://firefox-source-docs.mozilla.org/setup/configuring_build_options.html). It does not mention branding flags.

---

## 3. Licensing obligations

### MPL 2.0

All section numbers refer to MPL 2.0. ([MPL 2.0 text](https://www.mozilla.org/en-US/MPL/2.0/))

- Mozilla says its software binaries are made available under the MPL, and that there is "no separate End User License Agreement (EULA)." ([Mozilla EULA page](https://www.mozilla.org/en-US/about/legal/eula/), [Mozilla licensing](https://www.mozilla.org/en-US/foundation/licensing/))
- Executable distribution (3.2): the Covered Software "must also be made available in Source Code Form," and you must tell recipients of the Executable Form how to obtain that source, at a charge no more than the cost of distribution. ([MPL 2.0, 3.2](https://www.mozilla.org/en-US/MPL/2.0/))
- You may license the executable under terms of your choice, provided those terms do not "limit or alter the recipients' rights in the Source Code Form." ([MPL 2.0, 3.2(b)](https://www.mozilla.org/en-US/MPL/2.0/))
- Source form (3.1): source you distribute, including Modifications, must be under the MPL. ([MPL 2.0, 3.1](https://www.mozilla.org/en-US/MPL/2.0/))
- Notices (3.4): "You may not remove or alter the substance of any license notices." ([MPL 2.0, 3.4](https://www.mozilla.org/en-US/MPL/2.0/))
- Larger Work (3.3): you may distribute a Larger Work under terms of your choice if you still comply with the MPL for the Covered Software. ([MPL 2.0, 3.3](https://www.mozilla.org/en-US/MPL/2.0/))
- Trademarks (2.3): the license does not grant rights in the trademarks, service marks, or logos of any Contributor. ([MPL 2.0, 2.3](https://www.mozilla.org/en-US/MPL/2.0/))
- Termination (5.1): rights end automatically on non-compliance, with conditional reinstatement. ([MPL 2.0, 5](https://www.mozilla.org/en-US/MPL/2.0/))
- Mozilla's FAQ says the copyleft is per file: "The copyleft applies to any files containing MPLed code." New files containing no MPL code are not Modifications, even when combined into a Larger Work. ([MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/))
- The FAQ does not say how long source must remain available. ([MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)) The license text should be checked for this. **[UNVERIFIED]**
- Practical reading (an inference, not Mozilla's wording): a fork that patches Firefox files must offer those modified files and tell users where to get them. Publishing the unmodified tarball source plus the patch repository is what LibreWolf does; confirm with counsel that this meets 3.2 for Kyber Fox.
- LibreWolf states its own source is MPL 2.0. ([LibreWolf license page](https://librewolf.net/license-disclaimers/)) This research could not verify which license applies to the patch repository's LICENSE file. **[UNVERIFIED]** ([LibreWolf source](https://codeberg.org/librewolf/source/src/branch/main/LICENSE))

### about:license and other licenses in the tree

- `about:license` is "rendered at build time from the `LICENSES` declarations spread across the tree." The command `./mach licenses` renders the page the current configuration would ship. ([Third-Party Licensing and the SBOM](https://firefox-source-docs.mozilla.org/mozbuild/vendor/licensing.html))
- The build aggregates declarations into `<objdir>/licenses.json`, which both `about:license` and the SBOM read. ([Licensing doc](https://firefox-source-docs.mozilla.org/mozbuild/vendor/licensing.html))
- `mach sbom` gives a machine-readable superset of `about:license`. ([Licensing doc](https://firefox-source-docs.mozilla.org/mozbuild/vendor/licensing.html))
- Search results say the page covers Rust crates and lists licenses such as MPL 2.0, BSD 3-Clause, and Skia. This research could not load `toolkit/content/license.html` to read the actual list or confirm which GPL/LGPL entries exist (several raw URLs returned 404). **[UNVERIFIED]** ([Licensing doc](https://firefox-source-docs.mozilla.org/mozbuild/vendor/licensing.html))
- Practical point: a fork that builds from the tarball with the normal build gets `about:license` generated automatically; any added third-party code needs a `LICENSES` or `LICENSED_UNDER` declaration to appear there. (Inference from the doc above.)

### GPL/LGPL compatibility and Exhibit B

- "Secondary Licenses" in MPL 2.0 means GPL 2.0, LGPL 2.1, AGPL 3.0, or later versions. ([MPL 2.0, definitions](https://www.mozilla.org/en-US/MPL/2.0/))
- Section 3.3 lets a Larger Work that combines Covered Software with Secondary-License material be distributed additionally under the Secondary License. ([MPL 2.0, 3.3](https://www.mozilla.org/en-US/MPL/2.0/))
- The FAQ says that by default the license allows the code to be distributed alongside GPL or LGPL code, and describes the Larger Work route with three conditions, including that the software must not be "Incompatible With Secondary Licenses." ([MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [Revision FAQ](https://www.mozilla.org/en-US/MPL/2.0/Revision-FAQ/))
- Exhibit B notice text: `This Source Code Form is "Incompatible With Secondary Licenses", as defined by the Mozilla Public License, v. 2.0.` ([MPL 2.0, Exhibit B](https://www.mozilla.org/en-US/MPL/2.0/))
- Exhibit A notice: `This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.` ([MPL 2.0, Exhibit A](https://www.mozilla.org/en-US/MPL/2.0/))
- Mozilla's own license policy for new code: new Mozilla projects may use MPL 2.0 or Apache 2.0; GPL is listed as not compatible with MPL 2.0 (except dual-licensed code); LGPL may be allowed for "a clearly-demarcated library" that is dynamically linked. ([Software licensing policy](https://www.mozilla.org/en-US/MPL/license-policy/))
- Note for Kyber Fox patches: if a patch file is derived from LibreWolf (MPL 2.0 per its license page), it must keep MPL terms. ([LibreWolf license page](https://librewolf.net/license-disclaimers/))

---

## 4. Mozilla trademarks and branding

### What the policy says

- Mozilla's Firefox Terms of Use say Firefox is open source and may be used, copied, modified, and distributed if the open source licenses and the Mozilla Trademark Guidelines are followed. ([Firefox Terms of Use](https://www.mozilla.org/en-US/about/legal/terms/firefox/))
- Mozilla's trademark list names Firefox (wordmark and logo), Mozilla, and Thunderbird. It does not say which are registered. ([Trademark list](https://www.mozilla.org/en-US/foundation/trademarks/list/))
- Mozilla says there are "tight restrictions on your ability to use the Mozilla names and logos." ([Mozilla licensing](https://www.mozilla.org/en-US/foundation/licensing/))
- The Trademark Policy's open-source-project guidance, as returned by the fetch tool:
  - A source license "does not give permission to use Mozilla's trademarks."
  - "Don't use Mozilla trademarks in the name of your business, product, service, app, domain name" and do not use any Mozilla trademark "in connection with the user-facing name or branding of your project."
  - "Choose branding, logos, and trademarks that denotes your own unique identity."
  - "Don't modify Mozilla's trademarks, abbreviate them, or combine them with any other symbols, words, or images."
  - "All other uses of a Mozilla trademark require our prior written permission."
  ([Mozilla Trademark Policy](https://www.mozilla.org/en-US/foundation/trademarks/policy/))
- The policy gives this naming example: "please do not name your project, [Something]-fox, Moz-[Something], or [Something]-zilla." ([Mozilla Trademark Policy](https://www.mozilla.org/en-US/foundation/trademarks/policy/)) This bears directly on the name "Kyber Fox"; see the lawyer questions at the end.
- The Distribution Policy covers unaltered copies. It says "You may not add to, remove, or change any part of the software, including the Mozilla trademarks themselves," and that changes require prior written permission before redistributing under any Mozilla trademark. Contact: trademark-permissions@mozilla.com. Examples of changes needing permission include changing the default home page or adding bookmarks. ([Distribution Policy](https://www.mozilla.org/en-US/foundation/trademarks/distribution-policy/))
- The Distribution Policy page as read does not mention `--enable-official-branding`, "Community Edition," or any list of allowed modifications. ([Distribution Policy](https://www.mozilla.org/en-US/foundation/trademarks/distribution-policy/))

### "Based on Firefox"

- The policy text permits: "State in words (not using logos or images) that your project is based on Mozilla open source technology," as long as you include a statement that the project is not officially associated with Mozilla. The suggested form is "[Brand Name] and [Product Name] are not officially associated with Mozilla or its products," shown with equal prominence. ([Mozilla Trademark Policy](https://www.mozilla.org/en-US/foundation/trademarks/policy/), [Trademark FAQ](https://www.mozilla.org/en-US/foundation/trademarks/faq/))
- The policy also allows using Mozilla wordmarks in text "to truthfully refer to and/or link to unmodified Mozilla programs." A modified build is not an unmodified program, so whether "based on Firefox" (as opposed to "based on Mozilla open source technology") is covered is a question for counsel. ([Mozilla Trademark Policy](https://www.mozilla.org/en-US/foundation/trademarks/policy/))
- For comparison, LibreWolf says "The Firefox name is a trademark of the Mozilla Foundation" and "LibreWolf is not affiliated with Mozilla." ([LibreWolf license page](https://librewolf.net/license-disclaimers/))

### Official branding build flag

- The source tree has `browser/branding/` with `aurora`, `nightly`, `official`, `unofficial`, and `docs` directories. ([mozilla-firefox/firefox, browser/branding](https://github.com/mozilla-firefox/firefox/tree/main/browser/branding))
- Per a Mozilla bug: "A default build, without any specific branding option will get branding/unofficial." Nightly gets nightly branding; release, beta, and ESR use official branding. The bug proposes `--enable-official-branding` on non-release branches use nightly branding, and is still open. ([Bug 1427472](https://bugzilla.mozilla.org/show_bug.cgi?id=1427472))
- This research did not find a current official Mozilla page that says "a modified build must not use `--enable-official-branding`." The build docs that were read do not mention the flag. ([Configuring Build Options](https://firefox-source-docs.mozilla.org/setup/configuring_build_options.html), [mozconfigs](https://firefox-source-docs.mozilla.org/build/buildsystem/mozconfigs.html)) The link between that flag and the trademark policy is therefore an inference. **[UNVERIFIED]**
- What a fork must remove, as inferred from the policy text above: the Firefox name and logo in the product name, window titles, installer, desktop files, and update/branding strings; Kyber Fox needs its own icons and names. The `official` brand directory contains the Firefox logos, so a build should use its own branding directory. **[UNVERIFIED as a complete checklist]**

### Hosted services and APIs

- Mozilla Location Service: on March 13, 2024 Mozilla announced it would stop granting new API keys, and that on June 12, 2024 "third party API keys will be removed and the service will only be available for Mozilla's use cases." ([ichnaea issue 2065](https://github.com/mozilla/ichnaea/issues/2065)) A fork cannot rely on it.
- Safe Browsing keys: a search-result summary of Mozilla wiki and Bugzilla pages says official builds ship with a Mozilla key and self-built Firefox gets the placeholder `no-google-api-key`, and that builders obtain their own key from Google and point mozconfig at a key file (`--with-google-safebrowsing-api-keyfile`). This research did not open those pages. **[UNVERIFIED]** ([Bug 882485](https://bugzilla.mozilla.org/show_bug.cgi?id=882485), [Safe Browsing V4 wiki](https://wiki.mozilla.org/Security/Safe_Browsing)) The Mozilla Safe Browsing wiki page itself says Mozilla's key details are internal only. ([Safe Browsing wiki](https://wiki.mozilla.org/Security/Safe_Browsing))
- addons.mozilla.org: the add-on policies page says "All add-ons are subject to these policies, regardless of how they are distributed." It does not (in the part read) address non-Mozilla browsers using AMO. ([Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)) The AMO API docs say the APIs "are not frozen and can change at any time without warning," and link a "Third-Party Usage" page This research could not load. ([AMO API overview](https://mozilla.github.io/addons-server/topics/api/overview.html)) **[UNVERIFIED for fork use]**
- Remote Settings: the docs describe it as fetching settings "kept in sync with Mozilla servers" and show the server `firefox.settings.services.mozilla.com`. No statement about third-party browsers was found. ([Remote Settings docs](https://firefox-source-docs.mozilla.org/services/settings/index.html)) LibreWolf's FAQ lists the GPU blocklist (via Remote Settings) among connections it still makes. ([LibreWolf FAQ](https://librewolf.net/docs/faq/)) **[UNVERIFIED for permission]**
- Update servers (Balrog): the Mozilla wiki page only says it moved to `mozilla-balrog.readthedocs.io`; This research did not read it. ([Balrog wiki](https://wiki.mozilla.org/Balrog)) LibreWolf says it has no auto-update on most platforms and relies on package managers. ([LibreWolf FAQ](https://librewolf.net/docs/faq/)) **[UNVERIFIED]**
- Firefox Sync and Mozilla accounts: the Firefox Terms say "If you want to use certain services like sync, you'll need a Mozilla account," under separate terms. ([Firefox Terms of Use](https://www.mozilla.org/en-US/about/legal/terms/firefox/)) The Services terms (Section 7) say they do not grant rights to Mozilla's copyrights, trade names, trademarks, or service marks, and Mozilla may suspend access at any time. ([Mozilla Accounts terms](https://www.mozilla.org/en-US/about/legal/terms/services/)) No statement for or against modified builds was found. LibreWolf's FAQ describes Sync as usable and notes the older Sync server can be self-hosted. ([LibreWolf FAQ](https://librewolf.net/docs/faq/))
- Push server: LibreWolf's FAQ says it "maintains an open WebSocket towards Mozilla's push server." ([LibreWolf FAQ](https://librewolf.net/docs/faq/))

---

## 5. Google Safe Browsing API terms (own API key)

- Scope: "The Safe Browsing API is for non-commercial use only." For revenue-generating use, Google points to the Web Risk API. ([Safe Browsing home](https://developers.google.com/safe-browsing/))
- The terms say "you may not use the Safe Browsing API for commercial purposes" without a separate agreement and do not define "commercial." ([Safe Browsing terms](https://developers.google.com/safe-browsing/terms))
- Cost and quota: "There is no cost for use of this API." "Developers are allocated a default usage quota upon enabling the Safe Browsing API." The numeric quota is visible only in the Developer Console; more can be requested. ([Usage limits](https://developers.google.com/safe-browsing/v4/usage-limits)) The page gives no per-day number.
- Update API: clients download hashed lists into a local database, and only send a request when a local match is found. "At no point does Google learn about the URLs you are examining," though Google does learn the hash prefixes checked. ([Update API](https://developers.google.com/safe-browsing/v4/update-api))
- Request frequency: first request after startup or wake must be at a random 0 to 1 minute delay. If a response sets `minimumWaitDuration`, clients cannot update more often. After any non-200 status, back-off is `MIN((2^(N-1) * 15 minutes) * (RAND + 1), 24 hours)`. ([Request frequency](https://developers.google.com/safe-browsing/v4/request-frequency)) The tool rendered the formula as "2N-1"; confirm the exponent on the page.
- Terms Section 4: do not warn or block on a Google-listed URL unless your app received updated information "within the past thirty minutes." ([Safe Browsing terms](https://developers.google.com/safe-browsing/terms))
- Terms Sections 2 and 3: provide attribution and conspicuous notice that reliability and accuracy cannot be guaranteed; do not use the Google attribution for warnings from other sources. ([Safe Browsing terms](https://developers.google.com/safe-browsing/terms))
- Warning requirements: use qualifying terms like "suspected" or "possible," link to a learn-more resource, and for Google-sourced warnings include "Advisory provided by Google." ([Usage limits](https://developers.google.com/safe-browsing/v4/usage-limits))
- Terms Section 5: Google may use URLs and data sent through the SearchUrls method to improve its services and may share them with third parties. This applies to the Lookup-style method; the Update API sends only hash prefixes. ([Safe Browsing terms](https://developers.google.com/safe-browsing/terms), [Update API](https://developers.google.com/safe-browsing/v4/update-api))
- Versions: the Safe Browsing home lists v5 and v4. A search summary says the v4 overview carries a deprecation warning, with a migration guide to v5 and no sunset date found. ([Safe Browsing home](https://developers.google.com/safe-browsing/), [Migration From V4](https://developers.google.com/safe-browsing/reference/Migration.From.V4)) Firefox's own client uses the v4-style protocol; This research did not verify whether Firefox supports v5. **[UNVERIFIED]**
- The terms page points to the Google APIs Terms of Service as the governing terms; This research did not read that document. ([Safe Browsing terms](https://developers.google.com/safe-browsing/terms))

---

## 6. Name question: "Kyber"

No legal conclusions. This lists what sources show and what to ask a lawyer.

### Sources found

- The USPTO TESS replacement search (`tmsearch.uspto.gov`) is a script-driven page; the fetch returned only a "Trademark search" heading, so This research could not query it. ([USPTO trademark search](https://tmsearch.uspto.gov/search/search-results?query=kyber)) No primary USPTO record was read.
- Third-party aggregators list several US filings for KYBER, none confirmed as a browser or a Lucasfilm mark. All of these are secondary and must be checked on USPTO TSDR:
  - Sg Gaming, Inc., serial 88816774, casino gaming system with recognition software and hardware, listed as pending ([uspto.report](https://uspto.report/TM/88816774)).
  - Lam Research Corporation, serial 88093074, registration 6014457, machinery ([Trademarkia](https://www.trademarkia.com/kyber-88093074)).
  - Patriot Research Center, LLC, serial 90736174 ([uspto.report](https://uspto.report/TM/90736174)); Dow AgroSciences LLC, serial 90066325 ([uspto.report](https://uspto.report/TM/90066325)); Kyber LLC (CRYPTOYS), serial 90380132 ([uspto.report](https://uspto.report/TM/90380132)).
  - Companyons, Inc., serial 86655742, and Kyber Data Science LLC, serial 97483451 were listed with no goods description, so they are not classified here. **[UNVERIFIED]**
- A search found no Lucasfilm filing for KYBER or KYBER CRYSTAL. Two Lucasfilm Ltd. LLC filings (serials 99277131 and 99277145, filed July 10, 2025) use a STAR WARS pseudo mark with stylized characters in classes 21 and 25; they are not KYBER. ([serial 99277131](https://trademarkregistration.app/Trademark/Details/99277131), [serial 99277145](https://trademarkregistration.app/Trademark/Details/99277145)) The absence of a Lucasfilm KYBER record is only from an aggregator search, not from USPTO. **[UNVERIFIED]**
- JEDI: aggregators list multiple Lucasfilm-owned JEDI registrations, including serial 76010999 (Class 9, registered June 2004, listed live), serial 76010998 (Class 41), serial 78488803 (Classes 16 and 25, registered May 2010), and serial 76030972 (toys, registered July 2002). Owner names vary between entries. ([Markinton 76010999](https://markinton.com/trademark/jedi-76010999), [TrademarkDir 76010998](https://trademarkdir.com/trademark/jedi-76010998), [Markinton 78488803](https://markinton.com/trademark/jedi-78488803), [DocketAlarm 76030972](https://www.docketalarm.com/trademarks/76030972/JEDI)) Status and owner need checking on USPTO TSDR. **[UNVERIFIED]**
- Lucasfilm has sued over JEDI-related names, per news reports. ([Business Insurance](https://www.businessinsurance.com/lucas-returns-to-court-in-fight-for-jedi-brand/)) Secondary source. **[UNVERIFIED]**
- The kyber crystal as a Star Wars term: the official Star Wars databank page returned HTTP 403, so This research could not read it. ([Star Wars Databank](https://starwars.com/databank/lightsaber-crystal)) **[UNVERIFIED]**
- NIST: FIPS 203 (published August 13, 2024) specifies ML-KEM. ([FIPS 203](https://csrc.nist.gov/pubs/fips/203/final)) NIST's announcement says FIPS 203 is "derived from the CRYSTALS-KYBER submission." ([NIST news](https://csrc.nist.gov/news/2024/postquantum-cryptography-fips-approved))

### Questions for a lawyer

1. Does a search of USPTO TSDR, EUIPO, and WIPO show live KYBER marks in software, security, or browser classes (9, 42, 38), and who owns them?
2. Does the use of a term from Lucasfilm's fiction (kyber crystal) in a software product name raise any risk, given Lucasfilm's JEDI and STAR WARS enforcement?
3. Does the Mozilla guidance "do not name your project [Something]-fox" apply to "Kyber Fox," and would a name without "Fox" be safer?
4. Is a descriptive statement "based on Firefox" acceptable for a modified build, or should it read "based on Mozilla open source technology," with the non-affiliation statement?
5. Does the shared name with the CRYSTALS-Kyber algorithm cause consumer confusion, especially if the browser ever advertises post-quantum key exchange?
6. Does the MPL 2.0 obligation to offer source (3.2) require anything beyond a public patch repository plus the upstream tarball link?
7. Is it acceptable to ship a build that contacts Mozilla-hosted services (Remote Settings, push, add-on updates, Sync) under a different brand, or is written permission needed?
8. Should the project avoid `--enable-official-branding` and the `official` branding directory entirely, and is a written confirmation from Mozilla worth requesting at trademark-permissions@mozilla.com?
9. Does use of the Safe Browsing API in a distributed, free browser stay within Google's "non-commercial" limit if the project accepts donations or sponsors?

---

## Sources

- https://whattrainisitnow.com/
- https://whattrainisitnow.com/calendar/
- https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/
- https://wiki.mozilla.org/Release_Management/Release_Process
- https://wiki.mozilla.org/Release_Management/ESR_Landing_Process
- https://wiki.mozilla.org/ESR_Extended_Support_Release
- https://firefox-admin-docs.mozilla.org/guides/firefox-channels/
- https://firefox-admin-docs.mozilla.org/release-notes/
- https://support.mozilla.org/en-US/kb/firefox-esr-release-cycle (did not load)
- https://www.firefox.com/en-US/firefox/159.0.1/releasenotes/
- https://www.firefox.com/en-US/firefox/153.0/releasenotes/
- https://www.mozilla.org/en-US/security/advisories/
- https://www.mozilla.org/en-US/security/advisories/mfsa2026-120/
- https://archive.mozilla.org/pub/firefox/releases/159.0.1/source/
- https://librewolf.net/docs/faq/
- https://librewolf.net/license-disclaimers/
- https://codeberg.org/librewolf/source
- https://github.com/Floorp-Projects/Floorp/releases
- https://github.com/zen-browser/desktop
- https://mullvad.net/en/blog/mullvad-browser-alpha-moves-to-firefox-rapid-release-and-adds-linux-arm-support
- https://blog.torproject.org/new-release-tor-browser-160/
- https://en.wikipedia.org/wiki/Floorp (secondary)
- https://firefox-source-docs.mozilla.org/setup/linux_build.html
- https://firefox-source-docs.mozilla.org/contributing/build/artifact_builds.html
- https://firefox-source-docs.mozilla.org/setup/configuring_build_options.html
- https://firefox-source-docs.mozilla.org/build/buildsystem/mozconfigs.html
- https://firefox-source-docs.mozilla.org/mozbuild/vendor/licensing.html
- https://firefox-source-docs.mozilla.org/services/settings/index.html
- https://www.mozilla.org/en-US/MPL/2.0/
- https://www.mozilla.org/en-US/MPL/2.0/FAQ/
- https://www.mozilla.org/en-US/MPL/2.0/Revision-FAQ/
- https://www.mozilla.org/en-US/MPL/license-policy/
- https://www.mozilla.org/en-US/about/legal/eula/
- https://www.mozilla.org/en-US/foundation/licensing/
- https://www.mozilla.org/en-US/about/legal/terms/firefox/
- https://www.mozilla.org/en-US/about/legal/terms/services/
- https://www.mozilla.org/en-US/foundation/trademarks/policy/
- https://www.mozilla.org/en-US/foundation/trademarks/faq/
- https://www.mozilla.org/en-US/foundation/trademarks/distribution-policy/
- https://www.mozilla.org/en-US/foundation/trademarks/list/
- https://github.com/mozilla-firefox/firefox/tree/main/browser/branding
- https://bugzilla.mozilla.org/show_bug.cgi?id=1427472
- https://bugzilla.mozilla.org/show_bug.cgi?id=882485
- https://bugzilla.mozilla.org/show_bug.cgi?id=1847288
- https://github.com/mozilla/ichnaea/issues/2065
- https://wiki.mozilla.org/Security/Safe_Browsing
- https://wiki.mozilla.org/Balrog
- https://extensionworkshop.com/documentation/publish/add-on-policies/
- https://mozilla.github.io/addons-server/topics/api/overview.html
- https://developers.google.com/safe-browsing/
- https://developers.google.com/safe-browsing/terms
- https://developers.google.com/safe-browsing/v4/usage-limits
- https://developers.google.com/safe-browsing/v4/update-api
- https://developers.google.com/safe-browsing/v4/request-frequency
- https://developers.google.com/safe-browsing/reference/Migration.From.V4
- https://csrc.nist.gov/pubs/fips/203/final
- https://csrc.nist.gov/news/2024/postquantum-cryptography-fips-approved
- Secondary trademark aggregators (not primary): uspto.report, trademarkia.com, trademarkregistration.app, markinton.com, trademarkdir.com, docketalarm.com, businessinsurance.com

---

## Unverified / needs review

1. ESR overlap of at least 12 weeks and ESR point releases at least every four weeks: from a search-result summary; the SUMO ESR page did not load.
2. ESR 115 end date of March 2027: search-result summary only; the admin release notes that were read say August 2026 in an older note, while an ESR 115.44 advisory is dated October 27, 2026 and the calendar lists 115.x through March 2027.
3. Calendar rows far in the future (ESR 175 start date June 29, 2027, and ESR 153 mappings) came through a summarizing tool; re-read the table.
4. Floorp's ESR-versus-rapid history (Wikipedia only); current Floorp base (release) is from GitHub release commit titles.
5. Zen's README showed Firefox 158.0 while release was 159; its channel naming may lag.
6. Whether `mach bootstrap` fully supports a source tarball (LibreWolf's README does it; Mozilla's Linux page does not describe it).
7. The exact contents and license list of `about:license` (`toolkit/content/license.html` was not readable), including which GPL/LGPL components exist.
8. How long MPL source must remain available (FAQ is silent; license text not checked for this).
9. License of LibreWolf's patch repository and whether each LibreWolf patch Kyber Fox uses is MPL 2.0.
10. Any Mozilla statement tying `--enable-official-branding` to the trademark policy; the Distribution Policy as read does not mention it.
11. Mozilla policy on forks using Remote Settings, AMO, Balrog update servers, push, Sync, and accounts: no primary statement found either way.
12. Safe Browsing key behavior in self-built Firefox (Bug 882485 and wiki): not opened directly; Safe Browsing v5 support in Firefox and the v4 sunset date; the Google APIs Terms of Service were not read; "commercial" is undefined in the terms.
13. Every trademark record in item 6: USPTO was inaccessible; aggregator data may be stale or wrong. Kyber Data Science LLC and Companyons, Inc. goods are unknown.
14. Star Wars Databank page for the kyber crystal returned 403.
