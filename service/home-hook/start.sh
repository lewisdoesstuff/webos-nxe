#!/bin/sh
# Starts the controller detached. Safe to run twice.
HERE=$(cd "$(dirname "$0")" && pwd)
PIDFILE=/tmp/nxe-homehook.pid
if [ -r "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo running
    exit 0
fi
PY=
for candidate in /usr/bin/python3 /usr/bin/python; do
    [ -x "$candidate" ] && PY=$candidate && break
done
[ -n "$PY" ] || { echo "no python" >&2; exit 1; }
mkdir -p /var/lib/nxe
nohup "$PY" "$HERE/controller.py" >/var/lib/nxe/home-hook.log 2>&1 </dev/null &
echo started
