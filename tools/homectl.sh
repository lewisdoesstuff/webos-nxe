#!/usr/bin/env bash
# Home-button control for Blades. The only thing in this repo that touches the TV.
#
#   ./tools/homectl.sh probe               read-only capability report
#   ./tools/homectl.sh status              what is armed, by whom, does it work
#   ./tools/homectl.sh quarantine          park ooo.lew.customhome, reversibly
#   ./tools/homectl.sh unquarantine        put it back
#   ./tools/homectl.sh arm                 patch + bind-mount, then restart sam
#   ./tools/homectl.sh verify              behavioural: watch for a real Home press
#   ./tools/homectl.sh disarm              umount -l, then restart sam
#   ./tools/homectl.sh watch               the read-only /dev/input fallback
#   ./tools/homectl.sh watch-discover      learn which node carries Home
#   ./tools/homectl.sh revert              one command: disarm + unquarantine
#
# Every path echoes the exact command it runs and the command's output.
#
# The mechanism: the Home key is dispatched by QML JavaScript in
# /usr/lib/qml/KeyFilters/systemUi.js, where the home app id is a hardcoded
# string in exactly two places. We rewrite those two into a copy on tmpfs and
# `mount --bind` it over the original. No persistent partition is written, no
# init.d hook exists, so a reboot is a total reset.
#
# sam reads the keyfilters once, at startup. So "armed" and "working" are
# different claims, `restart sam` (90.5 s, and it raises a screensaver that looks
# like sleep) is required in both directions, and status reports the difference.
set -uo pipefail

TV_HOST="${TV_HOST:-root@192.168.1.37}"
APP_ID="${APP_ID:-ooo.lew.blades}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SERVICE="$HERE/../service"

KEYFILTER=/usr/lib/qml/KeyFilters/systemUi.js
HOME_QML=/usr/palm/applications/com.webos.app.home/qml
CUSTOMHOME_HOOK=/var/lib/webosbrew/init.d/49-custom-homescreen
CUSTOMHOME_OFF=/var/lib/webosbrew/init.d.off/49-custom-homescreen
RESTART_SAM_SECONDS=91

TRACE=1
# LogLevel=ERROR drops the "not using a post-quantum key exchange" banner, which
# otherwise lands in the middle of every captured result and reads as output.
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8 -o LogLevel=ERROR)

say() { printf '%s\n' "$*"; }
rule() { printf '%s\n' "------------------------------------------------------------------------"; }
title() { printf '\n%s\n%s\n' "$*" "$(printf '%.0s-' {1..72})"; }

# Run a command on the TV, showing the command and its output.
tv() {
  local cmd="$*"
  [[ $TRACE == 1 ]] && printf '\n$ ssh %s %s\n' "$TV_HOST" "$cmd"
  local output rc
  output=$(ssh "${SSH_OPTS[@]}" "$TV_HOST" "$cmd" 2>&1)
  rc=$?
  [[ -n $output ]] && printf '%s\n' "$output"
  [[ $TRACE == 1 ]] && printf '[exit %d]\n' "$rc"
  return $rc
}

# Same, but only the output, for values we fold into a report.
tvq() { ssh "${SSH_OPTS[@]}" "$TV_HOST" "$*" 2>/dev/null; }

# luna-send needs a pty, or it silently returns nothing.
tvt() {
  local cmd="$*"
  [[ $TRACE == 1 ]] && printf '\n$ ssh -tt %s %s\n' "$TV_HOST" "$cmd"
  local output rc
  output=$(ssh -tt "${SSH_OPTS[@]}" "$TV_HOST" "$cmd" </dev/null 2>/dev/null)
  rc=$?
  [[ -n $output ]] && printf '%s\n' "$output"
  [[ $TRACE == 1 ]] && printf '[exit %d]\n' "$rc"
  return $rc
}

