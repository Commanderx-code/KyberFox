#!/usr/bin/env bash
# Import the release signing key, then add a package to the signed repo directory.
#
# Usage: sign-and-publish.sh <kyberfox-*.pkg.tar.zst> <repo dir>
# Needs PACMAN_GPG_KEY (the armored private key, no passphrase) and
# KYBERFOX_PACMAN_KEY_ID in the environment, and a throwaway GNUPGHOME:
# the release workflow runs this in an archlinux container.
set -euo pipefail

: "${PACMAN_GPG_KEY:?set PACMAN_GPG_KEY to the armored private key}"
: "${GNUPGHOME:?set GNUPGHOME to a scratch directory}"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"
printf '%s\n' "$PACMAN_GPG_KEY" | gpg --batch --import
unset PACMAN_GPG_KEY

"$(dirname "$0")/publish-repo.sh" "$@"
