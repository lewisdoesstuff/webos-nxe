#!/bin/sh
# DELIBERATELY NOT WIRED UP. Nothing symlinks this into
# /var/lib/webosbrew/init.d, and tools/deploy.sh never creates that symlink.
#
# It exists so the "no boot hook" decision is one reversible line rather than a
# matter of memory, and so the reason is written down next to the code.
#
# Why not: init.d runs at ~29 s into boot and sam starts at ~5.5 s, so anything
# mounted from here is ~124 s too late. sam reads the keyfilters once, at
# startup. A hook that does not also restart sam therefore arms a *dormant*
# mount, and status will (correctly) keep reporting it as not in effect. The
# 2026-09-16 attempt did exactly this on this TV and the watcher correctly
# concluded the rung was not doing its job.
#
# And a hook that does restart sam would mean 90.5 s of screensaver on every
# single boot, plus the first reboot-persisting change this project makes.
#
# If that trade is ever worth making, the whole of it is:
#
#   ln -sf /var/lib/webosbrew/xne/service/autostart.sh \
#          /var/lib/webosbrew/init.d/60-blades-homekey
#   reboot
#
# and the undo is to move the file OUT of init.d. Renaming it to *.disabled
# does NOT disable it: this run-parts is BusyBox and executes dotted filenames.
#
#   mv /var/lib/webosbrew/init.d/60-blades-homekey /var/lib/webosbrew/init.d.off/
#   reboot
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
RUNG3="$HERE/tactics/3-keyfilter.sh"

# A hook the TV chose to run itself must cope with a boot it did not choose.
# Idempotent, and fails toward the stock TV: if the patch no longer applies
# cleanly, do nothing and leave the floor.
"$RUNG3" probe || exit 0
"$RUNG3" arm || exit 0
echo "blades: rung 3 armed at boot, restarting sam to make it live"
/sbin/restart sam
