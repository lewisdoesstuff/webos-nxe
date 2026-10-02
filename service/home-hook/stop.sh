#!/bin/sh
# Stops the controller and removes the lease. Home is stock at once.
PIDFILE=/tmp/nxe-homehook.pid
[ -r "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
rm -f /tmp/lg-xmb-home-button/lease
echo stopped
