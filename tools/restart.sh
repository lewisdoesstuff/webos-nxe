#!/usr/bin/env bash
# Restart the app on the TV.
#
#   ./tools/restart.sh
#
# `Page.reload` over CDP leaves the renderer in a state where the DOM updates
# but nothing paints, so the screen freezes on the last frame it produced.
# Closing and launching through Luna gives WAM a clean start.
set -euo pipefail

TV_HOST="${TV_HOST:-root@192.168.1.37}"
APP_ID="${APP_ID:-ooo.lew.nxe}"

ssh -tt "$TV_HOST" "
  luna-send -n 1 -f luna://com.webos.applicationManager/closeByAppId \
    '{\"id\":\"${APP_ID}\"}' < /dev/null
  sleep 2
  luna-send -n 1 -f luna://com.webos.applicationManager/launch \
    '{\"id\":\"${APP_ID}\"}' < /dev/null
" 2>/dev/null | grep -o '"returnValue": *[a-z]*' || true

echo "restarted ${APP_ID} on ${TV_HOST}"
