#!/bin/sh
# Opens the dashboard once the TV has finished booting.
#
# Linked into /var/lib/webosbrew/init.d as 61-nxe-launch. init.d runs it at
# about 29s, before the TV's own home has come up, so it returns at once and
# waits in the background for a foreground app, then launches ours over it.
#
# Undo: rm /var/lib/webosbrew/init.d/61-nxe-launch
APP_ID="${NXE_APP_ID:-ooo.lew.nxe}"
WAIT_MAX=180
SETTLE=6

foreground() {
    luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}' </dev/null 2>/dev/null \
        | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p' | head -n 1
}

(
    waited=0
    current=""
    while [ "$waited" -lt "$WAIT_MAX" ]; do
        current=$(foreground)
        [ -n "$current" ] && break
        sleep 3
        waited=$((waited + 3))
    done
    [ -n "$current" ] || exit 0
    sleep "$SETTLE"
    [ "$(foreground)" = "$APP_ID" ] && exit 0
    luna-send -n 1 -f luna://com.webos.applicationManager/launch "{\"id\":\"$APP_ID\"}" </dev/null >/dev/null 2>&1
) &
exit 0
