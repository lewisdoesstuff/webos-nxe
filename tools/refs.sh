#!/usr/bin/env bash
# Rebuild docs/refs/ (gitignored) from the source videos: the boot master's
# frames every 10 and the retail 9199 hub frames docs/REFERENCES.md names.
# Needs yt-dlp and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/../docs/refs" 2>/dev/null || { mkdir -p "$(dirname "$0")/../docs/refs"; cd "$(dirname "$0")/../docs/refs"; }
mkdir -p video boot hub sheets

for id in dkKAW_GXXZk nhf_OIt7ag0 3MbMvmY19SA; do
  [ -f "video/$id.mkv" ] || yt-dlp -q --no-warnings -f "bv*+ba/b" --merge-output-format mkv \
    -o "video/$id.%(ext)s" "https://www.youtube.com/watch?v=$id"
done

for n in $(seq 0 10 380) 121; do
  ffmpeg -loglevel error -y -i video/dkKAW_GXXZk.mkv -vf "select=eq(n\,$n),scale=1920:1080" \
    -fps_mode passthrough -frames:v 1 "boot/$(printf f%04d "$n").png"
done

for t in 48 50 62 66 82 100 110 122 124 128 134 136 140 144 150 154 164; do
  ffmpeg -loglevel error -y -ss "$t" -i video/nhf_OIt7ag0.mkv -frames:v 1 "hub/9199-t$(printf %03d "$t").png"
done

mkdir -p settings
for t in 16 20 52 54 56 156 158 160; do
  ffmpeg -loglevel error -y -ss "$t" -i video/nhf_OIt7ag0.mkv -frames:v 1 "settings/9199-t$(printf %03d "$t").png"
done

ffmpeg -loglevel error -y -i video/dkKAW_GXXZk.mkv \
  -vf "select='not(mod(n\,20))*lte(n\,380)',scale=384:216,tile=5x4" -fps_mode passthrough -frames:v 1 sheets/boot.png
ffmpeg -loglevel error -y -i video/nhf_OIt7ag0.mkv -vf "fps=1/2,scale=320:180,tile=8x11" -frames:v 1 sheets/9199.png
ffmpeg -loglevel error -y -i video/3MbMvmY19SA.mkv -vf "fps=1/10,scale=240:135,tile=10x13" -frames:v 1 sheets/walk.png
echo "refs rebuilt in $(pwd)"