# Stream one of our scripts to the TV over stdin. Nothing is installed there.
tv_script() {
  local script="$1"
  shift
  local args=""
  for a in "$@"; do args="$args '$a'"; done
  [[ $TRACE == 1 ]] && printf '\n$ ssh %s sh -s --%s  < %s\n' "$TV_HOST" "$args" "$script"
  local output rc
  output=$(ssh "${SSH_OPTS[@]}" "$TV_HOST" "sh -s -- $* < /dev/stdin" <"$script" 2>&1)
  rc=$?
  [[ -n $output ]] && printf '%s\n' "$output"
  [[ $TRACE == 1 ]] && printf '[exit %d]\n' "$rc"
  return $rc
}

mount_count() { tvq "awk '\$5 == \"$KEYFILTER\"' /proc/self/mountinfo | wc -l" | tr -d ' '; }
home_mount_count() { tvq "awk '\$5 == \"$HOME_QML\"' /proc/self/mountinfo | wc -l" | tr -d ' '; }

# ---------------------------------------------------------------- log reading

# /var/log/messages is the instrument. A Home press is:
#   lginput2 NL_BUTTON_CLICK {"button_type":"KEY_HOME"}
# and the keyfilter's launch is distinguishable from every other route by
#   sam NL_APP_LAUNCH_BEGIN {"app_id":...,"caller_id":"com.webos.surfacemanager","mode":"hotKey"}
# A launch we asked for ourselves carries caller_id com.webos.lunasend-<pid> and
# mode "normal", and the idle-timeout home carries mode "last_input". So mode and
# caller, not app_id alone, are what tell the rungs apart.
classify() {
  awk -v app="$APP_ID" '
    function trim(s) { sub(/^[ \t]+/, "", s); return s }
    /NL_BUTTON_CLICK/ && /KEY_HOME/ { press = NR; n = 0; next }
    press > 0 && n < 40 {
      line = trim($0)
      n++
      if (line ~ /NL_APP_LAUNCH_BEGIN/) {
        byfilter = (line ~ /"mode":"hotKey"/ && line ~ /com\.webos\.surfacemanager/)
        if (line ~ ("\"app_id\":\"" app "\"")) {
          dispatched = 1
          if (byfilter) bykeyfilter = 1; else byus = 1
        } else if (line ~ /"app_id":"com\.webos\.app\.home"/) {
          stocklaunched = 1
          if (byfilter) stockbyfilter = 1
        }
      }
      if (line ~ /NL_HOME_SHOWN/) homeshown = 1
      if (line ~ /HOME_IGNORED/) ignored = 1
      if (line ~ /NL_VSC/) {
        if (line ~ ("\"app_id\":\"" app "\"") && line ~ /"visible":true/) visible = 1
        if (line ~ /"app_id":"com\.webos\.app\.home"/ && line ~ /"visible":true/) stockvisible = 1
      }
    }
    END {
      if (!press)                  { print "no-press"; exit }
      if (ignored)                 { print "failed: launchHomeApp() returned early, HOME_IGNORED"; exit }
      if (bykeyfilter && stockbyfilter) { print "failed: the keyfilter launched us AND launched the stock home"; exit }
      if (bykeyfilter && stockvisible)  { print "failed: the keyfilter sent us, but the stock home also came up (flash)"; exit }
      if (bykeyfilter && visible)       { print "verified"; exit }
      if (bykeyfilter)              { print "partial: the keyfilter dispatched to us but we never went visible"; exit }
      if (stockbyfilter)            { print "failed: the keyfilter still launches the stock home"; exit }
      if (stockvisible)              { print "failed: the stock home came to the foreground, we were not dispatched to"; exit }
      if (byus)                     { print "unrelated: we launched ourselves, not from the Home key"; exit }
      if (stocklaunched)            { print "note: the stock home was launched, but by the idle timer, not the keyfilter"; exit }
      print "failed: the press was logged but nothing was dispatched at all"
    }
  '
}

fetch_log() { tvq "cat /var/log/messages"; }

