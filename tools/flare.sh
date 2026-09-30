#!/usr/bin/env bash
# Rebuild app/src/assets/boot/flare.png: the master's frames 86 to 115 as a 6x5
# atlas of 128x72 masks, the bright part of each frame stretched to 0..255.
# Needs docs/refs/video/dkKAW_GXXZk.mkv (tools/refs.sh) and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -loglevel error -y -i docs/refs/video/dkKAW_GXXZk.mkv \
  -vf "select=between(n\,86\,115),scale=128:72:flags=area,format=gray,lutyuv=y='clip((val-165)*255/85\,0\,255)',tile=6x5" \
  -fps_mode passthrough -frames:v 1 app/src/assets/boot/flare.png
ls -l app/src/assets/boot/flare.png
