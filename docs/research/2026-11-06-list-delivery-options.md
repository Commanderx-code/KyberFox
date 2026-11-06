# How filter lists could reach Kyber Fox's built-in blocker

Date: 2026-11-06. Status: **decided on 2026-11-06: option A now, option B later** (see [Decision](#decision)). Roadmap item: "Decide how lists reach users" under [built-in blocking in the style of Brave Shields](../../ROADMAP.md#built-in-blocking-in-the-style-of-brave-shields). Background: [content-blocking-research.md](../content-blocking-research.md) and the [2026-11-04 experiment](2026-11-04-content-classifier-experiment.md).

## Where things stand

- The 2026-11-04 experiment found that Firefox's built-in engine (the Content Classifier, a fork of Brave's adblock-rust) blocks far less than uBlock Origin with the same lists, and adds nothing measurable next to it. Its recommendation: do not build a list channel or the shield wiring until the engine gains first-party or cosmetic blocking.
- Upstream since then (Firefox `main`, checked 2026-11-06):
  - Bug 2053164 (2026-11-02) makes the Content Classifier the tracking protection engine on desktop Nightly, fed by Mozilla's own tracking lists. Release builds do not have this yet.
  - Bug 2074019 (2026-10-06) classifies first-party requests in the annotate pass only; first-party requests are still not blocked.
  - No cosmetic filtering or scriptlets in the engine.

  So the condition the experiment set is not met yet.
- Kyber Fox already allows Mozilla's `main/content-classifier-lists` Remote Settings collection (`kyberfox.services.settings.allowedCollections` in `settings/kyberfox.cfg`). When Mozilla turns the engine on in release builds, Kyber Fox gets Mozilla's lists for it with no change.

## The three options

### A. Mozilla's collection (`content-classifier-lists`)

- **What it is:** the engine's built-in channel. Remote Settings syncs it, checks each attachment's SHA-256 hash and size, and verifies the collection's content signature. A packaged dump is the fallback.
- **Lists:** Mozilla chooses them. Today that means its tracking protection lists, not EasyList or uBlock Origin's lists. Kyber Fox cannot add lists to it.
- **Work:** none; it is already allowed.
- **Network:** Mozilla's Remote Settings servers, which Kyber Fox already contacts for security data ([network-audit.md](../network-audit.md)).
- **Licensing:** Mozilla publishes and distributes the lists; Kyber Fox ships no list files.
- **Weakness:** the blocker can be no stronger than Mozilla's tracking protection, which Kyber Fox already has through Enhanced Tracking Protection.

### B. A Kyber Fox signed list service

- **What it is:** a scheduled CI job fetches the chosen lists, checks them, signs them with a Kyber Fox key, and publishes them (GitHub Pages or the project's VPS). The browser downloads from that one host and refuses anything with a bad signature.
- **Lists:** any, for example EasyList, EasyPrivacy and uBlock Origin's filters.
- **Work:** the largest of the three:
  - the CI job and hosting;
  - a new signing key with an offline backup, like the update keys;
  - browser code that downloads and checks the lists. The engine's only other way in, the `test_list_urls` prefs, is labeled test-only. The alternative is a patch that points the Remote Settings client at a Kyber Fox collection, which also needs a Remote Settings-compatible server.
- **Network:** one Kyber Fox host instead of several list hosts, and the browser holds a copy if the host is down.
- **Licensing:** Kyber Fox would redistribute the lists. EasyList and EasyPrivacy are GPL-3.0-or-later or CC BY-SA 3.0+, and uBlock Origin's lists are GPL-3.0. Whether redistributing them this way next to MPL-2.0 code needs anything beyond attribution and the license texts is **not settled**; it is question 7 for a lawyer in [licensing.md](../licensing.md#open-questions-for-a-lawyer).
- **Running cost:** GitHub Pages costs nothing. A list update pushed every 12 to 24 hours to every user is light next to the browser's own updates.

### C. Download at runtime from the list hosts

- **What it is:** the browser fetches each list from its publisher (`easylist.to`, `ublockorigin.github.io`), as uBlock Origin does today.
- **Lists:** any public list.
- **Work:** medium: download, cache and fallback code, but no server or key.
- **Integrity:** only HTTPS. The lists are not signed, so a compromised list host could serve any rules. Rules can block or allow requests; the engine treats them as data, not code.
- **Network:** the browser contacts each list host directly. uBlock Origin already downloads the same lists, so with uBlock Origin enabled each list would be fetched twice.
- **Licensing:** Kyber Fox ships no list files; this is how uBlock Origin and Brave work. That this avoids the redistribution question is a common reading, **not a settled one**.

## Comparison

| | A. Mozilla's collection | B. Kyber Fox service | C. List hosts at runtime |
|---|---|---|---|
| Choice of lists | Mozilla's only | Any | Any |
| Signed | Yes (Mozilla) | Yes (Kyber Fox) | No, HTTPS only |
| Work | None | Large | Medium |
| New key to look after | No | Yes | No |
| Hosts contacted | Mozilla (already) | One Kyber Fox host | Each list host |
| Kyber Fox redistributes lists | No | Yes | No |
| Stronger than today's protection | No | Only once the engine improves | Only once the engine improves |

## Recommendation

1. Keep option A as it is now: the collection stays allowed, so Mozilla's engine work reaches Kyber Fox for free.
2. Build nothing for B or C yet. With network-only, third-party-only blocking, any list channel only feeds an engine that adds nothing next to uBlock Origin.
3. When the engine gains first-party or cosmetic blocking, rerun the experiment. If it then approaches uBlock Origin, choose B: signed lists from one host fit the way Kyber Fox already signs its updates. Settle the list licensing question first.
4. Recheck upstream on each Firefox major update; the upstream-watch pull request is the natural moment.

## Decision

2026-11-06, by the owner: option A for now, option B later. Mozilla's
`content-classifier-lists` collection stays allowed and nothing is built for B
or C yet. B, a Kyber Fox signed list service, is built once the engine gains
first-party or cosmetic blocking and a rerun of the experiment shows it is
worth it, after licensing question 7 is answered. C is not planned.
