<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import {
  bootAdvance,
  bootDone,
  bootFrameAt,
  bootMasterFrame,
  bootSkip,
  bootStart,
  bootTiming,
  type BootDone,
  type BootSpeed,
  type BootStageEvent,
  type BootState,
  FRAME_H,
  FRAME_W,
  HOLD_MS,
  STAGE_INDEX,
} from "../boot";
import { BootRenderer } from "../bootGl";
import { XBOX_THEME } from "../bootTheme";
import { bootSound } from "../sound";

/**
 * The boot screen: the 2005 pre-Kinect Xbox 360 bumper, drawn by one fragment
 * shader on one full-screen canvas.
 *
 * `boot.ts` holds the clock, `bootScene.ts` turns a master frame into the
 * shader's uniforms, `bootGl.ts` owns the context and `bootTheme.ts` every
 * brand-specific colour and texture. This component only runs the clock, draws
 * the frame it lands on and fades the canvas out at the end.
 *
 * **Nothing is created or destroyed while it runs.** The canvas is the only
 * element and it exists from mount. Every frame is uniform writes and one
 * draw; the handover is the canvas's own `opacity`, on a layer promoted from
 * the start, over a dashboard that is already mounted behind it. The context is
 * released once the fade has finished.
 *
 * `?at=<ms>` freezes the run at that point on the clock, for comparing against
 * the master: frame N is at `N * 1000 / 60` ms in the full mode.
 */

const props = withDefaults(
  defineProps<{
    /** `full` plays the measured six seconds, `short` plays it at a quarter. */
    mode?: BootSpeed;
    /** False holds the playhead where it is; before the run starts, on the black lead-in. */
    play?: boolean;
    /** Milliseconds to hold the settled logo before the handover, not compressed by the mode. */
    holdMs?: number;
  }>(),
  { mode: "full", play: true, holdMs: HOLD_MS },
);

/**
 * `done` fires once, when the playhead reaches the end of the run. `stage`
 * fires as the playhead enters each stage, in order and once each, with the
 * stage's index in `STAGE_IDS`.
 */
const emit = defineEmits<{
  done: [payload: BootDone];
  stage: [payload: BootStageEvent];
}>();

const canvas = ref<HTMLCanvasElement>();
const timing = computed(() => bootTiming(props.mode, props.holdMs));
const state = ref<BootState>(bootStart());

let renderer: BootRenderer | null = null;
let announced = 0;
let frame = 0;
let origin = 0;
let skipped = false;
let frozen = false;
let warmed = false;
let drawn = -1;
let released = 0;

const RELEASE_SHARE = 0.5;
const FADE_FROM = 0.35;

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

let finished = false;

/** The audio is the master's own track, so it only plays at the master's speed. */
const sounded = computed(() => props.mode === "full");

function announce(next: BootState): void {
  for (let index = announced; index < next.entered.length; index++) {
    const id = next.entered[index];
    if (id === undefined) continue;
    emit("stage", { id, index: STAGE_INDEX[id] });
  }
  announced = next.entered.length;
}

/** Draw the playhead's frame and set the handover's opacity, written straight to the element. */
function paint(ms: number): void {
  const element = canvas.value;
  if (element === undefined || renderer === null) return;
  const at = bootFrameAt(ms, timing.value);
  const handing = at.id === "handover";
  // The lockup dissolves into the bare field first, then the field fades off the dashboard.
  const release = handing ? smooth(at.progress / RELEASE_SHARE) : 0;
  const fade = handing ? smooth((at.progress - FADE_FROM) / (1 - FADE_FROM)) : 0;
  element.style.opacity = `${1 - fade}`;
  const master = bootMasterFrame(ms, timing.value);
  if (master === drawn && release === released) return;
  drawn = master;
  released = release;
  renderer.draw(master, release);
}

