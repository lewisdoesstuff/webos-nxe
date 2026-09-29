<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import {
  bootAdvance,
  bootBoxes,
  bootDone,
  bootSkip,
  bootStart,
  bootTiming,
  bootWindows,
  CROSS_DX,
  CROSS_DY,
  type BootDone,
  type BootSpeed,
  type BootStageEvent,
  type BootState,
  FLARE_D,
  FRAME_H,
  FRAME_W,
  HOLD_MS,
  MARK_SIZE,
  ORB_BOX_D,
  RING_CONTRACT,
  SKIP_CAPTION,
  SKIP_D,
  SKIP_GAP,
  SKIP_LETTER,
  SKIP_WORD,
  SPOKE_COUNT,
  SPOKE_W,
  SPHERE_MAX,
  STAGE_INDEX,
  WASH_EDGE,
  WASH_MID,
  WASH_TOP,
  type WindowId,
  WINDOW_IDS,
} from "../boot";
import { MOVE_EASE } from "../hub";
import { BUTTON_FILL, BUTTON_RING } from "../prompts";

/**
 * The boot screen: the 2005 pre-Kinect Xbox 360 bumper, rebuilt from the
 * timing master (`dkKAW_GXXZk`, 2560x1440/60) frame by frame.
 *
 * `boot.ts` holds the beat table, the clock and the boxes. This holds the
 * shapes. Every stop in every keyframe set here is a fraction of a window the
 * model hands over, so the stylesheet carries no absolute percentage and
 * compressing the run moves no keyframe.
 *
 * **What is sourced and what is drawn.** The orb, the wordmark and the X mark
 * are cut from the master's own settled frame: `assets/boot/orb.png` is the
 * sphere, `mark.png` is the `XBOX 360` logotype with its matte unmixed from
 * the field, `xglow.png` is the X with its ignition glow. The field, the big
 * sphere's shading, the starburst and the ripple ring are drawn, because the
 * master is a rendered 3D shot and no frame carries those surfaces clean:
 * every frame has the X and a camera angle burned into the ball. Their
 * colours are sampled off the master and named in the rules below.
 *
 * **Nothing is created or destroyed while it runs.** The element count is
 * fixed, there is no `v-if`, and the one `v-for` is over `SPOKE_COUNT`, a
 * constant, with the index as the key. Every stage of the run is expressed as
 * a class-free style write, so the layer set is byte-identical from mount to
 * unmount. A layer appearing here is a layer appearing during the most
 * exposed transition in the app, and `tools/gate.mjs` fails on exactly that.
 *
 * **The handover costs nothing because the dashboard is behind it.** The boot
 * is an overlay on a dashboard that was mounted before it started, so the last
 * thing it does is fade its own full-frame plane, and what is revealed is a
 * surface that was already a texture.
 *
 * **Reduced motion is the static state, not a shorter animation.** Each
 * animated element's resting CSS is the settled logo and every keyframe's
 * opening state is in the keyframe, so `animation: none` leaves the logo
 * standing. A parent that honours `reduceMotion` resolves `auto` to `off` and
 * mounts nothing, so this rule only runs for someone who asked for the full
 * animation and has the setting on.
 */

const props = withDefaults(
  defineProps<{
    /** `full` plays the measured six seconds, `short` plays it at a quarter. */
    mode?: BootSpeed;
    /** False holds the playhead where it is without touching the DOM. */
    play?: boolean;
    /**
     * Milliseconds to hold the settled logo before the handover. Not compressed
     * by the mode, because a parent's work does not get faster because the
     * animation did.
     */
    holdMs?: number;
  }>(),
  { mode: "full", play: true, holdMs: HOLD_MS },
);

/**
 * `done` fires once, when the playhead reaches the end of the run. `reason` is
 * `skipped` when a key took the boot to the end of the bumper, and `elapsedMs`
 * is the playhead there, so a parent that wants to know how much was seen has
 * it.
 *
 * `stage` fires as the playhead enters each stage, in order and once each. The
 * payload's `index` is the stage's position in `STAGE_IDS`, not its position in
 * this run's entry order, so a run that skipped five stages still reports the
 * handover as 7.
 */
