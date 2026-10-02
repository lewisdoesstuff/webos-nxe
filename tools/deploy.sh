#!/usr/bin/env bash
# Build, sync the payload into the installed app dir, reload the page over CDP.
#
#   ./tools/deploy.sh
#   ./tools/deploy.sh --service     also sync service/ to the TV (see below)
#   TV_HOST=root@192.168.1.40 ./tools/deploy.sh
#
# Only syncs into an app that is already installed. It never touches
# appinfo.json on the TV, because changing the manifest needs a reinstall.
#
# --service copies service/ to /var/lib/webosbrew/nxe/service. It is opt-in
# and nothing in there runs by itself: there is no init.d hook and none is ever
# created, so a copy on the TV is inert files. tools/homectl.sh does not need it,
# because it streams each script over ssh on stdin instead. It is here for when
# you want the watcher running on the box rather than over a shell. A running
# home hook controller is restarted so it picks up the copied code.
set -euo pipefail
cd "$(dirname "$0")/.."

TV_HOST="${TV_HOST:-root@192.168.1.37}"
APP_ID="${APP_ID:-ooo.lew.nxe}"
APP_ROOT="/media/developer/apps/usr/palm/applications/${APP_ID}"
SERVICE_ROOT="/var/lib/webosbrew/nxe/service"

# /etc/palm/client-permissions.d/ does not exist on this firmware. The live path
# is under cmn_data, which is persistent.
ACL_DIR="/mnt/lg/cmn_data/var/luna-service2-dev/client-permissions.d"
ACL_FILE="${ACL_DIR}/${APP_ID}.app.json"
SNAPSHOT_DIR="/var/lib/webosbrew/nxe/backups"

SYNC_SERVICE=0
for arg in "$@"; do
  case "$arg" in
    --service) SYNC_SERVICE=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "deploy.sh: unknown option $arg" >&2; exit 2 ;;
  esac
done

if ! ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "test -d '$APP_ROOT'" 2>/dev/null; then
  echo "deploy.sh: $APP_ROOT does not exist on $TV_HOST — install the IPK first:" >&2
  echo "           ./build.sh  (then install dist/*.ipk)" >&2
  exit 1
fi

# Snapshot the Luna ACL before anything can change it. The backup AGENTS.md used
# to point at lived in /tmp, which is tmpfs, so a reboot destroyed it and left
# nobody an original to restore. Keep it on a persistent path instead.
snapshot_acl() {
  local current
  current=$(ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "cat '$ACL_FILE' 2>/dev/null" || true)
  if [[ -z $current ]]; then
    echo "no ACL file at $ACL_FILE, nothing to snapshot" >&2
    return 0
  fi
  ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" \
    "mkdir -p '$SNAPSHOT_DIR' && printf '%s\n' '$current' > '$SNAPSHOT_DIR/${APP_ID}.app.json'"
  echo "ACL snapshot: ${SNAPSHOT_DIR}/${APP_ID}.app.json  (persistent, survives reboot)"
  echo "  contents: $current"
  echo "  restore: ssh $TV_HOST \"cp '$SNAPSHOT_DIR/${APP_ID}.app.json' '$ACL_FILE' && ls-control scan-services\""
}
snapshot_acl

bun run build

# tar over ssh, not rsync: the TV's rsync wants a libcrypto this image lacks.
# assets is replaced wholesale because every build emits new hashed filenames;
# index.html and icons are overwritten in place.
ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "rm -rf '$APP_ROOT/assets' && mkdir -p '$APP_ROOT/assets'"
COPYFILE_DISABLE=1 tar -C dist/app -cf - assets index.html icons | ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "tar -C '$APP_ROOT' -xf -"

# Other apps' icons sit outside this app's origin, and a file:// page cannot
# load them directly. A `hack -> /` link in the app's own directory puts every
# absolute path inside it (panel.ts `paneArt`).
ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "ln -sfn / '$APP_ROOT/hack' && rm -f '$APP_ROOT'/._*"

echo "synced dist/app -> ${TV_HOST}:${APP_ROOT}"

if [[ $SYNC_SERVICE == 1 ]]; then
  ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "mkdir -p '$SERVICE_ROOT/tactics'"
  tar -C service -cf - . | ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "tar -C '$SERVICE_ROOT' -xf -"
  ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" \
    "chmod +x '$SERVICE_ROOT'/*.sh '$SERVICE_ROOT'/*.py '$SERVICE_ROOT'/tactics/*.sh"
  echo "synced service/ -> ${TV_HOST}:${SERVICE_ROOT}"
  # A running home hook controller keeps the code it started with.
  ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" \
    "H='$SERVICE_ROOT/home-hook'; if [ -r /tmp/nxe-homehook.pid ] && kill -0 \$(cat /tmp/nxe-homehook.pid) 2>/dev/null; then sh \$H/stop.sh && sleep 1 && sh \$H/start.sh; fi"
  echo "  nothing there runs by itself. There is no init.d hook and none is created."
  echo "  service/autostart.sh is deliberately not wired up; see the comments in it."
fi

if [[ "${NO_RELOAD:-}" == "1" ]]; then
  exit 0
fi
APP_ID="$APP_ID" ./tools/restart.sh
