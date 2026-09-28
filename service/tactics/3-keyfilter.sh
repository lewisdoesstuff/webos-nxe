#!/bin/sh
# Rung 3 -- the keyfilter patch. Runs ON THE TV; homectl.sh streams it over ssh
# on stdin, so nothing of ours is installed on the box to make this work.
#
#   3-keyfilter.sh probe    read-only: can the patch still be applied safely?
#   3-keyfilter.sh arm      write the patched copy, bind-mount it, record state
#   3-keyfilter.sh verify   is the mount there, is it in effect, does it read right
#   3-keyfilter.sh disarm   umount -l and delete the patched copy
#
# The Home key is dispatched by QML JavaScript in systemUi.js, where the home
# app id is a hardcoded string in exactly two places. Rewriting those two and
# mounting the copy over the original is the only zero-flash takeover measured
# to work on this hardware.
#
# The mount is a runtime object. Nothing is written to a persistent partition
# and no init.d hook exists, so a reboot is a total reset. sam reads the
# keyfilters once at startup, so the patch is dormant until sam next starts --
# `in effect` in verify's output is the distinction that matters, and treating
# "armed" as "working" is what tore down the 2026-09-16 experiment.
set -eu

HOME_APP_ID=com.webos.app.home
OUR_APP_ID="${BLADES_APP_ID:-ooo.lew.xne}"
TARGET=/usr/lib/qml/KeyFilters/systemUi.js
PATCHED=/tmp/blades-systemUi.js
STATE=/tmp/blades-homerung3.state
SAM_BIN=/usr/sbin/sam

# Two lines reference the home id as a literal. Everything else compares
# against the HOME_APP_ID variable and follows the first substitution for free,
# which is what makes Home-while-Blades-foreground a no-op rather than a
# relaunch -- the same semantics the stock home has.
#
# Both patterns are anchored on the closing quote. com.webos.app.home is a
# prefix of com.webos.app.homeconnect, and also appears in config keys
# (com.webos.app.home.uiStyle) and getConfigs lists; an unanchored global sed
# would corrupt them.
SITE_VARIABLE="var HOME_APP_ID = \"$HOME_APP_ID\";"
SITE_LAUNCH="applicationManager.launch(\"$HOME_APP_ID\","

uptime_seconds() { cut -d' ' -f1 /proc/uptime; }

sam_pid() {
    for dir in /proc/[0-9]*; do
        [ -r "$dir/cmdline" ] || continue
        cmdline=$(tr '\0' ' ' < "$dir/cmdline" 2>/dev/null) || continue
        case "$cmdline" in
            "$SAM_BIN "*|"$SAM_BIN") echo "${dir#/proc/}"; return 0 ;;
        esac
    done
    return 1
}

sam_start_uptime() {
    pid=$(sam_pid) || return 1
    elapsed=$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ') || return 1
    [ -n "$elapsed" ] || return 1
    awk -v up="$(uptime_seconds)" -v e="$elapsed" 'BEGIN { printf "%.2f", up - e }'
}

# Identity, not name: `mount | grep` is ambiguous about which of several
# entries is on top, and so is the reverse of a bind mount.
mount_entries() { awk -v m="$TARGET" '$5 == m' /proc/self/mountinfo 2>/dev/null | wc -l; }

# The keyfilter directory sits in a shared peer group, so one bind mount here
# propagates into every jailed app's own view of the filesystem: measured 13
# entries rooted at the patched file, 12 of them under /mnt/lg/*/var/palm/jail/.
# Nothing reads the keyfilter from inside a jail, so this is harmless, but a
# revert that only unmounted the root copy would leave 12 behind and still look
# clean. So count them, and make disarm refuse to call itself done while any
# remain.
propagated_entries() {
    awk -v r="/${PATCHED##*/}" '$4 == r' /proc/self/mountinfo 2>/dev/null | wc -l
}

