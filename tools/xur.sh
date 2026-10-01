#!/usr/bin/env bash
# Decode Xbox 360 XUR scene files to XUI XML with SGCSam/XUIHelper.
#
#   tools/xur.sh <file.xur|dir> <out.xui|outdir> [v5|v8]
#   tools/xur.sh --retail <outdir>      the 601 retail 9199 scenes in XUIHelper's test data
#
# v5 is the 2008 to 2009 format (builds 1888 to 9199), v8 the later one
# (12611 to 17559). The version is read from the file when not given.
# XUIHelper is GPL-3.0, so it is cloned and built outside the repository,
# under $XUIHELPER_DIR (default ~/.cache/xuihelper). Needs git and a .NET SDK.
set -euo pipefail

REPO=https://github.com/SGCSam/XUIHelper
COMMIT=c0d083036c6b0e3cdec5a3df0abfca0e58973117
DIR=${XUIHELPER_DIR:-$HOME/.cache/xuihelper}
BIN=$DIR/XUIHelper.CLI/bin/Release/net8.0

if [ ! -f "$BIN/XUIHelper.CLI.dll" ]; then
  [ -d "$DIR/.git" ] || git clone -q "$REPO" "$DIR"
  git -C "$DIR" checkout -q "$COMMIT"
  # The CLI joins its extension path with a backslash.
  sed -i.bak 's|@"Assets\\Extensions"|"Assets", "Extensions"|' "$DIR/XUIHelper.CLI/Program.cs"
  dotnet build "$DIR/XUIHelper.CLI" -c Release -nologo -v q >/dev/null
fi

run() { DOTNET_ROLL_FORWARD=Major dotnet "$BIN/XUIHelper.CLI.dll" "$@"; }

version() {
  local f=$1
  [ -d "$f" ] && f=$(find "$f" -name '*.xur' | head -1)
  case $(xxd -s 4 -l 4 -p "$f") in
    00000005) echo V5 ;;
    00000008) echo V8 ;;
    *) echo "unknown XUR version in $f" >&2; exit 2 ;;
  esac
}

if [ "${1:-}" = --retail ]; then
  set -- "$DIR/XUIHelper.Tests/Test Data/XUR/9199" "${2:?outdir}" v5
fi

src=${1:?source}
out=${2:?output}
group=$(echo "${3:-}" | tr a-z A-Z)
[ -n "$group" ] || group=$(version "$src")
log=$(mktemp)

if [ -d "$src" ]; then
  mkdir -p "$out"
  run massconv -s "$(cd "$src" && pwd)" -f xuiv12 -o "$(cd "$out" && pwd)" -g "$group" -i -l "$log" -v info | grep -E 'Successful|Failed Conv' || true
  awk '/Reading XUR file/ { f = $0 } /Failed to read XUR/ { sub(/.*\//, "", f); sub(/"$/, "", f); print "failed: " f }' "$log" | sort -u >&2
else
  mkdir -p "$(dirname "$out")"
  run conv -s "$(cd "$(dirname "$src")" && pwd)/$(basename "$src")" -f xuiv12 -o "$(cd "$(dirname "$out")" && pwd)/$(basename "$out")" -g "$group" -i -l "$log" -v info | tail -1
fi
rm -f "$log"
