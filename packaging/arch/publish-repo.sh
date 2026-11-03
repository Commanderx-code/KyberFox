#!/usr/bin/env bash
# Sign a built package and add it to the kyberfox pacman repo directory.
#
# Usage: publish-repo.sh <kyberfox-*.pkg.tar.zst> <repo dir>
# The repo dir is arch/x86_64/ in the gh-pages checkout. The signing key id
# comes from KYBERFOX_PACMAN_KEY_ID and the key must be in the gpg keyring.
# This script never commits or pushes; the release workflow does that.
set -euo pipefail

keep=2
repo=kyberfox

if [[ $# -ne 2 ]]; then
  echo "usage: ${0##*/} <package.pkg.tar.zst> <repo dir>" >&2
  exit 2
fi
pkg=$1
dir=$2
: "${KYBERFOX_PACMAN_KEY_ID:?set KYBERFOX_PACMAN_KEY_ID to the signing key id}"

if [[ ! -f $pkg || $pkg != *.pkg.tar.zst ]]; then
  echo "not a .pkg.tar.zst file: $pkg" >&2
  exit 2
fi
name=${pkg##*/}
if [[ $name != "$repo"-* ]]; then
  echo "package name must start with $repo-: $name" >&2
  exit 2
fi

version_of() {
  local v=${1#"$repo"-}
  echo "${v%-x86_64.pkg.tar.zst}"
}

# Sort the package file names given as arguments, newest version first, into $sorted.
sort_by_version() {
  local p q placed out
  sorted=()
  for p in "$@"; do
    placed=0
    out=()
    for q in "${sorted[@]}"; do
      if ((placed == 0)) && [[ $(vercmp "$(version_of "$p")" "$(version_of "$q")") -gt 0 ]]; then
        out+=("$p")
        placed=1
      fi
      out+=("$q")
    done
    ((placed == 1)) || out+=("$p")
    sorted=("${out[@]}")
  done
}

# Refuse before touching the directory when the new package would be pruned at once
# (republishing a version older than the $keep newest), which would leave the database
# pointing at a deleted file.
existing=()
if [[ -d $dir ]]; then
  mapfile -t existing < <(find "$dir" -maxdepth 1 -name "$repo-*-x86_64.pkg.tar.zst" ! -name "$name" -printf '%f\n')
fi
sort_by_version "$name" "${existing[@]}"
for ((i = 0; i < keep && i < ${#sorted[@]}; i++)); do
  [[ ${sorted[i]} == "$name" ]] && newest=1
done
if [[ -z ${newest:-} ]]; then
  echo "$name is older than the $keep newest versions in $dir; refusing to publish it" >&2
  exit 1
fi

mkdir -p "$dir"
cp -f -- "$pkg" "$dir/$name"
rm -f -- "$dir/$name.sig"
gpg --batch --yes --use-agent --local-user "$KYBERFOX_PACMAN_KEY_ID" \
  --detach-sign --output "$dir/$name.sig" "$dir/$name"

cd "$dir"
repo-add --sign --key "$KYBERFOX_PACMAN_KEY_ID" "$repo.db.tar.gz" "$name"

# repo-add makes kyberfox.db and kyberfox.files symlinks; GitHub Pages does not
# serve symlinks, so replace them with copies.
for ext in db files; do
  cp -f --remove-destination -- "$repo.$ext.tar.gz" "$repo.$ext"
  cp -f --remove-destination -- "$repo.$ext.tar.gz.sig" "$repo.$ext.sig"
done

# repo-add leaves the previous database as *.old; do not publish it.
rm -f -- "$repo".db.tar.gz.old* "$repo".files.tar.gz.old*

# Delete everything beyond the newest $keep versions; the database lists only the newest.
mapfile -t pkgs < <(find . -maxdepth 1 -name "$repo-*-x86_64.pkg.tar.zst" -printf '%f\n')
sort_by_version "${pkgs[@]}"
for ((i = keep; i < ${#sorted[@]}; i++)); do
  echo "removing old $(version_of "${sorted[i]}")"
  rm -f -- "${sorted[i]}" "${sorted[i]}.sig"
done

echo "repo contents:"
ls -l
