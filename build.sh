#!/usr/bin/env bash
# Package the app as an IPK: typecheck, bundle, then let ares-package do the rest.
#
#   ./build.sh            -> dist/<id>_<version>_all.ipk
#
# `dist/app` is the payload: the Vite output plus appinfo.json + icons, which
# vite.config.ts copies in. Nothing is written back into app/.
set -euo pipefail
cd "$(dirname "$0")"

command -v ares-package >/dev/null || {
  echo "build.sh: ares-package not found on PATH" >&2
  exit 1
}

# The NXE theme is downloaded during setup, not shipped. Its zip is built once
# and kept so the hash baked into the app keeps matching the uploaded file.
THEME_ZIP=dist/themes/nxe.zip
if [[ ! -f $THEME_ZIP ]] || [[ -n $(find themes/nxe -type f -newer "$THEME_ZIP" | head -1) ]]; then
  tools/pack-theme.sh nxe >/dev/null
fi
export NXE_THEME_SHA256=$(shasum -a 256 "$THEME_ZIP" | cut -d' ' -f1)
export NXE_THEME_URL="${NXE_THEME_URL:-https://files.lew.ooo/nxe/nxe.zip}"

bun run check
bun run build

[[ -f dist/app/appinfo.json ]] || {
  echo "build.sh: dist/app/appinfo.json missing — did the copy step run?" >&2
  exit 1
}

APP_ID=$(node -p "require('./dist/app/appinfo.json').id")
VERSION=$(node -p "require('./dist/app/appinfo.json').version")

mkdir -p dist

# The TV-side files ride inside the app dir; app/src/bootstrap.ts has root copy
# them out on first launch. Source maps and tests stay behind.
rm -rf dist/app/tv
mkdir -p dist/app/tv
cp service/bootstrap.sh service/launch-at-boot.sh dist/app/tv/
cp -R service/home-hook dist/app/tv/home-hook
find dist/app/tv -name .DS_Store -delete
rm -rf dist/app/tv/home-hook/test_controller.py dist/app/tv/home-hook/__pycache__
find dist/app -name '*.map' -delete

# The package must be the original-material build; the retail look is only the
# theme zip, which is not in it.
if find dist/app -type f \( -iname 'convection*' -o -iname 'segoe*' \) -print | grep -q .; then
  echo "build.sh: retail fonts found in dist/app" >&2
  exit 1
fi
# -n / --no-minify is REQUIRED, not a preference: ares-package re-minifies with a
# terser that parses in ES5 mode, and it dies on class fields in any modern
# bundle ("SyntaxError: Unexpected token: operator (=)"). Vite has already
# minified this code, so skipping ares-package's pass loses nothing.
service/steam/build.sh
ares-package -n -o dist dist/app dist/steam-service >/dev/null

IPK="dist/${APP_ID}_${VERSION}_all.ipk"
[[ -f "$IPK" ]] || IPK=$(ls -t dist/*.ipk | head -1)

echo "built: $IPK"
echo "theme zip to upload: $THEME_ZIP -> $NXE_THEME_URL (sha256 $NXE_THEME_SHA256)"
