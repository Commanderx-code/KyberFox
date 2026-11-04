# Experiment: Firefox's built-in blocking engine with uBlock Origin's lists

Date: 2026-11-04. Build: Kyber Fox 159.0.1-2 (the installed Arch package), headless, on the owner's laptop. This is the first step of [built-in blocking in the style of Brave Shields](../../ROADMAP.md#built-in-blocking-in-the-style-of-brave-shields), proposed in [content-blocking-research.md](../content-blocking-research.md#6-proposal-for-discussion-not-a-decision). It ran on throwaway development profiles only; no release build changed.

## Question

Firefox 159 contains the Content Classifier, a fork of Brave's adblock-rust engine, off by default. Given the same filter lists that uBlock Origin uses, how much does it block, how fast is it, and what breaks?

## Method

- Engine on: `privacy.trackingprotection.content.protection.enabled` true, engine `test_block`, and `privacy.trackingprotection.content.protection.test_list_urls` pointing at local copies of EasyList, EasyPrivacy, uBlock filters and uBlock filters – Privacy (downloaded 2026-11-04; about 149,000 lines, 4.1 MB), served from `127.0.0.1`.
- Four setups, each with a fresh profile and Kyber Fox's shipped tracking protection (Strict, third-party cookies blocked):

  | Setup | uBlock Origin | Built-in engine |
  |---|---|---|
  | none | disabled | off |
  | ubo | enabled (as shipped) | off |
  | engine | disabled | on |
  | both | enabled | on |

- 20 sites (news, shopping, video; [tools/experiments/content_classifier_sites.txt](../../tools/experiments/content_classifier_sites.txt)), each loaded once per setup in two rounds, cache off, 4 seconds after load before measuring. Driver: Marionette, script [tools/experiments/content_classifier_run.py](../../tools/experiments/content_classifier_run.py).
- Per page: load event time, number of requests and third-party requests (Resource Timing), requests in the content blocking log, and a screenshot.
- Amazon, Forbes and IMDb answered with bot checks in every setup and Wikipedia carries no ads, so the totals below use the other 16 sites.

## Results

| | none | ubo | engine | both |
|---|---|---|---|---|
| Third-party requests, total over 16 sites (median of 2 rounds) | 1,432 | 1,040 | 1,344 | 1,029 |
| Change against none | | −27% | −6% | −28% |
| Sites where third-party requests fell by 10 or more | | 9 of 16 | 7 of 16 | 9 of 16 |
| Median page load time | 1.55 s | 1.51 s | 1.49 s | 1.48 s |
| List load time | | | 0.17 s | 0.17 s |
| Engine memory (`explicit/content-classifier`) | | | 6.7 MB | 6.7 MB |
| Page errors | 0 | 0 | 0 | 0 |

Per site, the engine matched uBlock Origin on weather.com, speedtest.net, ebay.com, yahoo.com and washingtonpost.com. It blocked little or nothing extra on cnn.com (179 third-party requests, against 26 with uBlock Origin), dailymail.co.uk (88 against 28) and foxnews.com (103 against 55).

Turning the engine on next to uBlock Origin changed almost nothing (1,040 against 1,029 third-party requests).

Screenshots showed no broken page in any setup. With the engine alone, ad slots stay on the page as empty boxes (for example on weather.com), because the engine does not hide elements.

## Reading the results

- The engine is cheap: the four lists load in under 0.2 s and take under 7 MB. Speed and memory are not the obstacle.
- It is far weaker than uBlock Origin with the same lists. Two reasons follow from the code and the lists; neither was measured on its own:
  - The `test_block` feature only checks third-party requests (`IsThirdPartyUnlessAnnotating` in `ContentClassifierService.cpp`). Sites that load their ad code from their own domain, as cnn.com does, start the ad cascade before any third-party rule can stop it.
  - The engine handles network rules only. uBlock Origin also applies cosmetic filters, scriptlets and redirects, which stop ad scripts from running at all.
- Next to uBlock Origin it adds nothing measurable, so it is not useful as a second layer today.

## Limits of this experiment

- Live sites change between loads; two rounds per setup is a small sample. nytimes.com served a much lighter page in one "none" load, which makes the "none" total lower than it should be.
- Load times were noisy. uBlock Origin setups had a few very slow loads (foxnews.com up to 16 s, dailymail.co.uk 14 s) that were not explained and are why medians are given, not totals.
- Requests blocked by uBlock Origin do not appear in Firefox's content blocking log, so blocking is compared through the third-party requests that were made, not through block counts.
- Headless only, one machine, one network, US region. Logged-in pages, video playback and checkout flows were not tried.

## Conclusion and next step

The in-tree engine works and is fast, but with uBlock Origin's lists it blocks a fraction of what uBlock Origin does, and it adds nothing next to it. uBlock Origin stays the blocker in Kyber Fox.

Building on the engine would need, at least: first-party blocking, cosmetic filtering and scriptlets (the roadmap's largest item), and a list delivery channel. Recommendation: do not start the list channel or the shield wiring yet. Repeat this experiment when Firefox's engine gains first-party or cosmetic support, or on each major Firefox update with the same script.
