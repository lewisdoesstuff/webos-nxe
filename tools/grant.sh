#!/usr/bin/env bash
# Show, apply or undo the Luna ACL grant that lets Blades take a still picture.
#
#   ./tools/grant.sh              read-only: print the file and what would change
#   ./tools/grant.sh --apply      add capture.client, keep everything else
#   ./tools/grant.sh --revoke     put the snapshot back and rescan
#   TV_HOST=root@192.168.1.40 ./tools/grant.sh --apply
#
# THIS EDITS A PERSISTENT FILE ON THE TV. It changes one line of
# client-permissions.d/ooo.lew.blades.app.json, which survives a reboot, and
# survives a reinstall of the IPK only in the sense that the installer rewrites
# the file. The change is one added ACL group: it widens what this app may ask
# of the system, and nothing else about the TV is touched.
#
# The snapshot is written to $SNAPSHOT_DIR on /var, which is a real ext4 mount
# on this firmware (/dev/mmcblk0p58), so it outlives a reboot. It is taken only
# while capture.client is still absent, so the pre-grant original is never
# overwritten by an already-granted file.
set -euo pipefail
cd "$(dirname "$0")/.."

TV_HOST="${TV_HOST:-root@192.168.1.37}"
APP_ID="${APP_ID:-ooo.lew.blades}"

# /etc/palm/client-permissions.d/ does not exist on this firmware. The live path
# is under cmn_data, which is persistent.
ACL_DIR="/mnt/lg/cmn_data/var/luna-service2-dev/client-permissions.d"
ACL_FILE="${ACL_DIR}/${APP_ID}.app.json"
SNAPSHOT_DIR="/var/lib/webosbrew/blades/backups"
SNAPSHOT_FILE="${SNAPSHOT_DIR}/${APP_ID}.app.json"

# The app id as the ACL file spells it, and the group being added.
CLIENT_KEY="${APP_ID}-*"
GROUP="capture.client"

MODE="show"
case "${1:-}" in
  "") ;;
  --apply) MODE="apply" ;;
  --revoke) MODE="revoke" ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  *) echo "grant.sh: unknown argument '$1' (expected --apply or --revoke)" >&2; exit 2 ;;
esac

ssh_q() { ssh -o BatchMode=yes -o LogLevel=ERROR "$TV_HOST" "$@"; }

# Print the ACL file and whether the group is already in it. Read-only, so it is
# safe to run at any time and is what the no-argument mode reports.
read_state() {
  ssh_q "cat '$ACL_FILE' 2>/dev/null" || true
}

has_group() {
  case "$1" in
    *"$GROUP"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Rewrite the file with $GROUP appended to the app's list, leaving every other
# key and every other group exactly as they were. python3 is on this firmware;
# the edit happens on the TV so the file is never truncated by a shell redirect.
add_group() {
  ssh_q "python3 - <<'PY'
import json, os, tempfile
path = '$ACL_FILE'
with open(path) as fh:
    data = json.load(fh)
key = '$CLIENT_KEY'
groups = data.get(key)
if groups is None:
    groups = []
    data[key] = groups
if '$GROUP' not in groups:
    groups.append('$GROUP')
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
with os.fdopen(fd, 'w') as fh:
    json.dump(data, fh, separators=(',', ':'))
os.replace(tmp, path)
print(json.dumps(data, separators=(',', ':')))
PY"
}

restore_snapshot() {
  ssh_q "mkdir -p '$SNAPSHOT_DIR' && cp '$SNAPSHOT_FILE' '$ACL_FILE' && ls-control scan-services >/dev/null 2>&1; cat '$ACL_FILE'"
}

rescan() {
  ssh_q "ls-control scan-services" >/dev/null 2>&1 || true
}

print_undo() {
  cat <<EOF

  Undo, in one line:

    ssh $TV_HOST 'cp $SNAPSHOT_FILE $ACL_FILE && ls-control scan-services'

  The snapshot is on /var, a real ext4 mount, so it survives a reboot.
EOF
}

current="$(read_state)"

if [[ -z $current ]]; then
  echo "grant.sh: no ACL file at $ACL_FILE on $TV_HOST" >&2
  echo "  A fresh install writes [\"public\"] only. Install the IPK, run this again." >&2
  exit 1
fi

if [[ $MODE == "show" ]]; then
  echo "ACL file: $ACL_FILE"
  echo "  now:     $current"
  if has_group "$current"; then
    echo "  status:  $GROUP is already granted. Nothing to do."
  else
    echo "  status:  $GROUP is NOT granted."
    echo "  --apply would add it, leaving every other group untouched:"
    echo "    $current"
    echo "     -> $(printf '%s' "$current" | sed "s/]}$/,\"$GROUP\"]}/")"
  fi
  print_undo
  exit 0
fi

if [[ $MODE == "revoke" ]]; then
  if ! ssh_q "test -f '$SNAPSHOT_FILE'" 2>/dev/null; then
    echo "grant.sh: no snapshot at $SNAPSHOT_FILE, so there is nothing to restore" >&2
    exit 1
  fi
  before="$current"
  after="$(restore_snapshot)"
  echo "revoked $GROUP"
  echo "  before: $before"
  echo "  after:  $after"
  echo "  restored from $SNAPSHOT_FILE and rescanned services."
  exit 0
fi

# apply
if has_group "$current"; then
  echo "grant.sh: $GROUP is already in $ACL_FILE, nothing to do." >&2
  echo "  now: $current" >&2
  exit 0
fi

if ! has_group "$(ssh_q "cat '$SNAPSHOT_FILE' 2>/dev/null" || true)"; then
  # Only snapshot while the grant is absent, so the pre-grant original is never
  # replaced by an already-granted file.
  ssh_q "mkdir -p '$SNAPSHOT_DIR' && printf '%s\n' '$current' > '$SNAPSHOT_FILE'"
  echo "snapshot: $SNAPSHOT_FILE  (persistent, survives reboot)"
  echo "  contents: $current"
else
  echo "note: $SNAPSHOT_FILE already holds a pre-grant file, leaving it alone."
fi

after="$(add_group)"
rescan

echo "granted $GROUP"
echo "  before: $current"
echo "  after:  $after"
print_undo
echo
echo "This is a persistent change to the TV. It is one added ACL group in one"
echo "file, and the line above restores it."