const emit = defineEmits<{
  done: [payload: BootDone];
  stage: [payload: BootStageEvent];
}>();

const root = ref<HTMLElement>();
const boxes = bootBoxes();
const timing = computed(() => bootTiming(props.mode, props.holdMs));
const state = ref<BootState>(bootStart());
const frozen = ref(false);

/** Everything the stylesheet needs, so no number is written twice. */
const rootStyle = computed((): Record<string, string> => ({
  width: `${FRAME_W}px`,
  height: `${FRAME_H}px`,
  "--ease": MOVE_EASE,
  "--sphere-max": `${SPHERE_MAX}`,
  "--cross-d": `${boxes.cross.width}px`,
  "--cross-dx": `${CROSS_DX}px`,
  "--cross-dy": `${CROSS_DY}px`,
  "--flare-r": `${FLARE_D / 2}px`,
  "--spoke-w": `${SPOKE_W * FLARE_D}px`,
  "--ring-contract": `${RING_CONTRACT}`,
  "--orb-d": `${ORB_BOX_D}px`,
  "--mark-h": `${MARK_SIZE}px`,
  "--skip-d": `${SKIP_D}px`,
  "--skip-gap": `${SKIP_GAP}px`,
  "--skip-letter": `${SKIP_LETTER}px`,
  "--skip-word": SKIP_WORD,
  "--wash-top": WASH_TOP,
  "--wash-mid": WASH_MID,
  "--wash-edge": WASH_EDGE,
  "--fill": BUTTON_FILL.a,
  "--ring": BUTTON_RING.a,
}));

