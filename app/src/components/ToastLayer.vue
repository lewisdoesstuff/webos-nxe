<script setup lang="ts" vapor>
import { computed, ref, watch } from "vue";

import type { Toast } from "../toasts";

/**
 * The toast, as the 2008 dashboard drew it, measured off captures of the real
 * thing: a dark grey pill with a pale rim that grows out of a disc, the disc a
 * black centre in a grey ring cut by four black gaps with a green arc on its
 * upper left, and two left-aligned lines. The disc shows the Xbox ball and, for
 * an achievement or a friend, cross-fades to a trophy or a friends icon
 * through black on a two second cycle, a second to a face.
 *
 * It is authored 116px tall and drawn at 0.828, which takes retail's 64px at
 * 720p to 96px at 1080p.
 *
 * Everything that moves is its own promoted layer resting at rest, so opening
 * changes transforms and opacities on layers that already exist: the pill's
 * body grows by `scaleX` and its right cap rides the growing edge.
 */
const props = defineProps<{
  toast: Toast | null;
  shown: boolean;
}>();

const FONT = '400 40px "Segoe UI", Inter, sans-serif';
/** No pill is narrower than one that holds this on a line. */
const FLOOR_TEXT = "Ana is online";
let ruler: CanvasRenderingContext2D | null | undefined;

/** A line's drawn width: measured in the toast's face, or about 19px a character where there is no canvas. */
function lineWidth(text: string): number {
  if (ruler === undefined) ruler = document.createElement("canvas").getContext("2d");
  if (!ruler) return 19 * text.length;
  ruler.font = FONT;
  return ruler.measureText(text).width + 1.5 * text.length + 1;
}

/** The pill hugs its longer line: the disc and a margin either side of the words. */
const width = computed(() => {
  const longest = Math.max(
    lineWidth(FLOOR_TEXT),
    lineWidth(props.toast?.title ?? ""),
    lineWidth(props.toast?.body ?? ""),
  );
  return Math.min(1000, Math.round(190 + longest));
});

/** Set once the toast has been shown, so the exit plays on the hide and not at mount. */
const seen = ref(props.shown);
watch(
  () => props.shown,
  (shown) => {
    if (shown) seen.value = true;
  },
);
</script>

<template>
  <div
    class="toast"
    :data-shown="shown || undefined"
    :data-seen="seen || undefined"
    :data-icon="toast?.icon ?? 'xbox'"
    :style="{ '--w': `${width}px` }"
  >
    <i class="cap-l" />
    <i class="body" />
    <i class="cap-r" />
    <span class="disc">
      <i class="ring" />
      <i class="ball" />
      <svg class="alt trophy" viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M18 8h28v4h10v8c0 8-6 14-14 15-2 4-5 7-9 8v7h8v6H23v-6h8v-7c-4-1-7-4-9-8-8-1-14-7-14-15v-8h10zM14 18v2c0 4 3 7 7 8-2-3-3-6-3-10zm36 0h-4c0 4-1 7-3 10 4-1 7-4 7-8z"
        />
      </svg>
      <i class="alt console-art" />
      <svg class="alt console" viewBox="0 0 64 64" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M28 7h8a3 3 0 0 1 3 3v10q-1.8 16.5 0 33a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3q1.8-16.5 0-33V10a3 3 0 0 1 3-3zm4 29.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z"
        />
      </svg>
      <svg class="alt friends" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="24" cy="21" r="9" />
        <path d="M6 50c0-10 8-16 18-16s18 6 18 16z" />
        <circle cx="45" cy="25" r="7" />
        <path d="M38 38c10-4 21 2 21 12H46c0-5-3-9-8-12z" />
      </svg>
    </span>
    <span class="words">
      <b>{{ toast?.title }}</b>
      <em>{{ toast?.body }}</em>
    </span>
  </div>
</template>

<style scoped>
.toast {
  position: absolute;
  z-index: 100;
  left: calc(960px - var(--w) / 2);
  top: 862px;
  width: var(--w);
  height: 116px;
  opacity: 0.001;
  transform: translate3d(0, 20px, 0) scale(0.828);
  will-change: transform, opacity;
  pointer-events: none;
}

