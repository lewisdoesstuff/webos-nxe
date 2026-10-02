#!/bin/sh
# Finishes an install from inside the TV. Runs as root through Homebrew Channel's
# exec when the app starts, and does nothing once everything is in place.
#
#   sh bootstrap.sh <app dir>
#
# - copies the Home hook and boot scripts shipped in <app dir>/tv to a persistent path
# - installs the theme add-ons shipped in <app dir>/tv/themes when they are not there yet
# - links `hack` to / inside the app dir, so the page can reach other apps' icons
# - adds the Luna ACL groups the app needs, keeping every group already there
#
# Prints `ok` when nothing changed and `changed` when the ACL or the link had to
# be written, in which case the app restarts itself. Nothing outside this app's
# own files and its one ACL entry is touched.
APP_DIR=${1:?app dir}
APP_ID=$(basename "$APP_DIR")
SRC="$APP_DIR/tv"
DEST=/var/lib/webosbrew/nxe/service
ACL=/mnt/lg/cmn_data/var/luna-service2-dev/client-permissions.d/$APP_ID.app.json
NEEDED="applications.internal capture.client settings notifications attachedstoragemanager.read"
changed=0

if [ -d "$SRC" ]; then
    mkdir -p "$DEST"
    cp -R "$SRC/." "$DEST/"
    chmod +x "$DEST"/*.sh "$DEST"/home-hook/*.sh "$DEST"/home-hook/native/prebuilt/ezinject 2>/dev/null
fi

THEMES=/media/internal/nxe-themes
if [ -d "$SRC/themes" ]; then
    mkdir -p "$THEMES"
    for dir in "$SRC"/themes/*/; do
        id=$(basename "$dir")
        [ -d "$THEMES/$id" ] || cp -R "$dir" "$THEMES/$id"
    done
    (cd "$THEMES" && ls -d */ | tr -d / | sed 's/.*/"&"/' | paste -sd, - | sed 's/.*/[&]/' > index.json)
fi

if [ "$(readlink "$APP_DIR/hack" 2>/dev/null)" != "/" ]; then
    ln -sfn / "$APP_DIR/hack" && changed=1
fi

if [ -f "$ACL" ]; then
    result=$(python3 - "$ACL" "$APP_ID-*" $NEEDED <<'PY'
import json, os, sys, tempfile
path, key, needed = sys.argv[1], sys.argv[2], sys.argv[3:]
with open(path) as fh:
    data = json.load(fh)
groups = data.setdefault(key, [])
missing = [g for g in needed if g not in groups]
if missing:
    groups.extend(missing)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    os.replace(tmp, path)
print("changed" if missing else "ok")
PY
)
    if [ "$result" = "changed" ]; then
        ls-control scan-services >/dev/null 2>&1
        changed=1
    fi
fi

if [ "$changed" = 1 ]; then
    echo changed
    (
        sleep 1
        luna-send -n 1 -f luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$APP_ID\"}" </dev/null >/dev/null 2>&1
        sleep 2
        luna-send -n 1 -f luna://com.webos.applicationManager/launch "{\"id\":\"$APP_ID\"}" </dev/null >/dev/null 2>&1
    ) </dev/null >/dev/null 2>&1 &
else
    echo ok
fi
