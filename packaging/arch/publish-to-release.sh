#!/usr/bin/env bash
# Add a package to the kyberfox pacman repo, which lives in the assets of one
# GitHub Release (tag arch-repo). Git refuses files over 100 MB, so the repo
# cannot live on the gh-pages branch; Release assets can be up to 2 GB.
#
# Usage: publish-to-release.sh <kyberfox-*.pkg.tar.zst> <work dir>
#
# Needs gh (GH_TOKEN with contents: write), GITHUB_REPOSITORY, and for signing
# ARCH_IMAGE, PACMAN_GPG_KEY and KYBERFOX_PACMAN_KEY_ID. The package is signed
# by sign-and-publish.sh inside the archlinux container, as in the release
# workflow. KYBERFOX_REPO_RELEASE names another Release (for a scratch test).
# KYBERFOX_LOCAL_SIGN=1 runs publish-repo.sh on this machine instead of in the
# container, with the key already in the gpg keyring (tests and local checks).
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: ${0##*/} <package.pkg.tar.zst> <work dir>" >&2
  exit 2
fi
pkg=$(realpath -- "$1")
work=$2
release=${KYBERFOX_REPO_RELEASE:-arch-repo}
here=$(cd "$(dirname "$0")" && pwd)
: "${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/name}"
: "${KYBERFOX_PACMAN_KEY_ID:?set KYBERFOX_PACMAN_KEY_ID to the signing key id}"

if [[ ! -f $pkg ]]; then
  echo "no such package: $pkg" >&2
  exit 2
fi

repo_dir=$work/repo
rm -rf -- "$repo_dir"
mkdir -p "$repo_dir"

if ! gh release view "$release" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  gh release create "$release" --repo "$GITHUB_REPOSITORY" --prerelease --latest=false \
    --title "Kyber Fox pacman repository" \
    --notes "The signed pacman repository for Arch Linux. pacman reads these files; see docs/install.md to add the repository. The workflow replaces them on every release."
fi

# Start from what is published now, so repo-add extends the current database and
# publish-repo.sh can prune old versions.
mapfile -t before < <(gh release view "$release" --repo "$GITHUB_REPOSITORY" --json assets --jq '.assets[].name')
if ((${#before[@]})); then
  gh release download "$release" --repo "$GITHUB_REPOSITORY" --dir "$repo_dir" --clobber
fi

if [[ ${KYBERFOX_LOCAL_SIGN:-} == 1 ]]; then
  "$here/publish-repo.sh" "$pkg" "$repo_dir"
else
  : "${ARCH_IMAGE:?set ARCH_IMAGE to the pinned archlinux image}"
  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e GNUPGHOME=/tmp/gnupg \
    -e PACMAN_GPG_KEY -e KYBERFOX_PACMAN_KEY_ID \
    -v "$(dirname "$here"):/packaging:ro" \
    -v "$(dirname "$pkg"):/in:ro" \
    -v "$(realpath -- "$repo_dir"):/repo" \
    "$ARCH_IMAGE" \
    /packaging/arch/sign-and-publish.sh "/in/${pkg##*/}" /repo
fi

# Upload the packages before the database that names them, then remove the
# assets publish-repo.sh pruned. pacman never sees a database entry without its
# package; a pruned package stays listed nowhere.
mapfile -t pkgs < <(find "$repo_dir" -maxdepth 1 -type f -name 'kyberfox-*.pkg.tar.zst*' | sort)
mapfile -t dbs < <(find "$repo_dir" -maxdepth 1 -type f ! -name 'kyberfox-*.pkg.tar.zst*' | sort)
gh release upload "$release" --repo "$GITHUB_REPOSITORY" --clobber "${pkgs[@]}"
gh release upload "$release" --repo "$GITHUB_REPOSITORY" --clobber "${dbs[@]}"
for name in "${before[@]}"; do
  if [[ ! -e $repo_dir/$name ]]; then
    echo "removing $name"
    gh release delete-asset "$release" "$name" --repo "$GITHUB_REPOSITORY" --yes
  fi
done

echo "published to https://github.com/$GITHUB_REPOSITORY/releases/tag/$release:"
ls -l "$repo_dir"