.toast[data-shown] {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(0.828);
  transition:
    transform 260ms ease-out,
    opacity 200ms ease-out;
}

/* Holds the toast up while the exit plays, 900ms in retail. */
.toast[data-seen]:not([data-shown]) {
  animation: toast-hold 900ms linear;
}

@keyframes toast-hold {
  from,
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(0.828);
  }
}

.cap-l,
.body,
.cap-r {
  position: absolute;
  top: 0;
  height: 116px;
  box-sizing: border-box;
  background: linear-gradient(180deg, #4b4d4d 0%, #3b3d3d 100%);
  border: 0 solid rgba(206, 210, 210, 0.55);
}

.cap-l {
  left: 0;
  width: 58px;
  border-width: 3px 0 3px 3px;
  border-radius: 58px 0 0 58px;
}

.body {
  left: 56px;
  width: calc(var(--w) - 112px);
  border-width: 3px 0;
  transform: scaleX(0.001);
  transform-origin: 0 0;
  will-change: transform, opacity;
}

.cap-r {
  left: calc(var(--w) - 58px);
  width: 58px;
  border-width: 3px 3px 3px 0;
  border-radius: 0 58px 58px 0;
  transform: translate3d(calc(116px - var(--w)), 0, 0);
  will-change: transform, opacity;
}

.cap-l {
  will-change: opacity;
}

/*
 * The pill, from retail's scene (frames at 60 per second): it appears at 383ms,
 * unrolls to 1.194 by 733ms and settles by 850ms. The right cap rides the
 * body's edge. On the way out it rolls back over the last 200ms and fades.
 */
.toast[data-shown] .cap-l {
  animation: pill-in 850ms linear both;
}

.toast[data-shown] .body {
  animation: body-in 850ms linear both;
}

.toast[data-shown] .cap-r {
  animation: cap-in 850ms linear both;
}

.toast[data-seen]:not([data-shown]) .cap-l {
  animation: pill-out 900ms linear both;
}

.toast[data-seen]:not([data-shown]) .body {
  animation: body-out 900ms linear both;
}

.toast[data-seen]:not([data-shown]) .cap-r {
  animation: cap-out 900ms linear both;
}

@keyframes pill-in {
  0%,
  45% {
    opacity: 0.001;
  }
  53%,
  100% {
    opacity: 1;
  }
}

@keyframes body-in {
  0%,
  45% {
    opacity: 0.001;
    transform: scaleX(0.1);
  }
  53% {
    opacity: 1;
    transform: scaleX(0.1);
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  86.2% {
    opacity: 1;
    transform: scaleX(1.194);
    animation-timing-function: linear;
  }
  100% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes cap-in {
  0%,
  45% {
    opacity: 0.001;
    transform: translate3d(calc(-0.9 * (var(--w) - 112px)), 0, 0);
  }
  53% {
    opacity: 1;
    transform: translate3d(calc(-0.9 * (var(--w) - 112px)), 0, 0);
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  86.2% {
    opacity: 1;
    transform: translate3d(calc(0.194 * (var(--w) - 112px)), 0, 0);
    animation-timing-function: linear;
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes pill-out {
  0%,
  77.7% {
    opacity: 1;
  }
  100% {
    opacity: 0.001;
  }
}

@keyframes body-out {
  0%,
  77.7% {
    opacity: 1;
    transform: scaleX(1);
    animation-timing-function: ease-in;
  }
  100% {
    opacity: 0.001;
    transform: scaleX(0.076);
  }
}

@keyframes cap-out {
  0%,
  77.7% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    animation-timing-function: ease-in;
  }
  100% {
    opacity: 0.001;
    transform: translate3d(calc(-0.924 * (var(--w) - 112px)), 0, 0);
  }
}

.disc {
  position: absolute;
  left: 5px;
  top: 4px;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  background: #0a0b0b;
  will-change: transform, opacity;
}

/*
 * The disc's backing grows 0.1 to 1.45 by 467ms and settles to 1 by 650ms. On
 * the way out it swells to 1.45 over 400ms and shrinks to 0.2 by 783ms.
 */
.toast[data-shown] .disc {
  animation: disc-in 650ms linear both;
}

.toast[data-seen]:not([data-shown]) .disc {
  animation: disc-out 900ms linear both;
}

@keyframes disc-in {
  0% {
    opacity: 0.001;
    transform: scale(0.1);
    animation-timing-function: cubic-bezier(0, 0, 0.58, 1);
  }
  71.8% {
    opacity: 1;
    transform: scale(1.45);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes disc-out {
  0%,
  18.5% {
    opacity: 1;
    transform: scale(1);
    animation-timing-function: ease-in-out;
  }
  44.4% {
    opacity: 1;
    transform: scale(1.45);
    animation-timing-function: ease-in-out;
  }
  87% {
    opacity: 1;
    transform: scale(0.2);
  }
  100% {
    opacity: 0.001;
    transform: scale(0.2);
  }
}

.ring,
.ball,
.alt {
  position: absolute;
  border-radius: 50%;
}

/* Four grey quarters cut by black notches, the upper left one green. The mask
   leaves only the band between 68% and 85% of the disc's radius. */
.ring {
  inset: 0;
  background: conic-gradient(
    transparent 0deg 7.5deg,
    #767a7d 7.5deg 82.5deg,
    transparent 82.5deg 97.5deg,
    #767a7d 97.5deg 172.5deg,
    transparent 172.5deg 187.5deg,
    #767a7d 187.5deg 262.5deg,
    transparent 262.5deg 277.5deg,
    #8fd41c 277.5deg 352.5deg,
    transparent 352.5deg 360deg
  );
  -webkit-mask: radial-gradient(
    circle closest-side,
    transparent 0 67%,
    #000 68% 85%,
    transparent 86%
  );
}

.ball,
.alt {
  left: 19px;
  top: 19px;
  width: 70px;
  height: 70px;
}

.ball {
  background: var(--theme-orb) center / 100% 100% no-repeat;
  will-change: opacity;
}

.alt {
  fill: #f0f2f3;
  opacity: 0.001;
  will-change: opacity;
}

.alt {
  display: none;
}

.toast[data-icon="achievement"] .trophy,
.toast[data-icon="friend"] .friends,
.toast[data-icon="signin"] .console {
  display: block;
}

.console-art {
  background: var(--theme-console) center / 80% 80% no-repeat;
}

:root[data-console-art] .toast[data-icon="signin"] .console {
  display: none;
}

:root[data-console-art] .toast[data-icon="signin"] .console-art {
  display: block;
}

.toast[data-shown][data-icon="achievement"] .ball,
.toast[data-shown][data-icon="friend"] .ball,
.toast[data-shown][data-icon="signin"] .ball {
  animation: toast-ball 2000ms linear infinite;
}

.toast[data-shown][data-icon="achievement"] .alt,
.toast[data-shown][data-icon="friend"] .alt,
.toast[data-shown][data-icon="signin"] .alt {
  animation: toast-alt 2000ms linear infinite;
}

@keyframes toast-ball {
  0%,
  45.85% {
    opacity: 1;
  }
  50%,
  95.85% {
    opacity: 0.001;
  }
  100% {
    opacity: 1;
  }
}

@keyframes toast-alt {
  0%,
  45.85% {
    opacity: 0.001;
  }
  50%,
  95.85% {
    opacity: 1;
  }
  100% {
    opacity: 0.001;
  }
}

.words {
  position: absolute;
  left: 130px;
  right: 60px;
  top: 0;
  height: 116px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  color: #d9dddd;
  opacity: 0.001;
  will-change: opacity;
}

.toast[data-shown] .words {
  opacity: 1;
  transition: opacity 100ms linear 633ms;
}

.toast[data-seen]:not([data-shown]) .words {
  animation: words-out 900ms linear;
}

@keyframes words-out {
  0%,
  57.5% {
    opacity: 1;
  }
  68.6%,
  100% {
    opacity: 0.001;
  }
}

b,
em {
  font-family: "Segoe UI", Inter, sans-serif;
  font-size: 40px;
  font-style: normal;
  font-weight: 400;
  letter-spacing: 1.5px;
  -webkit-text-stroke: 0.5px currentColor;
  line-height: 50px;
  white-space: nowrap;
}
</style>