function boxStyle(id: WindowId): Record<string, string> {
  const box = boxes[id];
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

/** One spoke of the starburst: a bar from the middle out, at its own angle. */
function spokeStyle(index: number): Record<string, string> {
  return {
    transform: `rotate(${(360 / SPOKE_COUNT) * index}deg)`,
    width: `${SPOKE_W * FLARE_D}px`,
  };
}

/**
 * Write every element's window onto the root, and every delay less `seekMs`.
 *
 * This writes the custom properties directly rather than through a ref, and
 * that is deliberate. A ref write is batched to the next patch, so a skip made
 * inside a key handler would put one painted frame between the key and the seek
 * with the orb still half grown. Written here, synchronously, the seek and the
 * frame it is painted in are the same frame, which is the only way a skip looks
 * like a cut.
 *
 * Every delay is its own delay less the seek, so a window already past lands
 * past its end and holds the last keyframe under `fill-mode: both`. A window not
 * started yet lands on its start. Nothing is added and nothing is removed.
 */
function applyWindows(seekMs: number): void {
  const element = root.value;
  if (element === undefined) return;
  const windows = bootWindows(timing.value);
  for (const id of WINDOW_IDS) {
    const window = windows[id];
    element.style.setProperty(`--w-${id}`, `${window.durationMs}ms`);
    element.style.setProperty(`--d-${id}`, `${window.delayMs - seekMs}ms`);
  }
}

let announced = 0;
let frame = 0;
let origin = 0;
let skipped = false;

/** Tell the parent about every stage entered since the last time. */
function announce(next: BootState): void {
  for (let index = announced; index < next.entered.length; index++) {
    const id = next.entered[index];
    if (id === undefined) continue;
    emit("stage", { id, index: STAGE_INDEX[id] });
  }
  announced = next.entered.length;
}

function tick(now: number): void {
  frame = 0;
  if (origin === 0) origin = now;
  const next = bootAdvance(state.value, now - origin, timing.value);
  state.value = next;
  announce(next);
  if (bootDone(next, timing.value)) {
    emit("done", { reason: skipped ? "skipped" : "played", elapsedMs: next.ms });
    return;
  }
  frame = requestAnimationFrame(tick);
}

function play(): void {
  if (frozen.value) return;
  if (frame !== 0) return;
  if (bootDone(state.value, timing.value)) return;
  origin = performance.now() - state.value.ms;
  frame = requestAnimationFrame(tick);
}

function pause(): void {
  if (frame === 0) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

/**
 * Skip to the end of the bumper.
 *
 * The playhead jumps rather than steps, and the seek rewrites every window's
 * delay in the same frame, so the orb is gone and the logo is in place on the
 * first painted frame after the key. The handover is not skipped, because a cut
 * from the bumper's bright frame to the dashboard is a flash and the whole
 * reason the boot is skippable is that it is not worth looking at.
 */
function skip(): void {
  if (bootDone(state.value, timing.value)) return;
  const next = bootSkip(state.value, timing.value);
  if (next === state.value) return;
  state.value = next;
  applyWindows(next.ms);
  announce(next);
  skipped = true;
  play();
}

/**
 * Any key skips, so this is a capture-phase listener on `window` that stops the
 * event at the target. The shell's own `keydown` handler is on the bubble phase
 * of the same target, so without the stop the arrow that skipped the boot would
 * also move the ribbon, and the person who skipped would arrive at a dashboard
 * that had already moved. This is a hard part of the contract: while this
 * component is mounted, the shell sees no keys at all.
 */
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

function onKeyDown(event: KeyboardEvent): void {
  if (bootDone(state.value, timing.value)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (MODIFIER_KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  skip();
}

/**
 * `?bootAt=<ms>` pins the playhead and pauses every animation on it, so a
 * screenshot lands on one exact frame of the run instead of wherever virtual
 * time happens to stop. It is a capture affordance and changes nothing else:
 * no window is added and no layer is.
 */
function freezeAt(ms: number): void {
  frozen.value = true;
  state.value = bootAdvance(bootStart(), ms, timing.value);
  applyWindows(ms);
  announce(state.value);
}

onMounted(() => {
  applyWindows(0);
  window.addEventListener("keydown", onKeyDown, true);
  const asked = Number(new URLSearchParams(window.location.search).get("bootAt"));
  if (Number.isFinite(asked) && asked > 0) {
    freezeAt(asked);
    return;
  }
  // The first frame is the caller's to give or withhold, because a parent that
  // mounts this behind something it is still painting wants the playhead still.
  if (props.play) play();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown, true);
  pause();
});

watch(
  () => props.play,
  (on) => (on ? play() : pause()),
);

/**
 * A mode or hold change re-resolves the timeline, so the run starts again from
 * the lead-in. The parent's contract says a run's `stage` events are for one
 * run, so nothing is re-announced: `dark` was already said and repeating it
 * would be the double-fire this model exists to prevent.
 */
watch(timing, () => {
  state.value = bootStart();
  applyWindows(0);
  skipped = false;
  announced = 1;
  pause();
  if (props.play) play();
});
</script>

<template>
  <div ref="root" class="boot" :class="{ frozen }" :style="rootStyle">
    <div class="wash" :style="boxStyle('wash')" />

    <div class="lockup" :style="boxStyle('lockup')" />
    <div class="ring" :style="boxStyle('ring')" />
    <div class="mark" :style="boxStyle('mark')" />

    <div class="sphere" :style="boxStyle('sphere')">
      <div class="cross" />
    </div>

    <div class="flare" :style="boxStyle('flare')">
      <span
        v-for="index in SPOKE_COUNT"
        :key="index"
        class="spoke"
        :style="spokeStyle(index - 1)"
      />
    </div>

    <div class="skip" :style="boxStyle('skip')">
      <span class="disc"><span class="letter">A</span></span>
      <span class="word">{{ SKIP_CAPTION }}</span>
    </div>
  </div>
</template>

<style scoped>
/*
 * The backdrop plane and the stage the run plays on. It is the frame's own box
 * and it fills it, which is the only reason a layer may span the frame. It
 * carries the handover's opacity and nothing else, and it is the black the
 * lead-in is: the bumper's first ten frames measure mean 0.00, so a bright
 * frame at t=0 is a flash.
 *
 * It is promoted at rest, which is the whole of the allocation story. An opacity
 * animation on an unpromoted box repaints the box every frame, and this box is
 * 7.9 MB, so the fade would be fourteen repaints of a full-frame surface. The
 * layer exists before the key press and only its opacity moves.
 *
 * `z-index` is load-bearing: the dashboard's own panels are positioned
 * siblings with `z-index: 1` and `2`, so a boot left at the auto level paints
 * underneath them and never appears at all.
 *
 * There is no mouse support at all on this dashboard, VERIFIED in
 * NXE-BOOT-INPUT.md section 3.8, so the boot never takes the pointer. Skip is
 * keys, and the parent forwards no click.
 */
.boot {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  overflow: hidden;
  pointer-events: none;
  background: #000;
  opacity: 1;
  will-change: opacity;
  animation-name: bootHandover;
  animation-duration: var(--w-boot);
  animation-delay: var(--d-boot);
  animation-fill-mode: both;
  animation-timing-function: linear;
}

/*
 * The field: the master's settled backdrop, sampled where its glow is
 * brightest (`#D5F4AD` at 39%/47%, `#BCE093` at mid radius, `#8FA582` in the
 * corners). It fades up over the arrive window on top of the black, which is
 * the bumper's fade-up, and the brightness ramp across the fill is carried by
 * the sphere growing rather than by a second 7.9 MB plane. The three soft
 * discs are the bokeh the master drifts through the resolve beat.
 */
.wash {
  position: absolute;
  opacity: 1;
  background:
    radial-gradient(circle 120px at 78% 42%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 70%),
    radial-gradient(circle 150px at 88% 63%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 70%),
    radial-gradient(circle 90px at 68% 74%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 70%),
    radial-gradient(
      ellipse 72% 88% at 39% 47%,
      var(--wash-top) 0%,
      var(--wash-mid) 26%,
      #a9bd8f 58%,
      var(--wash-edge) 100%
    );
  will-change: opacity;
  animation-name: bootWash;
  animation-duration: var(--w-wash);
  animation-delay: var(--d-wash);
  animation-fill-mode: both;
  animation-timing-function: var(--ease);
}

/*
 * The big sphere: the master's ball is brushed silver-green, lit from above,
 * and dark well before its limb on the shadow side. Sampled at f86: body
 * `#94A094`, mid `#464B45`, shadow `#0F110F`, and a lit rim `#AEC2A6` along
 * the top edge. The X is the real mark, the same cutout the settled orb
 * carries, baked in at the face position the master's flare frame puts it on,
 * and `cross` above it does the ignition.
 *
 * It is promoted because it grows to over twice the frame and a transform on
 * an unpromoted box repaints it every frame. Its texture follows its CSS box
 * and the scale sits on top of that, so the box is 900 across and the drawn
 * ball is 2250 at the fill, over the frame and clipped by the plane.
 */
.sphere {
  position: absolute;
  border-radius: 50%;
  opacity: 1;
  background:
    url("../assets/boot/xglow.png") calc(50% + var(--cross-dx) - var(--cross-d) / 2)
      calc(50% + var(--cross-dy) - var(--cross-d) / 2) / var(--cross-d) var(--cross-d) no-repeat,
    repeating-linear-gradient(
      96deg,
      rgba(255, 255, 255, 0.05) 0 2px,
      rgba(0, 0, 0, 0.045) 2px 5px
    ),
    radial-gradient(
      ellipse 96% 92% at 33% 22%,
      #b7c2b2 0%,
      #94a094 26%,
      #6b776c 50%,
      #3b423b 74%,
      #141713 92%,
      #0b0d0b 100%
    );
  will-change: transform, opacity;
  animation-name: bootSphere;
  animation-duration: var(--w-sphere);
  animation-delay: var(--d-sphere);
  animation-fill-mode: both;
  animation-timing-function: var(--ease);
}

.sphere::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: inset 0 40px 90px -24px rgba(174, 194, 166, 0.55);
}

/*
 * The X on the sphere's face: the master's own mark, cut from the settled orb
 * with its green and its hot yellow-white core (`#7BE445` outer,
 * `#FCFCB5` core) and the ignition glow baked around it. It sits at the face
 * offset on the sphere, so it tracks the ball through the whole recede without
 * a line of its own, and the only thing that moves on it is its own scale and
 * opacity. Before f86 it is the faint etch the master's ball carries through
 * the fill, and the ignition is it going to full strength.
 */
.cross {
  position: absolute;
  top: calc(50% - var(--cross-d) / 2);
  left: calc(50% - var(--cross-d) / 2);
  width: var(--cross-d);
  height: var(--cross-d);
  translate: var(--cross-dx) var(--cross-dy);
  opacity: 0;
  background: url("../assets/boot/xglow.png") center / 100% 100% no-repeat;
  will-change: transform, opacity;
  animation-name: bootCross;
  animation-duration: var(--w-cross);
  animation-delay: var(--d-cross);
  animation-fill-mode: both;
  animation-timing-function: var(--ease);
}

/*
 * The starburst. The master's peak is a white core blown to `#FFFFFF` with a
 * pale `#FCFCB5` inner ring, green arcs rippling out of it and short rays, so
 * the texture is a core, two ripple rings and eight static spokes over them.
 * It is three frames wide at the peak and a spike, not a swell, so the peak is
 * not eased.
 */
.flare {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  background:
    radial-gradient(
      circle 64% at 50% 50%,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(252, 252, 181, 0.7) 16%,
      rgba(123, 228, 69, 0.4) 38%,
      rgba(123, 228, 69, 0) 68%
    ),
    radial-gradient(
      circle 49% at 50% 50%,
      rgba(216, 244, 150, 0) 0 82%,
      rgba(216, 244, 150, 0.55) 88%,
      rgba(216, 244, 150, 0) 100%
    ),
    radial-gradient(
      circle 38% at 50% 50%,
      rgba(216, 244, 150, 0) 0 84%,
      rgba(216, 244, 150, 0.4) 90%,
      rgba(216, 244, 150, 0) 100%
    );
  will-change: transform, opacity;
  animation-name: bootFlare;
  animation-duration: var(--w-flare);
  animation-delay: var(--d-flare);
  animation-fill-mode: both;
  animation-timing-function: linear;
}

.spoke {
  position: absolute;
  top: 0;
  left: 50%;
  height: var(--flare-r);
  margin-left: calc(var(--spoke-w) / -2);
  transform-origin: 50% 100%;
  background: linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.9) 0%,
    rgba(255, 255, 255, 0.28) 62%,
    rgba(255, 255, 255, 0) 100%
  );
}

