# AGENTS.md — Blades

A faithful recreation of the **original Xbox 360 "Blades" dashboard** (2005–2008),
built as a webOS home app. It is a web app that runs from `file://` on a rooted
LG TV, and runs in desktop Chrome against a mock transport for development.

**Groundwork:** the framework (Vue 3.6 all-Vapor, Vite, Pinia, the focus layer,
the typed Luna wrapper and its mock, the test/lint/format toolchain) was copied
from `../weboshome-web` (LemmonLauncher). Its `PLAN.md` is still the reference
for *platform* facts — what the TV does, how Luna behaves, how to deploy. Its
UI and Tailwind layer were **not** carried over.

## Read first

- [`docs/BLADES-SPEC.md`](./docs/BLADES-SPEC.md) — visual + content spec of the
  real dashboard.
- [`docs/BLADES-MOTION.md`](./docs/BLADES-MOTION.md) — transition and
  second-level navigation behaviour, mined from video.
- [`docs/refs/`](./docs/refs/) — reference photographs. **Look at these.** Fidelity
  is judged against them, not against memory.

## Ground rules

- **No Tailwind, no CSS framework.** One hand-written stylesheet plus `<style>`
  blocks in SFCs. The Blades look is multi-stop gradients, bevels, rotated tab
  labels and glow pseudo-elements — none of that reads as utilities.
- **Chromium 108 is the floor.** `color-mix()` (111), `@property` (111), CSS
  nesting without `&` (112) are unavailable. Compute translucency in TS
  (`withAlpha` in `icons.ts`) or write rgba out. **Do not upgrade Tailwind —
  it is already gone.**
- **Animate only `transform` and `opacity`.** The TV reports
  `devicePixelRatio: 2`, so a 1920×1080 page rasterises at 3840×2160.
  Never animate `box-shadow` (a fresh blur each frame) — put glows on a
  pseudo-element with a static shadow and animate its `opacity`. Promote moving
  planes with `translateZ(0)`.
- **Keep the focus/navigation layer framework-agnostic and pure.** Navigation
  rules are the part worth testing; they must not touch the DOM, Vapor or the TV.
- Keep comments minimal. No separators, no em-dashes, no references to previous
  behaviour or to anyone's request.
- **bun** only — `bun install`, `bun run …`, `bunx …`. No npm/pnpm.
- `<script setup lang="ts" vapor>` only. `createVaporApp` comes from
  `@vue/runtime-vapor`, not `vue`. Vapor directives are plain functions
  `(el, valueGetter, arg, modifiers) => cleanup?` and the getter must be read
  inside `renderEffect()` to be reactive.

## Layout of the app

```
app/src/
  App.vue              the shell: blade stack, keyboard, top-level wiring
  blades/model.ts      Blade / BladeRow types, the canonical blade definitions
  blades/palette.ts    per-blade colour tokens (surface, spine, title)
  blades/focus.ts      pure navigation: which blade, which row
  components/          presentational pieces of a blade
  focus/               the original generic focus layer (v-focusable, grid rules)
  luna.ts, stores/, mock/   unchanged from the groundwork
  settings.ts, stores/settings.ts   persisted user settings
```

## Quick reference

```bash
bun install         # deps
bun run dev         # whole UI in desktop Chrome (mock Luna transport)
bun run check       # vue-tsc --noEmit
bun run verify      # check, lint, format:check and test, concurrently
bun run test        # vitest (jsdom)
bun run lint        # oxlint
bun run format      # oxfmt
./build.sh          # typecheck + bundle + ares-package -> dist/*.ipk
```

**Blade order is fixed.** The chrome artwork and `panelBox` are keyed to the
canonical order (Inputs, Apps, Games, Media, System) — each state's PNG shows a
specific number of leaves either side of its panel, and `panelBox` gives that
blade a fixed x range to match. Reordering blades would put a panel against the
wrong artwork, so there is deliberately no `bladeOrder` setting.

## On the TV

```bash
./build.sh && scp dist/ooo.lew.blades_*.ipk root@192.168.1.37:/tmp/
ssh -tt root@192.168.1.37 "luna-send-pub -w 90000 -i \
  'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/ooo.lew.blades_0.1.0_all.ipk\",\"subscribe\":true}' < /dev/null"

./tools/deploy.sh       # build + sync into the installed dir + restart
./tools/deploy.sh --service   # also sync service/, still opt-in and inert
./tools/restart.sh      # closeByAppId + launch
node tools/capture.mjs --keys 39 --state --shot /tmp/s.png
node tools/eval.mjs "<expression>"     # read the page over CDP :9998
APP_ID=ooo.lew.blades node tools/eval.mjs --console --wait 2000
```

- **`luna-send` needs `ssh -tt`**, and its stdin must be `/dev/null`.
- **Never restart the page with `Page.reload`.** It leaves the renderer updating
  the DOM without ever painting, so the screen freezes on the last frame it
  produced. `tools/restart.sh` closes and launches instead.
- CDP throttles the renderer hard: `capture.mjs` and `eval.mjs` both call
  `Page.bringToFront` first, or measurements come back stalled.
