# Signed Windows updates

**The update certificates in this repository are placeholders.** Their private keys were deleted, so no MAR can be signed for them and no update will verify or apply. That fails safe. The project owner replaces both files with real keys (see "Owner steps").

<!-- PLACEHOLDER KEYS: overlay/toolkit/mozapps/update/updater/release_primary.der and release_secondary.der are placeholders. -->

Kyber Fox updates itself on Windows only. The Linux build is built with `--disable-updater` and is updated through the Arch package repository (`docs/arch-repo.md`).

## How an update reaches a user

1. The browser reads its update URL from `application.ini`, set by `patches/kyber/updater.patch`:

   ```
   https://commanderx-code.github.io/KyberFox/update/%CHANNEL%/%BUILD_TARGET%/update.xml
   ```

   `%CHANNEL%` is always `release` (`--enable-update-channel=release`); a `test` Pages path is never read by a shipped browser, and every MAR, dry-run included, carries `kyberfox-release`.
2. `update.xml` is a static file on GitHub Pages, written by `tools/update_manifest.py`. It names one complete MAR on GitHub Releases, its SHA-512 and its size. When nothing newer exists, the file is the empty manifest (`<updates></updates>`).
3. The browser downloads the MAR from `https://github.com/Commanderx-code/KyberFox/releases/download/v<version>/kyberfox-<version>.complete.mar` and checks the SHA-512.
4. The updater (`updater.exe`) checks the MAR signature against the certificates built into it, `release_primary.der` and `release_secondary.der`. MAR signature checking is on by default in this Firefox; only `--enable-unverified-updates` turns it off, and `mozconfigs/windows-cross` does not use it. A MAR signed with any other key is refused.
5. The updater also checks that the MAR's channel id matches. `mozconfigs/windows-cross` sets `MAR_CHANNEL_ID` and `ACCEPTED_MAR_CHANNEL_IDS` to `kyberfox-release`, and `tools/make_complete_mar.sh` stamps the same id on the MAR.

The browser treats an update as already installed only when its `buildID` equals the build ID compiled into the running browser (`Services.appinfo.appBuildID`). The release reads the `buildID` for `update.xml` from the MAR's `application.ini`, so the two must agree. Both build workflows pin `MOZ_BUILD_DATE` once per job, so `make build` and `make package` use the same ID. The release fails if `kyberfox.exe` or `xul.dll` does not contain the ID from `application.ini`. Before this was pinned (releases up to 159.0.1-8), the two IDs differed by the minutes between the build and the package step. Windows installs then reinstalled the same release after every restart, until a fixed release replaced it.

Installs are per user and the maintenance service is off (`--disable-maintenance-service`), so an update needs no elevation. The browser contacts `commanderx-code.github.io` every `app.update.interval` seconds (14400); see `docs/network-audit.md`.

## The `%BUILD_TARGET%` value

The updater expands `%BUILD_TARGET%` as `Services.appinfo.OS + "_" + ABI` (`toolkit/modules/UpdateUtils.sys.mjs`). The ABI part is `x86_64-msvc` followed by the architecture of the CPU the browser is running on (`UpdateUtils.sys.mjs` appends `gWinCPUArch`), not the architecture it was built for. The Windows x86_64 build on an x64 machine therefore asks for `WINNT_x86_64-msvc-x64`. The same build under x64 emulation on Windows on Arm asks for `WINNT_x86_64-msvc-aarch64`, and would get a 404 and never update. The release workflow publishes the same manifest under both paths. The file for the current release lives at:

```
update/release/WINNT_x86_64-msvc-x64/update.xml
```

This is the path the update smoke saw in a real request from the built browser (`GET /release/WINNT_x86_64-msvc-x64/update.xml`), and the smoke fails if it ever differs.

## Tools

| Tool | Purpose |
|---|---|
| `tools/make_complete_mar.sh` | Builds the unsigned complete MAR from the packaged `.zip`, using Firefox's `make_full_update.sh` and the `mar` command of mardor. Run by Build Windows. |
| `tools/sign_mar.py` | `sign`, `verify` and `info` for MARs, RSA-4096 and SHA-384, with mardor. |
| `tools/update_manifest.py` | Writes `update.xml` (or the empty manifest) with the MAR's SHA-512 and size. |
| `tools/smoke_update.ps1` | The update smoke (below). |

mardor is the PyPI package `mar`. `requirements-release.txt` pins it and its dependencies by hash: `pip install --require-hashes -r requirements-release.txt`.