/*
 * The orb: the master's own settled sphere, cut out whole, so the silver, the
 * carved X and its highlight are the original render rather than an
 * approximation of it. Its layer is the box the model derives and it only
 * ever moves by transform, so the recede that runs from the receding ball
 * through the burn-out and into the logo is one texture the whole way.
 */
.lockup {
  position: absolute;
  opacity: 1;
  background: url("../assets/boot/orb.png") center / 100% 100% no-repeat;
  will-change: transform, opacity;
  animation-name: bootOrb;
  animation-duration: var(--w-lockup);
  animation-delay: var(--d-lockup);
  animation-fill-mode: both;
  animation-timing-function: var(--ease);
}

/*
 * The ripple ring: the green ring the master blooms around the lockup at f255
 * and contracts to its last motion at f333. Sampled at f320 it reads
 * `#EDFFD2`, and it is wider than it is tall, so the annulus is an ellipse.
 * It sits inside its own box and the contraction is a transform, because an
 * unpromoted transform here would repaint the lockup.
 */
.ring {
  position: absolute;
  opacity: 0;
  background:
    radial-gradient(
      ellipse 49.2% 35.9% at 50% 50%,
      rgba(230, 250, 200, 0) 0 80%,
      rgba(237, 255, 210, 0.14) 86%,
      rgba(237, 255, 210, 0.9) 94%,
      rgba(216, 242, 176, 0.18) 99%,
      rgba(216, 242, 176, 0) 100%
    ),
    radial-gradient(
      ellipse 30% 22% at 50% 50%,
      rgba(230, 250, 200, 0.22) 0%,
      rgba(230, 250, 200, 0) 72%
    );
  will-change: transform, opacity;
  animation-name: bootRing;
  animation-duration: var(--w-ring);
  animation-delay: var(--d-ring);
  animation-fill-mode: both;
  animation-timing-function: var(--ease);
}