function tick(now: number): void {
  frame = 0;
  if (renderer !== null && !renderer.poll()) {
    frame = requestAnimationFrame(tick);
    return;
  }
  if (frozen) {
    paint(state.value.ms);
    return;
  }
  // The first draw is where the driver links the program and uploads the
  // textures, 300 to 450ms on the TV. Draw the black lead-in once and start
  // the clock on the frame after it, so that stall is not taken off the run.
  if (!warmed) {
    warmed = true;
    paint(state.value.ms);
    frame = requestAnimationFrame(tick);
    return;
  }
  if (origin === 0) {
    origin = now - state.value.ms;
    if (sounded.value) bootSound.start(() => performance.now() - origin);
  }
  const next = bootAdvance(state.value, now - origin, timing.value);
  state.value = next;
  announce(next);
  paint(next.ms);
  if (bootDone(next, timing.value)) {
    finished = true;
    renderer?.release();
    emit("done", { reason: skipped ? "skipped" : "played", elapsedMs: next.ms });
    return;
  }
  frame = requestAnimationFrame(tick);
}

/** Link the program and draw the black lead-in once, without starting the clock. */
function warm(): void {
  frame = 0;
  if (renderer !== null && !renderer.poll()) {
    frame = requestAnimationFrame(warm);
    return;
  }
  warmed = true;
  paint(state.value.ms);
}

function play(): void {
  if (frame !== 0 && !warmed) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (frame !== 0) return;
  if (bootDone(state.value, timing.value)) return;
  origin = 0;
  frame = requestAnimationFrame(tick);
}

function pause(): void {
  if (frame === 0) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

/**
 * Jump to the end of the bumper. The handover still runs, because a cut from
 * the bumper's bright frame to the dashboard is a flash.
 */
function skip(): void {
  if (bootDone(state.value, timing.value)) return;
  const next = bootSkip(state.value, timing.value);
  if (next === state.value) return;
  state.value = next;
  origin = performance.now() - next.ms;
  announce(next);
  skipped = true;
  bootSound.fadeOut();
  paint(next.ms);
  play();
}

const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Meta",
  "NumLock",
  "ScrollLock",
  "Shift",
]);

/**
 * Any key skips. Capture phase on `window` with the event stopped, so the key
 * that skipped the boot does not also move the ribbon behind it.
 */
function onKeyDown(event: KeyboardEvent): void {
  if (bootDone(state.value, timing.value)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (MODIFIER_KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  skip();
}

onMounted(() => {
  const element = canvas.value;
  if (sounded.value) bootSound.preload();
  if (element !== undefined) renderer = new BootRenderer(element, XBOX_THEME);
  window.addEventListener("keydown", onKeyDown, true);
  const asked = new URLSearchParams(window.location.search).get("at");
  const at = asked === null ? Number.NaN : Number(asked);
  if (Number.isFinite(at) && at >= 0) {
    frozen = true;
    state.value = bootAdvance(bootStart(), at, timing.value);
    announce(state.value);
    frame = requestAnimationFrame(tick);
    return;
  }
  if (props.play) play();
  else frame = requestAnimationFrame(warm);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown, true);
  pause();
  if (!finished) bootSound.stop();
  renderer?.release();
  renderer = null;
});

watch(
  () => props.play,
  (on) => {
    if (on) play();
    else {
      pause();
      bootSound.stop();
    }
  },
);

watch(timing, () => {
  state.value = bootStart();
  skipped = false;
  announced = 1;
  pause();
  bootSound.stop();
  if (props.play) play();
});
</script>

<template>
  <canvas ref="canvas" class="boot" :style="{ width: `${FRAME_W}px`, height: `${FRAME_H}px` }" />
</template>

<style scoped>
/*
 * The one full-frame layer. Promoted from mount, so the handover's opacity is
 * a composite of a texture that already exists. `z-index` keeps it above the
 * dashboard's own positioned panels. There is no pointer on this dashboard, so
 * the boot never takes it.
 */
.boot {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  display: block;
  pointer-events: none;
  background: #000;
  will-change: opacity;
}
</style>
