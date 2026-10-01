#!/usr/bin/env bash
# Copy a theme to the TV and list it: tools/install-theme.sh nxe [host]
# Themes live in /media/internal/nxe-themes/<id>/, and index.json beside them
# lists the installed ids. Touches nothing outside that folder.
set -euo pipefail
cd "$(dirname "$0")/.."
id=${1:?usage: install-theme.sh <theme id> [host]}
host=${2:-root@192.168.1.37}
dir=/media/internal/nxe-themes
[ -f "themes/$id/theme.json" ] || { echo "themes/$id/theme.json not found" >&2; exit 1; }
ssh "$host" "mkdir -p $dir/$id"
ssh "$host" "rm -rf $dir/$id && mkdir -p $dir/$id"
COPYFILE_DISABLE=1 tar -C "themes/$id" --exclude .DS_Store -cf - . | ssh "$host" "tar -C $dir/$id -xf -"
ssh "$host" "cd $dir && ls -d */ | tr -d / | sed 's/.*/\"&\"/' | paste -sd, - | sed 's/.*/[&]/' > index.json && cat index.json"
