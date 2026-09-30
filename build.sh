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

bun run check
bun run build

[[ -f dist/app/appinfo.json ]] || {
  echo "build.sh: dist/app/appinfo.json missing — did the copy step run?" >&2
  exit 1
}

APP_ID=$(node -p "require('./dist/app/appinfo.json').id")
VERSION=$(node -p "require('./dist/app/appinfo.json').version")

mkdir -p dist
# -n / --no-minify is REQUIRED, not a preference: ares-package re-minifies with a
# terser that parses in ES5 mode, and it dies on class fields in any modern
# bundle ("SyntaxError: Unexpected token: operator (=)"). Vite has already
# minified this code, so skipping ares-package's pass loses nothing.
service/steam/build.sh
ares-package -n -o dist dist/app dist/steam-service >/dev/null

IPK="dist/${APP_ID}_${VERSION}_all.ipk"
[[ -f "$IPK" ]] || IPK=$(ls -t dist/*.ipk | head -1)

echo "built: $IPK"
