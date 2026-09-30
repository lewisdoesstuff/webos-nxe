#!/usr/bin/env bash
# Bundle the Steam service into dist/steam-service/, ready for ares-package to ship beside the app.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=dist/steam-service
rm -rf "$out"
mkdir -p "$out"
bun build service/steam/service.ts --target=node --format=cjs --external webos-service --outfile "$out/service.js"
cp service/steam/package/package.json service/steam/package/services.json "$out/"