# The log's bracketed field is uptime in seconds, which makes an old press
# directly comparable to the mount's uptime. That comparison is what stops a
# pre-arming press from being read as a live failure.
last_press_uptime() {
  fetch_log | awk '/NL_BUTTON_CLICK/ && /KEY_HOME/ { split($2, a, /[][]/); u = a[2] } END { if (u != "") printf "%.2f", u }'
}
last_press_stamp() {
  fetch_log | awk '/NL_BUTTON_CLICK/ && /KEY_HOME/ { t = $1 } END { if (t != "") print t }'
}
mounted_at_uptime() { tvq "sed -n 's/^mounted_at_uptime=//p' /tmp/blades-homerung3.state 2>/dev/null"; }

# Which app is in the foreground. Needed because Home is *supposed* to be a
# no-op when Blades is already foreground, and "no dispatch at all" means
# something completely different in that case than when Live TV is up.
foreground_app() {
  tvt "luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}'" \
    | tr -d ' \n' | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p'
}

log_line_count() { fetch_log | wc -l | tr -d ' '; }

# ------------------------------------------------------------------- the rungs

rung3() { tv_script "$SERVICE/tactics/3-keyfilter.sh" "$@"; }
rung5() { tv_script "$SERVICE/tactics/5-watch-launch.sh" "$@"; }

restart_sam() {
  say ""
  say "restarting sam. This takes ~${RESTART_SAM_SECONDS}s."
  say "The TV will raise a screensaver partway through, which looks like sleep."
  say "It is not asleep: any key clears it and the home comes back on its own."
  rule
  tv "/sbin/restart sam"
  rule
  say "sam restarted. Nothing has been relaunched by hand and nothing needs to be."
}

# ------------------------------------------------------------------ commands

cmd_probe() {
  title "probe: what this firmware allows (read-only, changes nothing)"
  say ""
  say "Firmware and platform"
  tv "cat /etc/*release*"
  tvt "luna-send -n 1 -f luna://com.webos.service.config/getConfigs \\
    '{\"configNames\":[\"tv.nyx.platformCode\",\"com.webos.surfacemanager.keyFiltersCpp\"]}'"
  say "  keyFiltersCpp must stay in missingConfigs. If it appears, the QML"
  say "  keyfilters are no longer the live dispatch path and rung 3 is dead."
  say ""
  say "The Home dispatch sites"
  tv "grep -n 'com.webos.app.home\"' $KEYFILTER"
  say "  Exactly 2 lines, both hardcoded. If this shape ever changes, rung 3"
  say "  refuses to arm rather than guessing."
  say ""
  say "Rung 3, the keyfilter bind-mount"
  rung3 probe
  say ""
  say "Rung 5, the read-only watcher"
  rung5 probe
  say ""
  say "The target app"
  tv "ls -la /media/developer/apps/usr/palm/applications/$APP_ID/appinfo.json"
  say ""
  say "Third-party home, which must be quarantined before any measurement"
  tv "ls -la $CUSTOMHOME_HOOK $CUSTOMHOME_OFF 2>&1"
  tv "awk '\$5 == \"$HOME_QML\"' /proc/self/mountinfo"
}