/*
 * The wordmark: the master's own `XBOX 360` logotype, `XBOX` in its green and
 * `360` in its grey, unmixed from the field so its matte is clean at the
 * strokes. It resolves the way the master's does, ghosting up over the settle
 * rather than cutting in, and it is one texture so the letters never move
 * against each other.
 */
.mark {
  position: absolute;
  opacity: 1;
  background: url("../assets/boot/mark.png") center / 100% 100% no-repeat;
  will-change: transform, opacity;
  animation-name: bootMark;
  animation-duration: var(--w-mark);
  animation-delay: var(--d-mark);
  animation-fill-mode: both;
  animation-timing-function: var(--ease);
}

/*
 * The skip affordance, at the dashboard's own measured `A` badge position and
 * in the dashboard's own green disc. It is the only prompt on screen, and its
 * caption is that build's own, because the one place a boot screen is known to
 * have been skippable is the NXE intro montage, where the prompt read
 * `A Select`.
 *
 * It fades in over the fill rather than at t=0, so it is not in front of the
 * composition arriving, and it is promoted because it is a child of a
 * full-frame layer and an unpromoted opacity here would repaint that layer.
 */
.skip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: var(--skip-gap);
  opacity: 1;
  will-change: opacity;
  animation-name: bootSkip;
  animation-duration: var(--w-skip);
  animation-delay: var(--d-skip);
  animation-fill-mode: both;
  animation-timing-function: linear;
}

