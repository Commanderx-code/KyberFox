#!/usr/bin/env bash
# Build the release package from the Linux tarball. Runs as root inside an
# archlinux:base-devel container (the release workflow starts it).
#
# Usage: release-package.sh <tarball> <version> <build> <out dir>
# The tarball is the CI artifact (kyberfox-<ver>.en-US.linux-x86_64.tar.xz). It is copied
# under the name the PKGBUILD expects (kyberfox-<ver>-<build>.linux-x86_64.tar.xz),
# updpkgsums fills its checksum, and makepkg writes the package to <out dir>.
# HOST_UID and HOST_GID, when set, become the owner of <out dir>.
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: ${0##*/} <tarball> <version> <build> <out dir>" >&2
  exit 2
fi
tarball=$1
ver=$2
rel=$3
out=$4
here=$(cd "$(dirname "$0")" && pwd)

pacman -Syu --noconfirm --needed pacman-contrib
# The Docker sandbox lacks the filesystem restrictions pacman asks for.
sed -i 's/^\[options\]$/[options]\nDisableSandbox/' /etc/pacman.conf
useradd --create-home builder

build=/home/builder/pkg
mkdir -p "$build" "$out"
cp "$here/PKGBUILD" "$here/kyberfox.desktop" "$here/kyberfox-private.desktop" "$here/LICENSE" "$build/"
cp "$tarball" "$build/kyberfox-$ver-$rel.linux-x86_64.tar.xz"
chown -R builder: "$build"

grep -qx "pkgver=$ver" "$build/PKGBUILD" || { echo "PKGBUILD pkgver is not $ver" >&2; exit 1; }
grep -qx "pkgrel=$rel" "$build/PKGBUILD" || { echo "PKGBUILD pkgrel is not $rel" >&2; exit 1; }

cd "$build"
# makepkg refuses to run as root. The tarball is a local file, so updpkgsums
# does not download it.
runuser -u builder -- updpkgsums
runuser -u builder -- makepkg --noconfirm --nodeps
cp ./*.pkg.tar.zst "$out/"
if [[ -n ${HOST_UID:-} ]]; then
  chown -R "$HOST_UID:${HOST_GID:-$HOST_UID}" "$out"
fi
ls -l "$out"