cmd_status() {
  local saved_trace=$TRACE
  if [[ "${1:-}" == "--brief" ]]; then TRACE=0; fi

  title "status: what is armed on $TV_HOST, by whom, and whether it works"

  say ""
  say "RUNG 3  keyfilter bind-mount over $KEYFILTER"
  local m3 v3
  m3=$(mount_count)
  if [[ $m3 == "0" ]]; then
    say "  mount        : not armed (nothing mounted over the keyfilter)"
    say "  armed by     : -"
  else
    say "  mount        : ARMED, $m3 mount(s) over the keyfilter"
    say "  armed by     : tools/homectl.sh arm, recorded in /tmp/blades-homerung3.state"
  fi
  v3=$(rung3 verify 2>&1)
  printf '%s\n' "$v3" | sed 's/^/  /'
  [[ $v3 == *"in effect"* ]] && say "  in effect    : YES, the running sam is using the patch"
  [[ $v3 == *"DORMANT"* ]] && say "  in effect    : NO, dormant. 'homectl.sh arm' restarts sam."

  say ""
  say "RUNG 5  read-only /dev/input watcher (the floor and the verifier)"
  local v5
  v5=$(rung5 verify 2>&1)
  printf '%s\n' "$v5" | sed 's/^/  /'

  say ""
  say "BEHAVIOUR  the only check that catches a silent no-op"
  local verdict press_up press_at mount_up stale=0
  verdict=$(fetch_log | classify)
  press_up=$(last_press_uptime)
  press_at=$(last_press_stamp)
  mount_up=$(mounted_at_uptime)
  say "  last Home press in /var/log/messages: $verdict"
  if [[ -n $press_up ]]; then
    say "  that press was at uptime ${press_up}s (${press_at})"
    if [[ -n $mount_up ]] && awk -v p="$press_up" -v m="$mount_up" 'BEGIN { exit !(p < m) }'; then
      stale=1
      say "  STALE: the mount was not placed until uptime ${mount_up}s, so that press"
      say "         PREDATES the arming. It describes the stock TV and says nothing"
      say "         about the takeover. The takeover is UNVERIFIED so far."
    fi
  else
    stale=1
    say "  no Home press has ever been logged, so there is nothing to judge."
  fi
  if [[ $stale == 0 ]]; then
    case "$verdict" in
      verified) say "  meaning: Home went to $APP_ID, and the stock home never launched" ;;
      *:*)     say "  meaning: the Home key is not reaching us. Read the reason above;"
                say "           'homectl.sh verify' waits for a fresh press and re-judges it." ;;
      *)       say "  meaning: unexpected. 'homectl.sh verify' re-reads the log for a"
                say "           fresh press. Do not read the mount as proof." ;;
    esac
    say "  to re-check after a press: ./tools/homectl.sh status"
  else
    say "  to settle it: press Home from Live TV, then ./tools/homectl.sh status"
  fi

  say ""
  say "THIRD-PARTY HOME  ooo.lew.customhome"
  if [[ -n $(tvq "test -e $CUSTOMHOME_HOOK && echo live") ]]; then
    say "  hook         : LIVE, $CUSTOMHOME_HOOK"
    say "  armed by     : ooo.lew.customhome/apply.sh, from webosbrew init.d at boot"
  else
    say "  hook         : parked in $CUSTOMHOME_OFF (quarantined by tools/homectl.sh quarantine)"
  fi
  say "  qml bind     : $(home_mount_count) mount(s) over $HOME_QML"
  if [[ $(home_mount_count) != "0" ]]; then
    say "  effect       : the Home key opens this patched third-party home, not stock LG"
    say "                 Home and not Blades. Quarantine it before measuring anything."
  fi

  say ""
  say "PERSISTENCE"
  say "  nothing of ours is written to a persistent partition and there is no"
  say "  init.d hook, so a reboot reverts every mount above. Nothing re-arms."
  say ""
  say "REVERT (one command, restores the TV to exactly the state above):"
  say "  ./tools/homectl.sh revert"
  rule
  TRACE=$saved_trace
}

