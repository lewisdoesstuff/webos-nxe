#!/usr/bin/env bash
# Pack themes/nxe and upload it to where the app downloads it from, then print
# the hash that ./build.sh bakes into the IPK. Rebuild the IPK afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${NXE_THEME_HOST:-portainer}
DEST=${NXE_THEME_DEST:-/mnt/smb/copyparty/public/nxe/nxe.zip}
tools/pack-theme.sh nxe >/dev/null
zip=dist/themes/nxe.zip
scp "$zip" "$HOST:$DEST"
echo "uploaded $zip to $HOST:$DEST"
sha=$(shasum -a 256 "$zip" | cut -d' ' -f1)
echo "$sha  nxe.zip" > theme.lock
echo "sha256 $sha (written to theme.lock, commit it)"