probe() {
    if [ ! -f "$TARGET" ]; then
        echo "unavailable: $TARGET does not exist on this firmware"
        return 1
    fi
    variables=$(grep -c -F "$SITE_VARIABLE" "$TARGET" || true)
    launches=$(grep -c -F "$SITE_LAUNCH" "$TARGET" || true)
    if [ "$variables" -ne 1 ] || [ "$launches" -ne 1 ]; then
        echo "unavailable: expected 1 HOME_APP_ID definition and 1 launch call in"
        echo "            $TARGET, found $variables and $launches."
        echo "            LG most likely moved the dispatch to launchDefaultApp or to"
        echo "            C++ keyfilters. Refusing to guess."
        return 1
    fi
    if grep -q -F "$OUR_APP_ID" "$TARGET"; then
        echo "unavailable: $TARGET already names $OUR_APP_ID, so it is not the stock"
        echo "            file. Something else owns this mount; refusing to touch it."
        return 1
    fi
    if grep -q -F "com.webos.app.homeconnect" "$TARGET"; then
        echo "note: $TARGET also contains com.webos.app.homeconnect; the patch is"
        echo "      anchored on the closing quote so it cannot touch it"
    fi
    echo "available: $TARGET hardcodes the home id in exactly 2 sites"
    echo "           ($(grep -n -F "$HOME_APP_ID\"" "$TARGET" | tr '\n' ' '))"
    return 0
}

# A patch we cannot prove correct must never be mounted: mounting the wrong
# thing over a system file is how you get a TV that will not show a home.
# The round-trip is the proof -- applying the inverse substitutions to our
# patched copy must reproduce the stock file byte for byte, which is stronger
# than counting occurrences and holds even if a future build has more copies.
inverse() {
    sed -e "s|var HOME_APP_ID = \"$OUR_APP_ID\";|$SITE_VARIABLE|" \
        -e "s|applicationManager.launch(\"$OUR_APP_ID\",|$SITE_LAUNCH|"
}

patch_and_check() {
    sed -e "s|$SITE_VARIABLE|var HOME_APP_ID = \"$OUR_APP_ID\";|" \
        -e "s|$SITE_LAUNCH|applicationManager.launch(\"$OUR_APP_ID\",|" \
        "$TARGET" > "$PATCHED"

    roundtrip=/tmp/blades-systemUi.roundtrip.$$
    inverse < "$PATCHED" > "$roundtrip"

    ours=$(grep -c -F "$OUR_APP_ID" "$PATCHED" || true)
    theirs=$(grep -c -F "$HOME_APP_ID" "$PATCHED" || true)
    changed=$(diff "$TARGET" "$PATCHED" 2>/dev/null | grep -c '^[<>]' || true)
    identical=no
    cmp -s "$TARGET" "$roundtrip" && identical=yes
    rm -f "$roundtrip"

    if [ "$ours" -ne 2 ] || [ "$theirs" -ne 0 ]; then
        echo "refusing to arm: expected 2 rewritten sites and 0 left behind, found" \
             "ours=$ours theirs=$theirs" >&2
        rm -f "$PATCHED"
        return 1
    fi
    if [ "$identical" != "yes" ]; then
        echo "refusing to arm: the patch is not those two substitutions and nothing" >&2
        echo "else ($changed differing line(s)); mounting an unrecognised file over" >&2
        echo "a system file is how you get a TV with no home screen" >&2
        rm -f "$PATCHED"
        return 1
    fi
    # The system file is 0755 and sam runs it; the copy must keep that.
    chmod 0755 "$PATCHED"
    return 0
}

record_state() {
    sam=$(sam_pid || echo unknown)
    {
        echo "mounted_at_uptime=$1"
        echo "patched=$PATCHED"
        echo "target=$TARGET"
        echo "our_app_id=$OUR_APP_ID"
        echo "sam_pid_at_mount=$sam"
    } > "$STATE"
}

arm() {
    probe > /dev/null || { probe; return 1; }
    if [ "$(mount_entries)" -gt 0 ]; then
        echo "already armed: $TARGET already has $(mount_entries) mount(s) over it"
        return 0
    fi
    patch_and_check
    mount -o bind "$PATCHED" "$TARGET"
    if [ "$(mount_entries)" -ne 1 ]; then
        echo "arming failed: expected exactly 1 mount over $TARGET, found $(mount_entries)" >&2
        return 1
    fi
    if [ ! "$TARGET" -ef "$PATCHED" ]; then
        echo "arming failed: $TARGET does not resolve to $PATCHED" >&2
        return 1
    fi
    record_state "$(uptime_seconds)"
    echo "armed: $TARGET now dispatches the Home key to $OUR_APP_ID"
    echo "       (patched copy $PATCHED on tmpfs, identity-checked with -ef)"
    echo "note: dormant until sam next starts. That is boot, or 'restart sam'"
    echo "      which costs 90.5 s and raises a screensaver on the way."
    return 0
}