cmd_quarantine() {
  local do_sam=1
  [[ "${1:-}" == "--no-sam" ]] && do_sam=0

  title "quarantine: park $CUSTOMHOME_HOOK"
  say ""
  say "Nothing is deleted. The hook symlink is moved to $CUSTOMHOME_OFF"
  say "(renaming it to *.disabled would NOT disable it: this run-parts is BusyBox"
  say "and executes dotted filenames), the qml bind mount is dropped, and the home"
  say "is restarted so it re-reads its own stock QML."
  say ""
  say "Restoring is: homectl.sh unquarantine"

  say ""
  say "Before:"
  tv "ls -la $CUSTOMHOME_HOOK"

  if [[ -n $(tvq "test -e $CUSTOMHOME_OFF && echo parked") ]]; then
    say "already quarantined: $CUSTOMHOME_OFF exists, nothing to move"
  elif [[ -n $(tvq "test -e $CUSTOMHOME_HOOK && echo live") ]]; then
    tv "mkdir -p /var/lib/webosbrew/init.d.off"
    tv "mv $CUSTOMHOME_HOOK $CUSTOMHOME_OFF"
    say "moved: $CUSTOMHOME_HOOK  ->  $CUSTOMHOME_OFF"
    say "        (it is a symlink to ooo.lew.customhome/apply.sh; mv keeps it intact)"
  else
    say "nothing to do: the hook is in neither init.d nor init.d.off"
  fi

  say ""
  say "After:"
  tv "ls -la $CUSTOMHOME_HOOK $CUSTOMHOME_OFF 2>&1"

  say ""
  say "Dropping the qml bind mount. Lazy is required: the home holds its own files"
  say "open and is CRIU-restored with its pid preserved, so killing it does not"
  say "release them and a plain umount says 'target is busy'."
  say "Processes that will be signalled:"
  tv "pgrep -af '^/usr/bin/com\\.webos\\.app\\.home'"
  tv "umount -l $HOME_QML"
  tv "awk '\$5 == \"$HOME_QML\"' /proc/self/mountinfo; echo \"(empty above means the mount is gone)\""
  tv "pkill -f '^/usr/bin/com\\.webos\\.app\\.home'; sleep 2; pgrep -af '^/usr/bin/com\\.webos\\.app\\.home' || echo 'stock home is not running'"

  if [[ $do_sam == 1 ]]; then
    say ""
    say "restarting sam so it stops running the third-party QML it already loaded."
    restart_sam
  else
    say ""
    say "skipped the sam restart (--no-sam). The third-party QML stays loaded in the"
    say "running sam until it restarts, so the Home key still opens it for now."
  fi

  say ""
  say "Quarantined. The Home key is now stock LG Home."
}

cmd_unquarantine() {
  title "unquarantine: put $CUSTOMHOME_HOOK back"
  say ""
  say "Runs the third party's own apply.sh, which umounts, recopies the stock QML,"
  say "patches it, bind-mounts it back and restarts the home. That is exactly what"
  say "it does at every boot, so this restores the previous behaviour faithfully."
  say ""

  if [[ -z $(tvq "test -e $CUSTOMHOME_OFF && echo parked") ]]; then
    say "nothing to do: $CUSTOMHOME_OFF does not exist, so the hook was never parked"
    return 0
  fi

  tv "mv $CUSTOMHOME_OFF $CUSTOMHOME_HOOK"
  say "moved back: $CUSTOMHOME_OFF  ->  $CUSTOMHOME_HOOK"
  tv "run-parts --test /var/lib/webosbrew/init.d"
  say ""
  say "Running apply.sh (verbose, -x). This is the third party's script, not ours."
  tv "/media/developer/apps/usr/palm/applications/ooo.lew.customhome/apply.sh"
  say ""
  say "After:"
  tv "ls -la $CUSTOMHOME_HOOK"
  tv "awk '\$5 == \"$HOME_QML\"' /proc/self/mountinfo"
  say ""
  say "Restored. The Home key opens the patched third-party home again."
  say "To make Blades the home instead: ./tools/homectl.sh quarantine && ./tools/homectl.sh arm"
}

cmd_arm() {
  local do_sam=1
  [[ "${1:-}" == "--no-sam" ]] && do_sam=0

  title "arm: rung 3, the keyfilter bind-mount"

  say ""
  say "Guard: the old third-party home must be quarantined first. Two things"
  say "racing for the Home key makes any measurement meaningless, and a rung 3"
  say "arming is a switch, not a coexistence mode."
  if [[ -n $(tvq "test -e $CUSTOMHOME_HOOK && echo live") ]]; then
    say ""
    say "REFUSING: $CUSTOMHOME_HOOK is still live."
    say "  ./tools/homectl.sh quarantine   (reversible)"
    say "  ./tools/homectl.sh unquarantine  (undo)"
    return 1
  fi
  say "  OK, the hook is parked."

  say ""
  say "Also required: Blades must be launchable, so a failed takeover has a"
  say "known-good target rather than two variables at once."
  tv "test -f /media/developer/apps/usr/palm/applications/$APP_ID/appinfo.json && echo 'app is installed'"

  say ""
  rung3 arm || return 1

  if [[ $do_sam == 0 ]]; then
    say ""
    say "Skipped the sam restart (--no-sam). The mount is in place but DORMANT:"
    say "sam read the keyfilters before it existed. Nothing will change until sam"
    say "restarts. Run './tools/homectl.sh arm' without --no-sam, or reboot."
    return 0
  fi

  say ""
  say "The mount is in place but dormant: this sam read the keyfilters before it"
  say "existed. It only takes effect once sam starts again, which is why the"
  say "restart below is not optional."
  restart_sam

  say ""
  say "Now prove it works. A mount existing is not evidence; the Home key going"
  say "somewhere specific is. This waits for you to press it:"
  say "  ./tools/homectl.sh verify"
}

