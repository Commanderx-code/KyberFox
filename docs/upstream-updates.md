# Upstream updates and security response

Kyber Fox's first duty is to ship Firefox security fixes quickly. This page is
the process from "Mozilla published a release" to "users have it". The
mechanics of the automation are in [upstream-watch.md](upstream-watch.md), and
cutting a release is in [release.md](release.md).

## What is watched

| Source | How | Why |
|---|---|---|
| Firefox releases, from Mozilla's product-details feed | `upstream-watch.yml`, every 3 hours | Opens a pull request that bumps the pinned Firefox version |
| [Mozilla Foundation Security Advisories](https://www.mozilla.org/en-US/security/advisories/) | Read by the owner for each release the watch flags | Severity of the fixes, and whether any are exploited in the wild |
| LibreWolf tags | Reported by the upstream watch | New LibreWolf patches must be classified as kept or dropped |
| uBlock Origin releases | Reported by the upstream watch | The shield talks to uBlock's internals, so a bump runs the shield tests |

## Target

A Firefox security release ships as Kyber Fox within **72 hours** of Mozilla
publishing it. A new major Firefox version (every two weeks since Firefox 155)
also carries security fixes, so it gets the same target.

## Steps

1. **Notice.** The upstream watch opens `Bump Firefox to <version>` with the
   deadline in the body and a list of the patches that no longer apply.
2. **Triage.** Read the advisory. If it lists a fix exploited in the wild,
   treat it as urgent: start the release as soon as the tree assembles.
3. **Repair the patch queue.** Kyber Fox does not keep a long-lived fork
   branch. It reapplies three layers to each new Firefox tarball, in order:
   LibreWolf's kept patches, Kyber Fox's patches in `patches/kyber/series.txt`,
   then the files in `overlay/` and `settings/`. A patch that fails is
   regenerated against the new Firefox source. If a Kyber Fox feature cannot be
   fixed in time, it ships disabled (for skins, through
   `set-disabled-skin`), and the release goes out anyway.
4. **Merge and release.** Merge the pull request, then run the release
   workflow. Every gate runs: builds, the forbidden-code check, the front-end
   tests, the install smoke tests, and the signed update test.
5. **Approve.** The owner approves the publish step. Windows installs update
   themselves; Arch and Garuda users get it with `pacman -Syu`.
6. **Announce.** The GitHub Release notes say which Firefox version it is and
   link Mozilla's advisory.

## Keeping the patch queue cheap

- Prefer a pref, a policy, or an overlay file to a patch.
- Keep each patch to one purpose, named for what it does.
- New LibreWolf patches are either kept or dropped with a reason in
  `patches/librewolf-keep.txt` or `patches/librewolf-drop.txt`; an unclassified
  patch stops the assembly.
- A Kyber Fox feature that needs large changes to Firefox code needs a strong
  reason, because every Firefox update reopens it.

## When the deadline is missed

If a security release cannot ship within 72 hours:

1. Say so in a GitHub issue pinned to the repository, with the Firefox version,
   the advisory link, what is blocking, and the expected date.
2. Tell friends directly that until the fix ships, stock Firefox is the safer
   choice for sensitive browsing.
3. Ship as soon as the fix is ready, even if a Kyber Fox feature has to be
   disabled to do it.

## When to pause distribution

Stop offering new installs (take the install links out of the README and the
docs) if Kyber Fox falls more than one Firefox security release behind, or if
the signing keys or the build pipeline cannot be trusted. Existing users are
told directly. Distribution resumes when a current, signed release ships.

## What users see

- Windows: the built-in updater, checking Kyber Fox's own update manifest. The
  updater accepts only updates signed with Kyber Fox's own key; see
  [update-signing.md](update-signing.md).
- Arch and Garuda: the signed pacman repository; see [arch-repo.md](arch-repo.md).
  A package manager update depends on the user running it, which is the main
  trade-off against a built-in updater.
