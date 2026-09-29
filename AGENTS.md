# AGENTS.md — XNE

A recreation of the **Xbox 360 "New Xbox Experience" dashboard as it launched in
November 2008**, built as a webOS home app. It runs from `file://` on a rooted LG
TV and in desktop Chrome against a mock transport for development.

**Groundwork** is the webOS platform layer from `../webos-blades`: Vue 3.6
all-Vapor, Vite, Pinia, the focus layer, the typed Luna wrapper and its mock, the
sound engine, the HDMI preview capture, and the test/lint/format toolchain. Its
UI was **not** carried over. `../webos-blades/docs/HOME-BUTTON.md` is still the
reference for *platform* facts — what the TV does, how Luna behaves, how to
deploy — and `../weboshome-web/PLAN.md` before that.

## Read first

- [`docs/STATUS.md`](./docs/STATUS.md) — **where this is and what is verified.**
  Start here.
- [`docs/PLAN.md`](./docs/PLAN.md) — **what is left**, split into small feature
  tasks and design tasks.
- [`docs/REFERENCES.md`](./docs/REFERENCES.md) — the retail frames and what they
  settle. `tools/refs.sh` rebuilds them; `tools/compare.mjs` compares against
  them. **Check every visual change against a frame.**
- [`docs/PERF.md`](./docs/PERF.md) — the measured bandwidth ceiling and the rules
  that follow from it. **The design rests on this; read it before touching the
  DOM.**
- [`docs/research/NXE-XUI.md`](./docs/research/NXE-XUI.md) — numbers read out of
  retail build 9199's scene graphs. **`GuideMain.xui` is the Guide overlay, not
  the hub**; the hub is measured off frames (REFERENCES.md). `DESIGN-HUB.md`
  predates that finding: its surface ideas hold, its geometry does not.
- [`docs/research/NXE-EXISTING.md`](./docs/research/NXE-EXISTING.md) — where
  those numbers came from, the corroborating recreations, and the licensing
  position.

## Ground rules

- **Author at 1920x1080 and render 1:1.** NXE was a 720p interface, so its numbers
  are **proportions**: divide by 1.5. Measured on the TV with `tools/raster.mjs`,
  the root layer reports 1920x1080, not 3840x2160, so a full-frame layer is
  7.9MB and the whole app is 30 layers and 21.9MB. The earlier claim that dpr 2
  forces a 33.2MB full-frame layer was wrong, and the 720p-and-scale-up build it
  justified piled the entire interface into the top 45% of the screen.
- **A transition must not allocate.** Every layer it will draw is a texture that
  already exists before the key press, and no layer spans the frame unless it
  fills it. LG-XMB holds 102% through a transition on this hardware with a
  byte-identical layer set; that is the bar. `tools/gate.mjs` enforces it.
- **Animate only `transform` and `opacity`.** Never animate `box-shadow`. Put
  glows on a pseudo-element with a static shadow and animate its opacity. Promote
  anything that moves, because a transform on an unpromoted box repaints it every
  frame — and remember a promoted layer's texture is fixed at rest, so promotion
  is what makes a move free.
- **`LayerTree` reports CSS pixels here.** `layer.width` is the element's CSS box
  and is unaffected by transforms, so a layer's texture is `w * h * 4`. Measured:
  the root layer is 1920x1080 at `devicePixelRatio: 2`. The inherited
  `tools/layers.mjs` multiplies by the dpr again and reports every layer 4x too
  large; `tools/raster.mjs` exists to settle this rather than argue it.
- **Keep the focus and navigation layer framework-agnostic and pure.** Navigation
  rules are the part worth testing; they must not touch the DOM, Vapor or the TV.
- **Chromium 108 is the floor.** `color-mix()` (111), `@property` (111) and CSS
  nesting without `&` (112) are unavailable. Compute translucency in TS or write
  rgba out.
- **No Tailwind, no CSS framework.** One hand-written stylesheet plus `<style>`
  blocks in SFCs.
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
  App.vue              the shell: channel list, pane row, page, Guide, keys
  hub.ts               hub geometry and navigation, pure
  hubRows.ts           synthetic rows: System settings panes, "All" panes
  boot*.ts             the WebGL boot: timing, keyframes, shader, theme
  paths.ts             the `hack` prefix, for reaching outside the app directory
  luna.ts, mock/       the typed Luna wrapper and its desktop mock
  stores/              apps (launch points) and persisted settings
  focus/               the generic focus layer
  sound/               menu blips and background music
  preview/             HDMI input stills
  screensaver/         idle tracking
  styles/main.css      the dashboard's stylesheet
tools/
  gate.mjs             the transition gate: allocates nothing, or fails
  layers.mjs           compositor layer tree, sizes, per-element histogram
  trace.mjs            Chromium timeline
  eval.mjs             run an expression in the page over CDP
  capture.mjs          screenshot the TV with key presses
  compare.mjs          screenshot the dev build beside a reference frame
  refs.sh              rebuild docs/refs/ from the source videos
  deploy.sh            build and sync into the installed dir
  restart.sh           closeByAppId and launch
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

## The gate

```bash
node tools/gate.mjs                     # the TV, CDP :9998, arrow right
node tools/gate.mjs --keys 37
node tools/gate.mjs --at 60,150,300      # when to sample mid-transition
CDP_URL=http://localhost:9222 node tools/gate.mjs --match localhost
```

Exits 0 pass, 1 fail, 2 untrustworthy. Run it after any change to what moves.
It needs a real compositor, so it will not run against headless Chrome.

## On the TV

The full procedure, the Luna ACL grant, the `luna-send` invocation and the Home
key takeover are in [`../webos-blades/docs/HOME-BUTTON.md`](../webos-blades/docs/HOME-BUTTON.md).
The short version:

```bash
./build.sh && scp dist/ooo.lew.xne_*.ipk root@192.168.1.37:/tmp/
ssh -tt root@192.168.1.37 "luna-send-pub -w 90000 -i \
  'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/ooo.lew.xne_0.1.0_all.ipk\",\"subscribe\":true}' < /dev/null"

./tools/deploy.sh       # build + sync into the installed dir + restart
./tools/restart.sh      # closeByAppId + launch
node tools/capture.mjs --keys 39 --state --shot /tmp/s.png
```

- **Never restart the page with `Page.reload`.** It leaves the renderer updating
  the DOM without ever painting, so the screen freezes on the last frame it
  produced. `tools/restart.sh` closes and launches instead.
- CDP throttles the renderer hard: `capture.mjs` and `eval.mjs` call
  `Page.bringToFront` first, or measurements come back stalled.
- **Measure only while this app is the foreground app.** A backgrounded page on
  this firmware has no timers and no animation frames, so a probe that waits on
  either hangs forever. The TV's screensaver
  (`com.webos.app.lifeonscreen`) steals foreground on its own schedule, so wrap
  every probe in a shell `timeout`.
- Installing an IPK resets that app's Luna ACL to `["public"]`, which silently
  empties `listLaunchPoints`. Snapshot before, restore after.
- **Make no persistent change to the TV beyond this app's own install directory.**
  Nothing under the stock home, no keyfilter edits.

## Test locally

`bun run dev`, then open `http://localhost:5173/?boot=off` (`?boot=full` plays
the boot; `?boot=full&at=<ms>` freezes it). Up/down change channel, left/right
move along the row, Page Up/Down page, Enter is A, Esc/Backspace is B, `G` opens
the Guide, `Y` replays the boot. The mock serves the TV's real launch points and
icons from `mock-tv/`. The stage is 1920x1080; a window that is not 16:9 crops
it.