```
python -m tools.sign_mar sign --key release_primary.key --cert overlay/toolkit/mozapps/update/updater/release_primary.der \
    --in kyberfox-159.0-1.complete.mar --out signed/kyberfox-159.0-1.complete.mar
python -m tools.update_manifest --version 159.0 --display-version 159.0-1 --build-id 20261110000000 \
    --mar signed/kyberfox-159.0-1.complete.mar \
    --url https://github.com/Commanderx-code/KyberFox/releases/download/v159.0-1/kyberfox-159.0-1.complete.mar \
    --out update/release/WINNT_x86_64-msvc-x64/update.xml
```

`--version` is the Firefox version in `application.ini` (what the updater compares), `--display-version` the Kyber version shown to the user, and `--build-id` the `BuildID` of the new build. `sign` accepts a PEM private key; `--cert` makes it verify the result against the committed certificate before writing.

## Owner steps

The keys and the signing secret belong to the project owner. Nothing here is automated, and no private key is ever committed.

1. Generate two keys and self-signed certificates (RSA-4096, SHA-384), in the private folder:

   ```
   mkdir -p ~/github/projects/kyber-fox-private/keys && cd ~/github/projects/kyber-fox-private/keys
   openssl req -x509 -newkey rsa:4096 -sha384 -days 3650 -nodes \
       -keyout release_primary.key -out release_primary.crt \
       -subj "/CN=Kyber Fox release update signing (primary)"
   openssl x509 -in release_primary.crt -outform DER -out release_primary.der
   openssl req -x509 -newkey rsa:4096 -sha384 -days 3650 -nodes \
       -keyout release_secondary.key -out release_secondary.crt \
       -subj "/CN=Kyber Fox release update signing (secondary)"
   openssl x509 -in release_secondary.crt -outform DER -out release_secondary.der
   chmod 600 *.key
   ```

2. Copy the two `.der` files over the placeholders in `overlay/toolkit/mozapps/update/updater/` and commit them. Only the public certificates are committed.
3. Store the primary private key as the `MAR_SIGNING_KEY` secret of the `release` GitHub environment, from the keys folder:

   ```
   gh secret set MAR_SIGNING_KEY --env release < release_primary.key
   ```

   Keep `release_secondary.key` offline. The committed secondary certificate is the spare: every installed browser already trusts it, so it can sign a release if the primary is lost (see "Rolling keys").
4. Rebuild Windows: push `release-1` to `build-gate`, or dispatch Build Windows from `main`. Builds made with the placeholder certificates cannot take any update, so users must install a build with the real certificates once.
5. Exercise the `apply` job against a signed MAR:

   ```
   gh workflow run smoke-update.yml -f run-id=<Build Windows run> -f signed-mar-run-id=<run that uploaded kyberfox-windows-signed-mar>
   ```

## Rolling keys

The updater accepts a MAR that verifies against either built-in certificate. A build carries a primary (used for signing) and a secondary (the spare, never used until needed). To rotate, for example after the primary key is lost or exposed: sign the next release with the secondary key (set it as `MAR_SIGNING_KEY`). Every installed browser trusts it, so that release installs. In that release's build, commit the old secondary certificate as the new primary and a freshly generated certificate as the new secondary, so a spare exists again. Never ship a build that drops the certificate the installed base still needs to verify the next update.

## Smoke test

`.github/workflows/smoke-update.yml` runs `tools/smoke_update.ps1` on `windows-latest`. It installs the build and points it at a loopback server with the `AppUpdateURL` enterprise policy (there is no pref for the URL; it lives in `application.ini`). The updater keeps its state in `C:\ProgramData\Mozilla-<uuid>\updates\<hash>\`, where it writes `updates.xml` and `updates\last-update.log`.

- `refuse` always runs. It signs the build's own complete MAR with a throwaway key generated in the job, offers it as version 999.0, and passes only if the updater downloads the MAR, fails with the signature error (`failed: 19`, `CERT_VERIFY_ERROR`), the installed build id and `--version` output do not change, and the browser still starts. Build Windows runs it after the Windows smoke.
- `apply` runs only when `signed-mar-run-id` is set. It offers a MAR signed with the real key and passes if the install changes to the MAR's build id. The release publish job calls it with the Build Windows run id of the older version (`run-id`) and the run that uploaded the artifact `kyberfox-windows-signed-mar` holding one `kyberfox-*.complete.mar`. It cannot run until the real key exists.