cmd_verify() {
  local wait_secs=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --wait) wait_secs="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  [[ $wait_secs == 0 ]] && wait_secs=45

  title "verify: does the Home key actually reach $APP_ID?"

  say ""
  say "Static checks first. These cannot prove the takeover works, which is the"
  say "point: on a firmware that silently ignores the patch, every one of them"
  say "passes."
  # Not `local static_rc=$?`: inside a function bash evaluates that as 0, which
  # would make this diagnostic claim the static checks passed no matter what.
  local static_rc
  rung3 verify
  static_rc=$?
  say ""
  say "Last press recorded before this run, for reference only. It may predate"
  say "the arming, in which case it describes the stock TV and proves nothing."
  say "  $(fetch_log | classify)"
  say "  at uptime $(last_press_uptime)s, $(last_press_stamp)"

  say ""
  rule
  say "Now the behavioural check."
  say ""
  say "  PRESS THE HOME BUTTON ON THE REMOTE NOW."
  say ""
  say "Get off Blades first if you are on it: with Blades in the foreground the"
  say "Home key is meant to be consumed and do nothing, which is the correct"
  say "behaviour and would look like a failure here. Live TV or another app is"
  say "the right place to press it from."
  say ""
  local before_fg
  before_fg=$(foreground_app)
  say "In the foreground right now: ${before_fg:-unknown}"
  if [[ $before_fg == "$APP_ID" ]]; then
    say "  That is Blades, so a no-op here is EXPECTED, not a failure. Switch to"
    say "  Live TV and press again for a test that means something."
  fi
  say ""
  say "Waiting up to ${wait_secs}s for lginput2 NL_BUTTON_CLICK KEY_HOME ..."
  rule

  local tmp
  tmp=$(mktemp)
  ssh "${SSH_OPTS[@]}" "$TV_HOST" "timeout $((wait_secs + 5)) tail -n 0 -F /var/log/messages" \
    </dev/null >"$tmp" 2>/dev/null &
  local tail_pid=$!

  local waited=0 got=0
  while [[ $waited -lt $wait_secs ]]; do
    if grep -q 'KEY_HOME' "$tmp" 2>/dev/null; then got=1; break; fi
    sleep 0.5
    waited=$((waited + 1))
    [[ $((waited % 10)) -eq 0 ]] && say "  ... ${waited}s"
  done

  if [[ $got == 1 ]]; then
    # Let the dispatch and the visible-surface change land.
    sleep 2
  fi
  kill "$tail_pid" 2>/dev/null
  wait "$tail_pid" 2>/dev/null

  say ""
  say "The press, and everything the TV logged in response:"
  if [[ -s $tmp ]]; then
    sed 's/^/  /' "$tmp"
  else
    say "  (nothing was logged)"
  fi

  say ""
  rule
  # Judge ONLY the lines captured during this wait. The whole log also contains
  # older presses, and the last one may predate the arming entirely, in which
  # case it describes the stock TV and would be reported as a live failure.
  local verdict
  verdict=$(classify <"$tmp")
  say "VERDICT: $verdict"
  rule
  rm -f "$tmp"

  case "$verdict" in
    verified)
      say ""
      say "CONFIRMED. The keyfilter dispatched Home to $APP_ID, it went visible, and"
      say "the stock home was never launched, so there is no flash. That is the whole"
      say "point of rung 3 over rung 5."
      say ""
      say "Static checks had exit $static_rc. Read that as 'the mount is where it"
      say "should be'. The line above is the one that counts."
      return 0
      ;;
    no-press)
      say ""
      say "UNVERIFIED: no Home press reached the keyfilter within ${wait_secs}s."
      say "Nothing can be concluded either way. Press Home from Live TV or another"
      say "app and run './tools/homectl.sh status' to re-read the verdict; status"
      say "keeps the last press so you do not have to catch it live."
      return 1
      ;;
    *"nothing was dispatched at all"*)
      if [[ $before_fg == "$APP_ID" ]]; then
        say ""
        say "EXPECTED NO-OP, NOT A FAILURE. Blades was in the foreground when you"
        say "pressed, and Blades is now what the keyfilter calls the home, so the"
        say "key is consumed and nothing is dispatched. That is the stock home's own"
        say "semantics and it is what we want."
        say ""
        say "To get a verdict that means something, switch to Live TV and press Home"
        say "again:  ./tools/homectl.sh verify"
        return 1
      fi
      say ""
      say "FAILED. The press was logged, Blades was not in the foreground, and"
      say "nothing at all was dispatched. The keyfilter did not act on the key."
      say ""
      say "  ./tools/homectl.sh revert          one command, back to where you were"
      say "  ./tools/homectl.sh watch           rung 5, which does not need the mount"
      return 1
      ;;
    *)
      say ""
      say "FAILED. The mount is in place and reads correctly, and Home still does"
      say "not go to us. This is the silent no-op, and it means rung 3 is not"
      say "carrying this firmware."
      say ""
      say "  ./tools/homectl.sh revert          one command, back to where you were"
      say "  ./tools/homectl.sh watch           rung 5, which does not need the mount"
      return 1
      ;;
  esac
}

