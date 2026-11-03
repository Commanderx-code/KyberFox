# Upstream watch

`.github/workflows/upstream-watch.yml` runs every 3 hours (and on demand from the Actions tab) and looks for a newer Firefox release. It uses `python -m tools.upstream_watch`.

## What it does

1. `--check` reads `https://product-details.mozilla.org/1.0/firefox_versions.json` and prints JSON: the pinned and latest Firefox, whether the change is a security release, the pinned and newest LibreWolf tag, and the pinned and newest uBlock Origin. The LibreWolf and uBlock lookups are best effort; if Codeberg or GitHub is down the fields are `null` and the watch carries on.
2. If Firefox is not newer, the run ends. Nothing is committed.
3. If it is newer and no pull request for `upstream/firefox-<version>` exists (open, merged or closed; a pull request from a fork does not count) and no such branch exists, the workflow runs `--bump <version>` with the version `--check` printed: it rewrites `[firefox] version` and `sha256` in `pins.toml` (the hash comes from `SHA256SUMS` on archive.mozilla.org) and assembles the tree with `allow_failed=True`, which downloads about 500 MB. It writes `upstream-watch-report.md` with the failed patch list. If assembly stops for another reason (for example a changed Firefox file), the error goes in the report and the pull request still opens. A hash mismatch or a LibreWolf commit mismatch stops the run.
4. The workflow commits `Bump Firefox to <version>` as `github-actions[bot]`, pushes the branch and opens a pull request. The body starts with `Security release: yes/no` and `Deadline: <UTC time 72 hours later>`, then the report. Labels `upstream` (and `security`) are added when they exist in the repository.

A security release is a patch bump inside the same major version, for example 159.0 to 159.0.1. A new major version is not flagged.

If a newer LibreWolf tag exists, the report says so and lists the patches in its `patches.txt` that are in neither `patches/librewolf-keep.txt` nor `patches/librewolf-drop.txt` (the names `UnclassifiedPatch` would raise). The watch never changes the LibreWolf or uBlock pins.

## The 72-hour rule

A Firefox security release is shipped within 72 hours of Mozilla publishing it. The deadline in the pull request body is 72 hours after the run that noticed the release. Mozilla's publish time can be up to 3 hours earlier (more if earlier runs failed), so treat the deadline as the latest allowed time.

## What to do with the pull request

1. Read the failed patch list. Fix each patch (or its replacement in `patches/`) until `python -m tools.assemble` finishes without `--allow-failed`. Push the fixes to the same branch.
2. Classify any new LibreWolf patches in the keep or drop list. If you move to the newer LibreWolf tag, pin its `ref` and `commit` in `pins.toml`.
3. If uBlock Origin has a newer version, bump `[ublock]` by hand (version and sha256) and run `browser_shield.js`, because the bridge talks to uBlock's internals.
4. Check `[kyber] build` (set it to 1 for a new Firefox version) and keep `packaging/arch/PKGBUILD` in step; the bot changes only the two Firefox values.
5. Merge, then run `release.yml` (see `release.md`).

## Repository settings

- Settings, Actions, General: enable "Allow GitHub Actions to create and approve pull requests".
- Create the labels `upstream` and `security`. Without them the pull request is opened without labels.
- If PR creation failed after the push (for example the setting above was off), delete the leftover `upstream/firefox-*` branch, or the next run opens the PR from that branch without rebuilding.
- The leftover-branch path is verified before the PR opens: the branch must change only `pins.toml`, and its `pins.toml` must be byte-identical to the merge-base `pins.toml` with the two `[firefox]` values bumped to the version `--check` printed (the hash is fetched again from `SHA256SUMS`). If a check fails the run stops with an error; delete the branch and rerun.
- Pull requests opened with the default token do not start other workflows. Close and reopen the pull request, or push a commit to it, to run checks.
