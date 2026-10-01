<script setup lang="ts" vapor>
import { computed } from "vue";

import type { Toast } from "../toasts";

/**
 * The toast, as the 2008 dashboard drew it, measured off captures of the real
 * thing: a dark grey pill with a pale rim that grows out of a disc, the disc a
 * black centre in a grey ring cut by four black gaps with a green arc on its
 * upper left, and two left-aligned lines. The disc shows the Xbox ball and, for
 * an achievement or a friend, cross-fades to a trophy or a friends icon
 * through black every one and a half seconds.
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
</script>

<template>
  <div
    class="toast"
    :data-shown="shown || undefined"
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
      <svg class="alt console" viewBox="0 0 64 64" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M28 7h8a3 3 0 0 1 3 3v22q-1.8 10.5 0 21a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3q1.8-10.5 0-21V10a3 3 0 0 1 3-3zm4 29.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"
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
  transition:
    transform 260ms ease-out,
    opacity 200ms ease-out;
  will-change: transform, opacity;
  pointer-events: none;
}

.toast[data-shown] {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(0.828);
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
  transition: transform 460ms cubic-bezier(0.2, 0.7, 0.2, 1);
  will-change: transform;
}

.cap-r {
  left: calc(var(--w) - 58px);
  width: 58px;
  border-width: 3px 3px 3px 0;
  border-radius: 0 58px 58px 0;
  transform: translate3d(calc(116px - var(--w)), 0, 0);
  transition: transform 460ms cubic-bezier(0.2, 0.7, 0.2, 1);
  will-change: transform;
}

.toast[data-shown] .body {
  transform: scaleX(1);
}

.toast[data-shown] .cap-r {
  transform: translate3d(0, 0, 0);
}

.disc {
  position: absolute;
  left: 5px;
  top: 4px;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  background: #0a0b0b;
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

.toast[data-shown][data-icon="achievement"] .ball,
.toast[data-shown][data-icon="friend"] .ball,
.toast[data-shown][data-icon="signin"] .ball {
  animation: toast-ball 1500ms linear infinite;
}

.toast[data-shown][data-icon="achievement"] .alt,
.toast[data-shown][data-icon="friend"] .alt,
.toast[data-shown][data-icon="signin"] .alt {
  animation: toast-alt 1500ms linear infinite;
}

@keyframes toast-ball {
  0%,
  40% {
    opacity: 1;
  }
  46%,
  90% {
    opacity: 0.001;
  }
  96%,
  100% {
    opacity: 1;
  }
}

@keyframes toast-alt {
  0%,
  46% {
    opacity: 0.001;
  }
  52%,
  84% {
    opacity: 1;
  }
  90%,
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
  transition: opacity 240ms ease-out;
  will-change: opacity;
}

.toast[data-shown] .words {
  opacity: 1;
  transition-delay: 320ms;
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
