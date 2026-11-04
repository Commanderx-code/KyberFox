# Security

## Reporting a problem

Report a vulnerability in Kyber Fox privately, through this repository's
[security advisories](https://github.com/Commanderx-code/KyberFox/security/advisories/new)
(Security tab, "Report a vulnerability"). Please don't open a public issue for
it.

Include what you found, how to reproduce it, and what it affects. Kyber Fox
has one maintainer, so there is no guaranteed response time; you will get a
reply as soon as they can look at it.

## Supported versions

Kyber Fox is in alpha. Only the newest release gets fixes. Older releases are
not patched; update instead.

## Firefox security releases

Kyber Fox follows Firefox. When Mozilla publishes a security release, Kyber Fox
aims to ship the matching build within 72 hours. The upstream watch workflow
opens a pull request with the deadline in its body (see
[docs/upstream-watch.md](docs/upstream-watch.md)). What happens when that target
is missed, and when distribution would be paused, is in
[docs/upstream-updates.md](docs/upstream-updates.md). A problem that exists in
Firefox itself should also be reported to Mozilla.

## Skins never hold a release

The GX-style and One-style skins come from outside projects. If one of them
breaks after an upgrade, the release ships with that skin disabled and the
browser falls back to the Ember theme, rather than waiting for a fix (see
[docs/release.md](docs/release.md) and [docs/themes.md](docs/themes.md)). A
security release is never delayed for a skin.
