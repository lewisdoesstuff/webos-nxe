#!/usr/bin/env bash
# Regenerate the default theme's sounds, cards, boot art and icons into
# app/src/theme/default/. Everything is synthesized or drawn here; needs ffmpeg
# and ImageMagick (magick).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=app/src/theme/default
FONT=app/src/assets/fonts/inter-bold.ttf
mkdir -p "$OUT"/{sounds,cards,boot,art}

# tone NAME DURATION FREQ[,FREQ...] [GAIN]: summed sines with a fast attack and an exponential-ish fade
tone() {
  local name=$1 dur=$2 freqs=$3 gain=${4:-0.35} inputs=() n=0 f
  IFS=, read -ra list <<<"$freqs"
  for f in "${list[@]}"; do inputs+=(-f lavfi -i "sine=f=$f:d=$dur:sample_rate=48000"); n=$((n + 1)); done
  ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex \
    "amix=inputs=$n:normalize=0,volume=$gain,afade=t=in:d=0.004,afade=t=out:st=0:d=$dur:curve=exp,aformat=channel_layouts=stereo" \
    -c:a vorbis -strict -2 -q:a 4 "$OUT/sounds/$name.ogg"
}

tone focus 0.03 1800 0.3
tone channel-up 0.03 1400 0.3
tone channel-down 0.03 1000 0.3
tone hud-focus 0.05 1600 0.25
tone hud-select 0.05 2000,2400 0.25
tone panel-left 0.22 660,990 0.3
tone panel-right 0.28 740,1110 0.3
tone blade-1 0.19 523,784 0.3
tone blade-2 0.18 587,880 0.3
tone blade-3 0.18 659,988 0.3
tone option 0.5 880,1320 0.3
tone select 0.9 440,660,880 0.28
tone back 0.85 880,587,440 0.25
tone toast 0.9 1046,1568 0.28
tone hud-open 1.0 392,587,784 0.25
tone hud-close 0.75 784,587,392 0.25
tone transition 2.4 220,330,440,660 0.2

# the boot sting: a rising stack that blooms and rings out, 7.9s like the boot
ffmpeg -loglevel error -y \
  -f lavfi -i "sine=f=130.8:d=7.9:sample_rate=48000" \
  -f lavfi -i "sine=f=196:d=7.9:sample_rate=48000" \
  -f lavfi -i "sine=f=261.6:d=7.9:sample_rate=48000" \
  -f lavfi -i "sine=f=392:d=7.9:sample_rate=48000" \
  -f lavfi -i "sine=f=784:d=7.9:sample_rate=48000" \
  -filter_complex "amix=inputs=5:normalize=0,volume=0.22,afade=t=in:d=2.6:curve=qsin,afade=t=out:st=3.4:d=4.5:curve=exp,aformat=channel_layouts=stereo" \
  -c:a vorbis -strict -2 -q:a 4 "$OUT/sounds/boot.ogg"

# cards 420x320: a lit top, a darker foot, a chamfered top edge, soft discs of light
hues=(120 140 100 160 80 175 60 130)
for i in 1 2 3 4 5 6 7 8; do
  h=${hues[$((i - 1))]}
  top=$(magick -size 1x1 xc:"hsl($h,35%,52%)" -format '%[hex:u.p{0,0}]' info:)
  bot=$(magick -size 1x1 xc:"hsl($h,40%,16%)" -format '%[hex:u.p{0,0}]' info:)
  discs=()
  for k in 1 2 3 4 5 6 7; do
    x=$(((i * 53 + k * 97) % 420)); y=$(((i * 31 + k * 71) % 280)); r=$((18 + (i * 7 + k * 13) % 38))
    discs+=(-fill "rgba(255,255,255,0.07)" -draw "circle $x,$y $((x + r)),$y")
  done
  magick -size 420x320 "gradient:#$top-#$bot" "${discs[@]}" \
    \( -size 420x320 radial-gradient:"rgba(255,255,255,0.45)"-"rgba(255,255,255,0)" -geometry 420x200+0-60 -gravity north -background none -extent 420x320 \) -compose screen -composite \
    \( -size 420x320 xc:none -fill "rgba(255,255,255,0.35)" -draw "polygon 0,0 420,0 420,3 0,3" \) -compose over -composite \
    -blur 0x1.2 -quality 82 "$OUT/cards/$i.jpg"
done

# hub orb 144x144: a glossy disc
magick -size 144x144 xc:none -fill "#2f6f3a" -draw "circle 72,72 72,6" \
  \( -size 144x144 radial-gradient:"#b8ffbf"-"#143d1c" -gravity center -extent 144x144 \) -compose multiply -composite \
  \( -size 144x144 xc:none -fill "rgba(255,255,255,0.55)" -draw "ellipse 72,40 44,26 0,360" -blur 0x6 \) -compose screen -composite \
  \( -size 144x144 xc:none -fill white -draw "circle 72,72 72,6" \) -alpha off -compose copy_opacity -composite \
  "$OUT/art/orb.png"

# settings icon 420x420: a gear, a ring with eight teeth
teeth=()
for a in 0 45 90 135 180 225 270 315; do teeth+=(-draw "translate 210,210 rotate $a line 0,-150 0,-185"); done
magick -size 420x420 xc:none -stroke "#e8f0e8" -strokewidth 30 -fill none -draw "circle 210,210 210,105" \
  -strokewidth 38 "${teeth[@]}" -strokewidth 14 -draw "circle 210,210 210,165" "$OUT/art/settings.png"

# boot orb 480x480: a lit glass sphere, radius 200, centred
sph=$(mktemp -d)
magick -size 480x480 radial-gradient:"#d6f5d0"-"#10301a" -gravity center -crop 400x400+0+0 +repage -gravity center -background none -extent 480x480 "$sph/body.png"
magick -size 480x480 xc:black -fill white -draw "circle 240,240 240,40" -blur 0x1 "$sph/mask.png"
magick -size 480x480 xc:none -fill "rgba(255,255,255,0.5)" -draw "ellipse 240,150 120,60 0,360" -blur 0x14 "$sph/gloss.png"
magick "$sph/body.png" "$sph/gloss.png" -compose screen -composite "$sph/mask.png" -alpha off -compose copy_opacity -composite "$OUT/boot/orb.png"
rm -rf "$sph"

# boot wordmark 1192x252: white text, alpha is the shape
magick -size 1192x252 xc:none -font "$FONT" -pointsize 190 -kerning 24 -fill white -gravity center -annotate +0+22 "WEBOS" "$OUT/boot/mark.png"

# boot flare atlas 768x360: 30 masks of 128x72, a burst that opens then fades
tmp=$(mktemp -d)
for k in $(seq 0 29); do
  t=$(echo "$k / 29" | bc -l)
  r=$(echo "4 + 60 * s(1.5708 * $t)" | bc -l)
  v=$(echo "255 * (1 - $t * $t)" | bc -l | cut -d. -f1)
  magick -size 128x72 xc:black -fill "gray($v)" -draw "ellipse 64,36 $r,$(echo "$r * 0.55" | bc -l) 0,360" \
    -blur 0x$(echo "2 + $t * 6" | bc -l) "$tmp/$(printf %02d $k).png"
done
for row in 0 1 2 3 4; do magick $(ls "$tmp"/*.png | sed -n "$((row * 6 + 1)),$((row * 6 + 6))p") +append "$tmp/row$row.miff"; done
magick "$tmp"/row*.miff -append -colorspace Gray -define png:color-type=0 -depth 8 "$OUT/boot/flare.png"
rm -rf "$tmp"
ls -l "$OUT"/*/* | awk '{print $5, $9}'