- `listLaunchPoints` needs `applications.internal` in
  `/mnt/lg/cmn_data/var/luna-service2-dev/client-permissions.d/ooo.lew.blades.app.json`.
  Install creates the file with `["public"]` only, which silently returns zero
  apps. **Undo: restore the snapshot and rescan services, in one line:**

  ```bash
  ssh root@192.168.1.37 'cp /var/lib/webosbrew/blades/backups/ooo.lew.blades.app.json \
    /mnt/lg/cmn_data/var/luna-service2-dev/client-permissions.d/ooo.lew.blades.app.json \
    && ls-control scan-services'
  ```

  `tools/deploy.sh` re-takes that snapshot on every run, onto the persistent
  `/var` overlay. The old backup AGENTS.md pointed at, `/tmp/*.bak`, was tmpfs
  and a reboot destroyed it, so there was no original left to restore.
- Make **no other persistent change** to the TV. No keyfilter edits, nothing
  under the stock home. The one bind mount this project owns, over
  `/usr/lib/qml/KeyFilters/systemUi.js`, is created on demand and is gone after
  a reboot.
- **Measure only while Blades is the foreground app.** A backgrounded page on
  this firmware has no timers and no animation frames, so a probe that waits on
  either hangs forever. Worse, the TV's own screensaver
  (`com.webos.app.lifeonscreen`) steals foreground on its own schedule, which
  makes a probe fail intermittently for reasons that have nothing to do with the
  code. Check `getForegroundAppInfo` first, launch right before measuring, and
  wrap every probe in a shell `timeout`.
- After `restart sam`, **nothing** is in the foreground (`appId` is `""`), so
  launch the app before measuring anything.

## The Home button

```bash
./tools/homectl.sh status          # what is armed, by whom, does it actually work
./tools/homectl.sh probe           # read-only capability report
./tools/homectl.sh quarantine      # park ooo.lew.customhome so nothing races for Home
./tools/homectl.sh arm             # take the Home key, then restart sam (~91s)
./tools/homectl.sh verify          # waits for a real Home press and judges it
./tools/homectl.sh disarm          # give it back, then restart sam
./tools/homectl.sh revert          # ONE COMMAND: disarm + unquarantine
```

The Home key is dispatched by QML JavaScript in
`/usr/lib/qml/KeyFilters/systemUi.js`, where the home app id is a hardcoded
string in exactly two places: line 31 `var HOME_APP_ID = "com.webos.app.home";`
and line 170 `applicationManager.launch("com.webos.app.home",`. We rewrite
those two into a copy on tmpfs and `mount --bind` it over the original, so Home
goes to `ooo.lew.blades` and LG's home is never launched, which is why there is
no flash. `service/tactics/3-keyfilter.sh` refuses to mount unless the result
round-trips byte-identically back to the stock file, so an unrecognised firmware
leaves the stock TV alone.

- **`sam` reads the keyfilters once, at startup.** So "armed" and "working" are
  different claims, and `restart sam` is required in *both* directions. Status
  reports "in effect" separately, and treats "dormant" as a failure.
- **`restart sam` is 90.5 s** and raises a screensaver partway through that
  looks like sleep. It is not asleep; any key clears it and the home returns on
  its own. Do not run it twice needlessly.
- **A mount existing is not evidence.** The only check that catches a silent
  no-op is a real Home press, read from `/var/log/messages`:
  `sam NL_APP_LAUNCH_BEGIN {"app_id":"ooo.lew.blades","caller_id":"com.webos.surfacemanager","mode":"hotKey"}`
  with no `NL_HOME_SHOWN`. `mode` and `caller` are what separate the keyfilter
  from a launch of ours and from the idle-timeout home.
- **`umount` needs `-l`.** The home holds its files open and is CRIU-restored
  with its pid preserved, so killing it does not release them; a plain `umount`
  says "target is busy" and leaves the takeover in place.
- **The Home key is consumed while Blades is foreground.** Blades *is*
  `HOME_APP_ID` as far as the keyfilter is concerned, so pressing Home on Blades
  does nothing. That is the stock home's own semantics and is intended. Get to
  Live TV or another app to press it from when testing.
- **There is no `init.d` hook, on purpose.** `init.d` runs ~29 s into boot and
  `sam` starts at ~5.5 s, so a hook's mount is ~124 s too late and stays
  dormant. It would also be this project's first reboot-persisting change. So a
  reboot is a total reset. `service/autostart.sh` exists and is deliberately not
  symlinked; if that ever changes, the undo is to **move the file out of**
  `init.d` (renaming to `*.disabled` does not disable it, this `run-parts` is
  BusyBox and runs dotted filenames) and reboot.
- **Revert everything: `./tools/homectl.sh revert`.** Nothing is ever deleted:
  the only file created is a patched copy on tmpfs, and the quarantined
  third-party home is `mv`'d aside, never removed.

Test locally with the browser: `bun run dev`, then open the dev URL. Arrow keys
navigate, Enter selects, Escape/Back returns. `?blade=games` opens on a blade.