# "armed" and "working" are different claims and status must not conflate them.
in_effect() {
    [ -f "$STATE" ] || { echo unknown; return 0; }
    mounted_at=$(sed -n 's/^mounted_at_uptime=//p' "$STATE")
    recorded_sam=$(sed -n 's/^sam_pid_at_mount=//p' "$STATE")
    current_sam=$(sam_pid || echo unknown)
    if [ "$recorded_sam" != "unknown" ] && [ "$current_sam" != "$recorded_sam" ]; then
        echo "yes-since-sam-restart"
        return 0
    fi
    start=$(sam_start_uptime || echo "")
    if [ -z "$start" ]; then echo unknown; return 0; fi
    if awk -v a="$mounted_at" -v b="$start" 'BEGIN { exit !(a < b) }'; then
        echo "yes"
    else
        echo "no-dormant"
    fi
    return 0
}

verify() {
    rc=0
    entries=$(mount_entries)
    if [ "$entries" -eq 0 ]; then
        echo "not armed: nothing is mounted over $TARGET"
        return 1
    fi
    if [ "$entries" -gt 1 ]; then
        echo "NOT ARMED SAFELY: $entries mounts are stacked on $TARGET; run disarm"
        rc=1
    fi
    if [ "$TARGET" -ef "$PATCHED" ] 2>/dev/null; then
        echo "armed: $TARGET is the patched copy ($PATCHED), confirmed by inode identity"
    else
        echo "NOT ARMED: something other than $PATCHED is mounted over $TARGET"
        rc=1
    fi
    ours=$(grep -c -F "$OUR_APP_ID" "$TARGET" 2>/dev/null || true)
    theirs=$(grep -c -F "$HOME_APP_ID" "$TARGET" 2>/dev/null || true)
    if [ "$ours" = "2" ] && [ "$theirs" = "0" ]; then
        echo "armed: the mounted view dispatches Home to $OUR_APP_ID (2 sites, 0 left)"
    else
        echo "NOT ARMED: the mounted view reads ours=$ours theirs=$theirs"
        rc=1
    fi
    propagated=$(propagated_entries)
    if [ "$propagated" -gt 1 ]; then
        echo "armed: the mount propagated to $propagated namespaces ($((propagated - 1)) app jails)"
        echo "       under /mnt/lg/*/var/palm/jail/. Nothing runs the keyfilter from"
        echo "       inside a jail, so this is expected and harmless, but disarm has to"
        echo "       clear all of them."
    fi
    case "$(in_effect)" in
        yes)          echo "in effect: this sam process started after the mount" ;;
        yes-since-sam-restart)
                      echo "in effect: sam has restarted since the mount was placed" ;;
        no-dormant)   echo "DORMANT: this sam started before the mount, so it is running the"
                      echo "         stock keyfilter. 'restart sam' to make it live."
                      rc=1 ;;
        *)            echo "in effect: UNKNOWN, no state file or sam uptime unreadable. A mount"
                      echo "         with no state file was not placed by 'arm', so trust"
                      echo "         nothing here: the behavioural check decides." ;;
    esac
    return $rc
}

disarm() {
    # Lazy is required, not laziness: sam holds the file open, and the home is
    # CRIU-restored with its pid preserved, so killing it does not release it.
    # A plain umount says "target is busy" and leaves the takeover in place.
    if [ "$(mount_entries)" -gt 0 ]; then
        umount -l "$TARGET" 2>/dev/null || true
    fi
    rm -f "$PATCHED" /tmp/blades-systemUi.roundtrip.* "$STATE"
    if [ "$(mount_entries)" -gt 0 ]; then
        echo "disarm FAILED: $TARGET is still mounted"
        return 1
    fi
    # The unmount propagates to the peer group, but do not assume it: a jail left
    # holding the patched file means a sandboxed app can still read it, and this
    # is the last moment we can still name where.
    left=$(propagated_entries)
    if [ "$left" -gt 0 ]; then
        echo "disarm INCOMPLETE: $TARGET is clean, but $left namespace(s) still carry"
        echo "  the patched file. Unmount each, or reboot:"
        awk -v r="/${PATCHED##*/}" '$4 == r { print "    umount -l " $5 }' /proc/self/mountinfo
        return 1
    fi
    echo "disarmed: $TARGET is the stock file again and the patched copy is gone"
    echo "note: dormant-until-sam applies in reverse too -- 'restart sam' to make the"
    echo "      stock keyfilter live again, or reboot"
    return 0
}

case "${1:-}" in
    probe) probe ;;
    arm) arm ;;
    verify) verify ;;
    disarm) disarm ;;
    *) echo "usage: $0 probe|arm|verify|disarm" >&2; exit 2 ;;
esac