.skip .disc {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--skip-d);
  height: var(--skip-d);
  border-radius: 50%;
  background: var(--fill);
}

.skip .disc::before {
  content: "";
  position: absolute;
  inset: 15%;
  border: 1px solid var(--ring);
  border-radius: 50%;
}

.skip .letter {
  position: relative;
  font-size: var(--skip-letter);
  font-weight: 700;
  line-height: 1;
  color: #fff;
}

.skip .word {
  font-size: var(--skip-letter);
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  color: var(--skip-word);
}

/*
 * f10 to f214: the ball from first light to the burn-out. The master's
 * silhouette is a planet over frame wide, its edge crossing the frame near the
 * top and rising as the room lights up, then receding to about a thousand
 * pixels at f217. Stops: 21.6% is f54, 37.3% is f86, 39% is f90 where the fill
 * band closes, 55% is f122 the flare, 61.8% is f136 where the recede has
 * measurably started, and 100% is the ball the orb layer takes over from.
 */
@keyframes bootSphere {
  0% {
    transform: translate(-120px, 1213px) scale(var(--sphere-max));
    opacity: 0;
  }

  3% {
    transform: translate(-140px, 1120px) scale(var(--sphere-max));
    opacity: 0.12;
  }

  21.6% {
    transform: translate(-180px, 986px) scale(var(--sphere-max));
    opacity: 0.38;
  }

  37.3% {
    transform: translate(-235px, 845px) scale(var(--sphere-max));
    opacity: 0.9;
  }

  39% {
    transform: translate(-235px, 845px) scale(var(--sphere-max));
    opacity: 1;
  }

  55% {
    transform: translate(-235px, 845px) scale(var(--sphere-max));
    opacity: 1;
  }

  61.8% {
    transform: translate(-270px, 700px) scale(2.05);
    opacity: 1;
  }

  75% {
    transform: translate(-310px, 560px) scale(1.75);
    opacity: 1;
  }

  90.2% {
    transform: translate(-360px, 480px) scale(1.5);
    opacity: 1;
  }

  96.6% {
    transform: translate(-330px, 265px) scale(1.28);
    opacity: 0.85;
  }

  100% {
    transform: translate(-325px, 227px) scale(1.2);
    opacity: 0;
  }
}

