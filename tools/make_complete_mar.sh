#!/usr/bin/env bash
# Build an unsigned complete MAR from a packaged Windows build (the .zip from
# `mach package`), with Firefox's own make_full_update.sh and the `mar` command
# from the mardor package. Mozilla's host `mar` binary is not built for this
# browser-only tree, and mardor writes the same format. Sign the result with
# tools/sign_mar.py.
#
# usage: make_complete_mar.sh SOURCE_TREE PACKAGE.zip OUT.mar MAR_CHANNEL_ID
set -euo pipefail

if [ $# -ne 4 ]; then
  echo "usage: $0 SOURCE_TREE PACKAGE.zip OUT.mar MAR_CHANNEL_ID" >&2
  exit 2
fi
tree=$(realpath "$1")
package=$(realpath "$2")
out=$(realpath -m "$3")
channel=$4

command -v mar >/dev/null || { echo "mar not found: pip install -r requirements-release.txt" >&2; exit 1; }
command -v unzip >/dev/null || { echo "unzip not found" >&2; exit 1; }
command -v xz >/dev/null || { echo "xz not found" >&2; exit 1; }

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
unzip -q "$package" -d "$scratch/unpacked"
# The zip holds one top-level directory (kyberfox/).
mapfile -t tops < <(find "$scratch/unpacked" -mindepth 1 -maxdepth 1)
if [ "${#tops[@]}" -ne 1 ]; then
  echo "Expected one top-level directory in $package, found ${#tops[@]}" >&2
  exit 1
fi
app=${tops[0]}

version=$(sed -n 's/^Version=//p' "$app/application.ini" | tr -d '\r' | head -n 1)
[ -n "$version" ] || { echo "No Version in application.ini" >&2; exit 1; }

# make_full_update.sh calls `mar -C DIR -c output.mar ...` and expects output.mar
# inside DIR, as Mozilla's mar does. mardor creates the archive relative to the
# current directory instead, so a small wrapper moves the name into DIR.
real_mar=$(command -v mar)
cat > "$scratch/mar" <<WRAP
#!/usr/bin/env bash
args=()
dir=
while [ \$# -gt 0 ]; do
  case "\$1" in
    -C) dir=\$2; args+=("-C" "\$2"); shift 2 ;;
    -c) args+=("-c" "\$(realpath -m "\${dir:-.}")/\$2"); shift 2 ;;
    *) args+=("\$1"); shift ;;
  esac
done
exec "$real_mar" "\${args[@]}"
WRAP
chmod +x "$scratch/mar"

# The updater accepts only the channel ids in update-settings.ini; a MAR stamped
# with another id would be refused on users' machines after the signature check.
accepted=$(sed -n 's/^ACCEPTED_MAR_CHANNEL_IDS=//p' "$app/update-settings.ini" | tr -d '\r' | head -n 1)
case ",$accepted," in
  *",$channel,"*) ;;
  *) echo "Channel $channel is not in ACCEPTED_MAR_CHANNEL_IDS ($accepted) of update-settings.ini" >&2; exit 1 ;;
esac

mkdir -p "$(dirname "$out")"
rm -f "$out"
MAR=$scratch/mar \
MOZ_PRODUCT_VERSION=$version \
MAR_CHANNEL_ID=$channel \
BCJ_OPTIONS=--x86 \
  "$tree/tools/update-packaging/make_full_update.sh" -q "$out" "$app"
[ -s "$out" ] || { echo "make_full_update.sh did not write $out" >&2; exit 1; }
echo "wrote $out (version $version, channel $channel)"
