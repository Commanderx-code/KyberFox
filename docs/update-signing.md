# Signed Windows updates

<!-- PLACEHOLDER KEYS: overlay/toolkit/mozapps/update/updater/release_primary.der and
release_secondary.der are placeholders. Their private keys were generated once and
deleted. No MAR can ever be signed for them, so no update verifies and none is applied.
This fails safe. The project owner replaces both files with real keys (see "Owner
steps") and the Windows build is rebuilt. -->

Kyber Fox updates itself on Windows only. The Linux build is built with `--disable-updater` and is updated through the Arch package repository (`docs/arch-repo.md`).

## How an update reaches a user

1. The browser reads its update URL from `application.ini`, set by `patches/kyber/updater.patch`:

   ```
   https://commanderx-code.github.io/KyberFox/update/%CHANNEL%/%BUILD_TARGET%/update.xml
   ```

   `%CHANNEL%` is `release` (`--enable-update-channel=release`).
2. `update.xml` is a static file on GitHub Pages, written by `tools/update_manifest.py`. It names one complete MAR on GitHub Releases, its SHA-512 and its size. When nothing newer exists, the file is the empty manifest (`<updates></updates>`).
3. The browser downloads the MAR from `https://github.com/Commanderx-code/KyberFox/releases/download/v<version>/kyberfox-<version>.complete.mar` and checks the SHA-512.
4. The updater (`updater.exe`) checks the MAR signature against the certificates built into it, `release_primary.der` and `release_secondary.der`. MAR signature checking is on by default in this Firefox; only `--enable-unverified-updates` turns it off, and `mozconfigs/windows-cross` does not use it. A MAR signed with any other key is refused.
5. The updater also checks that the MAR's channel id matches. `mozconfigs/windows-cross` sets `MAR_CHANNEL_ID` and `ACCEPTED_MAR_CHANNEL_IDS` to `kyberfox-release`, and `tools/make_complete_mar.sh` stamps the same id on the MAR.

Installs are per user and the maintenance service is off (`--disable-maintenance-service`), so an update needs no elevation. The browser contacts `commanderx-code.github.io` every `app.update.interval` seconds (14400); see `docs/network-audit.md`.

## The `%BUILD_TARGET%` value

The updater expands `%BUILD_TARGET%` as `Services.appinfo.OS + "_" + ABI` (`toolkit/modules/UpdateUtils.sys.mjs`). For the Windows x86_64 build that is `WINNT_x86_64-msvc`. The manifest path must match it, so the file for the current release lives at:

```
update/release/WINNT_x86_64-msvc/update.xml
```

Confirmed value from a Windows build: see the update smoke run recorded in the Task 15 report (the loopback server logs the expanded path of the request).

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
    --out update/release/WINNT_x86_64-msvc/update.xml
```

`--version` is the Firefox version in `application.ini` (what the updater compares), `--display-version` the Kyber version shown to the user, and `--build-id` the `BuildID` of the new build. `sign` accepts a PEM private key; `--cert` makes it verify the result against the committed certificate before writing.

## Owner steps

The keys and the signing secret belong to the project owner. Nothing here is automated, and no private key is ever committed.

1. Generate two keys and self-signed certificates (RSA-4096, SHA-384), in the private folder `~/github/projects/kyber-fox-private/keys/`:

   ```
   openssl req -x509 -newkey rsa:4096 -sha384 -days 3650 -nodes \
       -keyout release_primary.key -out release_primary.crt \
       -subj "/CN=Kyber Fox release update signing (primary)"
   openssl x509 -in release_primary.crt -outform DER -out release_primary.der
   openssl req -x509 -newkey rsa:4096 -sha384 -days 3650 -nodes \
       -keyout release_secondary.key -out release_secondary.crt \
       -subj "/CN=Kyber Fox release update signing (secondary)"
   openssl x509 -in release_secondary.crt -outform DER -out release_secondary.der
   ```

2. Copy the two `.der` files over the placeholders in `overlay/toolkit/mozapps/update/updater/` and commit them. Only the public certificates are committed.
3. Store the primary private key as the `MAR_SIGNING_KEY` secret of the `release` GitHub environment (the PEM text of `release_primary.key`). Keep the secondary key offline; it is the spare for key rotation.
4. Rebuild Windows. Builds made with the placeholder certificates cannot take any update, so users must install a build with the real certificates once.
5. Run the `apply` job of `smoke-update.yml` against a signed MAR (below).

## Rolling keys

Firefox accepts a MAR that verifies against either certificate. To replace the primary key: sign releases with the primary, ship a build that carries the new certificate as the secondary (and still the old primary), then switch to signing with the new key, and later drop the old certificate. Never remove the only certificate that the installed base trusts before a build carrying its successor has been out long enough.

## Smoke test

`.github/workflows/smoke-update.yml` runs `tools/smoke_update.ps1` on `windows-latest`. It installs the build and points it at a loopback server with the `AppUpdateURL` enterprise policy (there is no pref for the URL; it lives in `application.ini`).

- `refuse` always runs. It signs the build's own complete MAR with a throwaway key generated in the job, offers it as version 999.0, and passes only if the updater downloads the MAR, fails with the signature error (`CERT_VERIFY_ERROR`, code 19), the installed build id and `--version` output do not change, and the browser still starts. Build Windows runs it after the Windows smoke.
- `apply` runs only when `signed-mar-run-id` is set. It offers a MAR signed with the real key and passes if the install changes to the MAR's build id. The release publish job calls it with the Build Windows run id of the older version (`run-id`) and the run that uploaded the artifact `kyberfox-windows-signed-mar` holding one `kyberfox-*.complete.mar`. It cannot run until the real key exists.