/*
 * f86 to f214. Window `ignite` to `resolve`, 128 frames. 4% is f91, the end of
 * the ignition band, 7% is f95 where the master blows the sparkle out over
 * half the frame, and 28% is f122 the flare. It ends burning out with the
 * ball, which is what the master's f205 to f214 shows on the X's core.
 */
@keyframes bootCross {
  0% {
    transform: scale(0.45);
    opacity: 0;
  }

  4% {
    transform: scale(1.1);
    opacity: 1;
  }

  7% {
    transform: scale(1.7);
    opacity: 1;
  }

  15.6% {
    transform: scale(1.02);
    opacity: 1;
  }

  28% {
    transform: scale(1.06);
    opacity: 1;
  }

  60% {
    transform: scale(1.1);
    opacity: 1;
  }

  95% {
    transform: scale(1.6);
    opacity: 1;
  }

  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}

/*
 * f120 to f214. Window `flare` to `resolve`, 94 frames. 2% is f122, so the
 * spike is two frames wide on the master and the rest is the decay, with the
 * core hot again at the burn-out. Each translate keeps the burst on the X as
 * the ball carries it left and up.
 */
@keyframes bootFlare {
  0% {
    transform: translate(290px, 205px) scale(0.55);
    opacity: 0.5;
  }

  2% {
    transform: translate(290px, 205px) scale(1.4);
    opacity: 1;
  }

  8.5% {
    transform: translate(250px, 190px) scale(1.8);
    opacity: 0.55;
  }

  30% {
    transform: translate(114px, 179px) scale(1.25);
    opacity: 0.22;
  }

  60% {
    transform: translate(10px, 110px) scale(1.4);
    opacity: 0.3;
  }

  85% {
    transform: translate(-50px, 93px) scale(1.8);
    opacity: 0.75;
  }

  93.6% {
    transform: translate(-61px, -63px) scale(2.2);
    opacity: 1;
  }

  100% {
    transform: translate(-73px, -80px) scale(2.4);
    opacity: 0;
  }
}

/*
 * f122 to f360. The orb carries the ball's recede the moment the sphere's own
 * window ends, so the two are the same size and place at f214 and the ball is
 * never cut. The master then takes it to a quarter of the frame at f240,
 * undershoots, and lands on the settled sphere by f265. The first third of the
 * window is opacity zero: it is behind the sphere, and it only becomes the
 * ball when the burn-out clears.
 */
@keyframes bootOrb {
  0% {
    transform: translate(-247px, 908px) scale(6.25);
    opacity: 0;
  }

  33.2% {
    transform: translate(-342px, 328px) scale(3.19);
    opacity: 0;
  }

  36.1% {
    transform: translate(-342px, 318px) scale(3.11);
    opacity: 0.55;
  }

  38.7% {
    transform: translate(-337px, 290px) scale(3.05);
    opacity: 1;
  }

  43.3% {
    transform: translate(-324px, 183px) scale(1.47);
    opacity: 1;
  }

  49.6% {
    transform: translate(-152px, 88px) scale(0.69);
    opacity: 1;
  }

  55.9% {
    transform: translate(-12px, 13px) scale(0.89);
    opacity: 1;
  }

  60% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }

  100% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
}