cmd_disarm() {
  local do_sam=1
  [[ "${1:-}" == "--no-sam" ]] && do_sam=0

  title "disarm: drop the keyfilter bind mount"
  say ""
  say "Safe to run when nothing is armed. Nothing is deleted: the only file we"
  say "created is the patched copy on tmpfs, and /tmp is tmpfs, so it has already"
  say "vanished across any reboot."
  say ""

  local before dropped=0
  before=$(mount_count)
  if [[ $before == "0" ]]; then
    say "not armed: nothing is mounted over $KEYFILTER, so there is nothing to undo"
  else
    rung3 disarm || return 1
    dropped=1
  fi

  if [[ $do_sam == 0 ]]; then
    say ""
    say "Skipped the sam restart (--no-sam). Careful: this sam loaded the patched"
    say "keyfilter into memory at startup, so the Home key will STILL open"
    say "$APP_ID until sam restarts, even though the mount is gone."
    say "Status will correctly say the mount is gone and nothing is armed."
    return 0
  fi

  if [[ $dropped == 0 ]]; then
    say ""
    say "No sam restart. Nothing was armed, so the running sam is not holding a"
    say "patched keyfilter, and a 91 s restart would buy nothing."
    return 0
  fi

  say ""
  say "The reverse of arming also needs sam: it read the patched keyfilter into"
  say "memory at startup, so dropping the mount alone does not change behaviour."
  restart_sam

  say ""
  say "Disarmed. The Home key is stock again, and 'status' should now report"
  say "not armed and a last press that went to com.webos.app.home."
  say ""
  say "A reboot would have done the same thing for free."
}

cmd_watch() {
  local duration=120
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --duration) duration="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  title "watch: rung 5, the read-only fallback, for ${duration}s"
  say ""
  say "Opens the remote's input device read-only. No EVIOCGRAB, no uinput, no"
  say "system file touched. Home is vendor code 773, above KEY_MAX, so uinput can"
  say "neither advertise nor inject it: reading is the only way to see the key."
  say ""
  say "This costs a visible flash of the stock home, because it lets LG's home win"
  say "the race and then launches us on top. That is why rung 3 exists."
  say ""
  say "Press Home on the remote while this runs."
  rule
  local rc
  ssh "${SSH_OPTS[@]}" "$TV_HOST" "timeout $((duration + 10)) python3 - --app-id $APP_ID --duration $duration" \
    <"$SERVICE/blades-watch.py"
  rc=$?
  rule
  say ""
  say "The watcher changes nothing, so there is nothing to undo. Stop it with ^C."
  return $rc
}

