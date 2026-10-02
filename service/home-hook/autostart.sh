#!/bin/sh
# Linked into /var/lib/webosbrew/init.d as 62-nxe-homehook. Starts the controller,
# which waits for LG's input processes and gives up on its own if it cannot hook them.
# Undo: rm /var/lib/webosbrew/init.d/62-nxe-homehook
exec sh "$(dirname "$(readlink -f "$0")")/start.sh"