/*
 * f214 to f360. Window `settle`, 146 frames. The ring blooms as the master's
 * does while the mark ghosts up under it, contracts to its last real motion at
 * 81.5%, which is f333, and fades before the settled frame. The remaining
 * frames are the hold, and they are why the master then runs a further 52
 * seconds of a motionless frame.
 */
@keyframes bootRing {
  0% {
    transform: scale(var(--ring-contract));
    opacity: 0;
  }

  19.2% {
    transform: scale(var(--ring-contract));
    opacity: 0;
  }

  22.6% {
    transform: scale(var(--ring-contract));
    opacity: 0.5;
  }

  28.1% {
    transform: scale(var(--ring-contract));
    opacity: 0.85;
  }

  81.5% {
    transform: scale(1.22);
    opacity: 0.8;
  }

  91% {
    transform: scale(1.18);
    opacity: 0.22;
  }

  95.2% {
    transform: scale(1.16);
    opacity: 0;
  }

  100% {
    transform: scale(1.16);
    opacity: 0;
  }
}

/*
 * f214 to f360. The wordmark's own ghost-up, on the same window as the ring
 * because the master resolves the two together. Its last tenth of a scale is
 * still open at f333, which is where the master's frame still shows it faint.
 */
@keyframes bootMark {
  0% {
    transform: scaleX(0.94);
    opacity: 0;
  }

  22.6% {
    transform: scaleX(0.94);
    opacity: 0;
  }

  32% {
    transform: scaleX(0.955);
    opacity: 0.3;
  }

  55% {
    transform: scaleX(0.975);
    opacity: 0.6;
  }

  81.5% {
    transform: scaleX(1);
    opacity: 0.88;
  }

  91% {
    transform: scaleX(1);
    opacity: 1;
  }

  100% {
    transform: scaleX(1);
    opacity: 1;
  }
}

/*
 * f54 to f360. Window `fill` to `settle`, 306 frames. 22% is f120, the flare,
 * which is late enough that the affordance is not in front of the composition
 * arriving and in time for the person who has seen this five hundred times to
 * have read it before the logo has finished resolving.
 */
@keyframes bootSkip {
  0% {
    opacity: 0;
  }

  22% {
    opacity: 1;
  }

  100% {
    opacity: 1;
  }
}

/*
 * f10 to f54. Window `arrive`, 44 frames. The field coming up over the black,
 * which is the bumper's fade-up. The measured first-light frame carries mean
 * 0.93 of 255, so most of this beat is a dark frame and the hard brightness
 * ramp the research measures is the sphere's, not the backdrop's.
 */
@keyframes bootWash {
  0% {
    opacity: 0;
  }

  30% {
    opacity: 0.6;
  }

  100% {
    opacity: 1;
  }
}

/* The handover. Window `handover`, 300 ms of opacity on a full-frame layer. */
@keyframes bootHandover {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/*
 * A pinned capture holds every animation where the playhead left it, so a
 * screenshot lands on the frame that was asked for rather than wherever the
 * clock has got to.
 */
.boot.frozen .wash,
.boot.frozen .sphere,
.boot.frozen .cross,
.boot.frozen .flare,
.boot.frozen .lockup,
.boot.frozen .ring,
.boot.frozen .mark,
.boot.frozen .skip,
.boot.frozen {
  animation-play-state: paused;
}

/*
 * Reduced motion is the settled logo standing, which is what each animated
 * element's resting state above is, and then the handover. Every opening
 * keyframe is in the keyframe set rather than in the base rule, so turning the
 * animation off does not leave the ball half grown on screen.
 */
@media (prefers-reduced-motion: reduce) {
  .boot,
  .wash,
  .sphere,
  .cross,
  .flare,
  .lockup,
  .ring,
  .mark,
  .skip {
    animation-name: none;
  }
}
</style>
