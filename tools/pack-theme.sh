#!/usr/bin/env bash
# Zip a theme folder for installing as an add-on: tools/pack-theme.sh nxe
# Writes dist/themes/<id>.zip with the folder inside it, ready to unzip into
# /media/internal/nxe-themes/ on the TV.
set -euo pipefail
cd "$(dirname "$0")/.."
id=${1:?usage: pack-theme.sh <theme id>}
[ -f "themes/$id/theme.json" ] || { echo "themes/$id/theme.json not found" >&2; exit 1; }
mkdir -p dist/themes
rm -f "dist/themes/$id.zip"
(cd themes && zip -qr "../dist/themes/$id.zip" "$id" -x '*.DS_Store')
ls -l "dist/themes/$id.zip"