cmd_watch_discover() {
  local duration=20
  title "watch-discover: log key events from every input device, for ${duration}s"
  say ""
  say "Use this to learn which node carries Home rather than assuming. The node"
  say "number is not stable across reboots, and watching the wrong one fails"
  say "silently."
  say ""
  say "Press Home, then Volume Up, on the remote while this runs."
  rule
  ssh -o BatchMode=yes "$TV_HOST" "timeout $((duration + 10)) python3 - --discover --duration $duration" \
    <"$SERVICE/blades-watch.py"
}

cmd_revert() {
  local do_sam=1
  [[ "${1:-}" == "--no-sam" ]] && do_sam=0

  title "revert: back to the state the TV was in before any of this"
  say ""
  say "In order: drop our mount, put the third-party home back, then one sam"
  say "restart so the running sam stops holding the patched keyfilter in memory."
  say ""

  local dropped=0
  if [[ $(mount_count) != "0" ]]; then
    rung3 disarm || return 1
    dropped=1
  else
    say "rung 3 was not armed, nothing to drop"
  fi
  say ""

  if [[ -n $(tvq "test -e $CUSTOMHOME_OFF && echo parked") ]]; then
    say "restoring the third-party home"
    cmd_unquarantine
  else
    say "the third-party home was never quarantined, nothing to restore"
  fi

  if [[ $do_sam == 0 ]]; then
    say ""
    say "Skipped the sam restart (--no-sam)."
  elif [[ $dropped == 0 ]]; then
    say ""
    say "No sam restart. Rung 3 was not armed, so no patched keyfilter is loaded in"
    say "the running sam, and apply.sh already restarted the home itself."
  else
    say ""
    say "One sam restart. The mount is gone, but this sam read the patched"
    say "keyfilter into memory at startup and will keep dispatching Home to us"
    say "until it restarts. Restoring the qml mount alone is not enough."
    restart_sam
  fi

  say ""
  rule
  say "REVERTED. ./tools/homectl.sh status to confirm."
  say ""
  say "A reboot would also have reverted the mounts, but not the quarantined hook:"
  say "that lives on disk and only comes back if you put it back or reboot with"
  say "the mv undone."
  rule
}

usage() {
  cat <<'EOF'
usage: tools/homectl.sh <command>

  probe             read-only capability report for this firmware
  status [--brief]  what is armed, by whom, and whether it works
  quarantine        park ooo.lew.customhome so nothing races for the Home key
  unquarantine      put it back
  arm [--no-sam]    patch + bind-mount the keyfilter, then restart sam
  verify [--wait N] wait for a real Home press and judge the dispatch (default 45s)
  disarm [--no-sam] drop the mount, then restart sam
  watch [--duration N]   the read-only /dev/input fallback, in the foreground
  watch-discover    log key events from every input device
  revert            disarm + unquarantine, in one command

environment: TV_HOST (default root@192.168.1.37)  APP_ID (default ooo.lew.blades)
EOF
}

main() {
  case "${1:-}" in
    probe) cmd_probe ;;
    status) shift; cmd_status "$@" ;;
    quarantine) shift; cmd_quarantine "$@" ;;
    unquarantine) cmd_unquarantine ;;
    arm) shift; cmd_arm "$@" ;;
    verify) shift; cmd_verify "$@" ;;
    disarm) shift; cmd_disarm "$@" ;;
    watch) shift; cmd_watch "$@" ;;
    watch-discover) cmd_watch_discover ;;
    revert) shift; cmd_revert "$@" ;;
    ""|-h|--help|help) usage ;;
    *) say "homectl.sh: unknown command '$1'"; echo; usage; exit 2 ;;
  esac
}

main "$@"
