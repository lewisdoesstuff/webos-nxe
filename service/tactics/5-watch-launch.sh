#!/bin/sh
# Rung 5 -- the read-only /dev/input watcher. The floor and the verifier.
#
#   5-watch-launch.sh probe | arm | verify | disarm
#
# There is nothing to mount here, so arm/disarm say so rather than pretending to
# change something. What this rung *is* is `homectl.sh watch`, a foreground
# process that reads the remote's key events and calls launch itself.
#
# It modifies no system file, so it survives any firmware the keyfilter patch
# does not, and it is the only rung that can tell you the keyfilter patch has
# stopped working: it counts the presses where the stock home won the race
# after it launched ours. That count is the rung-3 failure signal, and trusting
# `verify` alone instead is the bug that makes a silent no-op look healthy.
set -eu

OUR_APP_ID="${BLADES_APP_ID:-ooo.lew.xne}"
# The node number is NOT stable. This device was event2 in the groundwork, event3
# on 2026-09-16, and event2 again today, because a third M-RCU node appeared.
# A hardcoded path watches the wrong device and fails silently, so resolve by name
# every single time.
DEVICE_NAME="LGE M-RCU - Builtin [0]"
KEY_CODE=773

ACTION="${1:-}"

resolve_device() {
    awk -v want="$DEVICE_NAME" '
        /^N: Name=/ { name = $0; sub(/^N: Name="/, "", name); sub(/"$/, "", name) }
        /^H: Handlers=/ && name == want {
            for (i = 1; i <= NF; i++) if ($i ~ /^event[0-9]+$/) { print "/dev/input/" $i; exit }
        }
    ' /proc/bus/input/devices 2>/dev/null
}

list_devices() {
    awk '
        /^N: Name=/ { name = $0; sub(/^N: Name="/, "", name); sub(/"$/, "", name) }
        /^H: Handlers=/ && name ~ /RCU|Remote/ {
            node = ""
            for (i = 1; i <= NF; i++) if ($i ~ /^event[0-9]+$/) { node = $i; break }
            if (node != "") printf "  %-32s %s\n", name, node
        }
    ' /proc/bus/input/devices 2>/dev/null
}

probe() {
    device=$(resolve_device || true)
    if [ -z "$device" ]; then
        echo "unavailable: no input device named \"$DEVICE_NAME\""
        echo "  devices that look like remotes:"
        list_devices
        return 1
    fi
    if [ ! -r "$device" ]; then
        echo "unavailable: $device exists but is not readable as this user"
        return 1
    fi
    echo "available: read-only watcher on $device (\"$DEVICE_NAME\")"
    echo "           Home is vendor code $KEY_CODE, above KEY_MAX, so uinput can"
    echo "           neither advertise nor inject it. Reading is the only way to see it."
    return 0
}

arm() {
    probe > /dev/null || { probe; return 1; }
    echo "armed: nothing to mount. This rung is a process, not a mount."
    echo "       Run 'homectl.sh watch' to have it running; it stays in the"
    echo "       foreground and takes nothing with it when you stop it."
    return 0
}

verify() {
    device=$(resolve_device || true)
    if [ -z "$device" ]; then
        echo "not armed: \"$DEVICE_NAME\" is not present"
        return 1
    fi
    running=$(pgrep -f 'blades-watch.py' 2>/dev/null | tr '\n' ' ' || true)
    if [ -n "$running" ]; then
        echo "armed: watcher running as pid $running on $device"
    else
        echo "not armed: no blades-watch.py process; $device is available and readable"
    fi
    return 0
}

disarm() {
    pkill -f 'blades-watch.py' 2>/dev/null || true
    sleep 1
    if pgrep -f 'blades-watch.py' > /dev/null 2>&1; then
        echo "disarm FAILED: blades-watch.py is still running"
        return 1
    fi
    echo "disarmed: no watcher running, and nothing was ever mounted"
    return 0
}

case "$ACTION" in
    probe) probe ;;
    arm) arm ;;
    verify) verify ;;
    disarm) disarm ;;
    *) echo "usage: $0 probe|arm|verify|disarm" >&2; exit 2 ;;
esac
