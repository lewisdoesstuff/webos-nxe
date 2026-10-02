<script setup lang="ts" vapor>
import { computed, nextTick, ref, watch } from "vue";

import { shownArt, shownColor } from "../artCache";
import { HIDDEN, LABEL_H, LABEL_W, MOVE_EASE, MOVE_MS, placePool, type PooledPane } from "../hub";
import {
  DEAL_FRAMES_MS,
  FOLD_FRAMES_MS,
  LEAVE,
  RETURN,
  dealSlotFrames,
  foldSlotFrames,
  keyframe,
  slotFrame,
  swingFrames,
} from "../hubMotion";
import {
  PAGE_POOL_SIZE,
  pageSlot,
  PAGE_PANE_H,
  PAGE_PANE_W,
  TITLE_CENTRE_Y,
  TITLE_X,
} from "../pageRow";
import { artTint, initialsFor, paneArt, type PaneItem } from "../panel";
import { PARKED, useParked } from "../parked";
import { play, stop } from "../shell/scripted";

/**
 * A drilled page: its title and a row of panes receding like the hub's.
 *
 * The panes are a fixed pool, mounted before the page is opened and recycled
 * as the focus moves, so opening, closing and moving change transforms and
 * opacities on textures that already exist. A closed page rests every pane at
 * `HIDDEN` on its own slot. Opening and closing run retail's scene transition
 * (`hubMotion.ts`): the focused pane swings in about its right edge once the
 * hub's card has swung away and the rest deal out after it; closing, the rest
 * fold away and it swings back out. The shell latches `items` when it opens,
 * so a channel change repaints nothing here.
 */
const props = defineProps<{
  title: string;
  items: readonly PaneItem[];
  focus: number;
  open: boolean;
}>();

const parked = useParked(() => props.open, RETURN.title[1]);

/** While the scene transition runs, the panes' CSS transitions stand aside for it. */
const scripted = ref(false);
let scriptTimer: ReturnType<typeof setTimeout> | undefined;

const paneBoxPx = { width: PAGE_PANE_W, height: PAGE_PANE_H };

function paneElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-page-layer] > .pane"));
}

watch(
  () => props.open,
  async (open) => {
    const total = open ? LEAVE.arrive[1] + DEAL_FRAMES_MS : RETURN.depart[1];
    scripted.value = true;
    clearTimeout(scriptTimer);
    scriptTimer = setTimeout(() => (scripted.value = false), total);
    await nextTick();
    const elements = paneElements();
    for (const pane of pool.value) {
      const element = elements[pane.element];
      if (!element) continue;
      stop(element);
      if (pane.item === null || pane.offset < 0 || pane.slot.opacity <= HIDDEN) continue;
      const rest = slotFrame(pane.slot);
      if (pane.offset === 0) {
        const window = open ? LEAVE.arrive : RETURN.depart;
        const frames = open
          ? swingFrames(rest, -90, 0, window, window[1], true, paneBoxPx, "right")
          : swingFrames(rest, 0, -90, window, window[1], false, paneBoxPx, "right");
        play(element, frames, { duration: window[1], easing: "linear" });
      } else if (open) {
        play(element, dealSlotFrames(pane.offset, pageSlot).map(keyframe), {
          duration: DEAL_FRAMES_MS,
          delay: LEAVE.arrive[1],
          easing: "linear",
          fill: "backwards",
        });
      } else {
        play(element, foldSlotFrames(pane.offset, pageSlot).map(keyframe), {
          duration: FOLD_FRAMES_MS,
          easing: "linear",
        });
      }
    }
  },
);

const pool = computed(() => placePool(props.focus, props.items.length, pageSlot, PAGE_POOL_SIZE));

function itemOf(pane: PooledPane): PaneItem | null {
  return pane.item === null ? null : (props.items[pane.item] ?? null);
}

function paneStyle(pane: PooledPane): Record<string, string> {
  const { x, y, scale, opacity, z } = pane.slot;
  const shown = props.open ? opacity : HIDDEN;
  const move = `transform ${MOVE_MS}ms ${MOVE_EASE}, opacity ${MOVE_MS}ms ${MOVE_EASE}`;
  return {
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
    opacity: `${shown}`,
    "z-index": `${z}`,
    transition: scripted.value ? "none" : props.open ? move : `opacity 150ms linear`,
  };
}

function focused(pane: PooledPane): boolean {
  return props.open && pane.item !== null && pane.item === props.focus;
}

function focusStyle(pane: PooledPane, shown: number): Record<string, string> {
  return { opacity: `${focused(pane) ? shown : HIDDEN}` };
}

function flatColor(pane: PooledPane): string | null {
  const item = itemOf(pane);
  return item ? shownColor(paneArt(item)) : null;
}

function artStyle(pane: PooledPane): Record<string, string> {
  const flat = flatColor(pane);
  if (flat) return { background: flat };
  const tint = artTint(itemOf(pane)?.iconColor);
  return { background: `linear-gradient(180deg, ${tint.top}, ${tint.bottom})` };
}

const paneBox = { width: `${PAGE_PANE_W}px`, height: `${PAGE_PANE_H}px` };

const titleStyle = computed((): Record<string, string> => ({
  left: `${TITLE_X}px`,
  top: `${TITLE_CENTRE_Y - LABEL_H / 2}px`,
  width: `${LABEL_W}px`,
  height: `${LABEL_H}px`,
  "line-height": `${LABEL_H}px`,
  opacity: props.open ? "1" : `${HIDDEN}`,
  transition: props.open
    ? `opacity ${LEAVE.title[1] - LEAVE.title[0]}ms linear ${LEAVE.title[0]}ms`
    : `opacity ${RETURN.title[1] - RETURN.title[0]}ms linear ${RETURN.title[0]}ms`,
}));
</script>

<template>
  <div
    class="page"
    data-page-layer
    :data-open="open || undefined"
    :style="{ transform: parked ? PARKED : 'none' }"
  >
    <span class="title" :style="titleStyle">{{ title }}</span>
    <div class="pane" v-for="pane in pool" :key="pane.element" :style="[paneBox, paneStyle(pane)]">
      <div class="clip">
        <span class="name" :class="{ two: itemOf(pane)?.detail }">{{
          itemOf(pane)?.title ?? ""
        }}</span>
        <span v-if="itemOf(pane)?.detail" class="sub">{{ itemOf(pane)?.detail }}</span>
        <div class="art" :class="{ flat: flatColor(pane) }" :style="artStyle(pane)">
          <img
            v-if="itemOf(pane) && paneArt(itemOf(pane)!)"
            :src="shownArt(paneArt(itemOf(pane)!))!"
            alt=""
          />
          <span v-else class="initial">{{ initialsFor(itemOf(pane)?.title ?? "") }}</span>
        </div>
      </div>
      <div class="go" :style="focusStyle(pane, 1)"><span>Launch</span></div>
      <div class="mirror" :style="focusStyle(pane, 0.24)">
        <div class="flip" :style="paneBox">
          <div class="skin" />
          <div class="go static" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}

/* Text alone at rest opacity is never drawn, so it would allocate on first open;
   a background too faint to see keeps its texture from the start, and
   will-change: transform keeps it rastered while the page is parked. */
.title {
  position: absolute;
  color: rgba(255, 255, 255, 0.92);
  font-size: 48px;
  letter-spacing: 1.3px;
  white-space: nowrap;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.004);
  will-change: transform, opacity;
}

.pane {
  position: absolute;
  top: 0;
  left: 0;
  color: #fff;
  transform-origin: 0 0;
  will-change: transform, opacity;
}

.clip,
.skin {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 3px;
  background: linear-gradient(
    180deg,
    #3a4f58 0%,
    #2b414c 22%,
    #1f3540 50%,
    #142833 80%,
    #10212d 100%
  );
}

.clip::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 2px solid rgba(255, 255, 255, 0.24);
  border-radius: 3px;
  pointer-events: none;
}

.name {
  position: absolute;
  top: 36px;
  left: 51px;
  right: 51px;
  overflow: hidden;
  font-size: 37px;
  line-height: 52px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.name.two {
  top: 22px;
}

.sub {
  position: absolute;
  top: 76px;
  left: 51px;
  right: 51px;
  overflow: hidden;
  font-size: 22px;
  line-height: 26px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.7);
}

.art {
  position: absolute;
  top: 108px;
  left: 51px;
  right: 51px;
  height: 236px;
  overflow: hidden;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.16);
}

.art::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    172deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.04) 46%,
    rgba(255, 255, 255, 0) 47%
  );
}

.art img {
  position: absolute;
  top: 24px;
  left: 50%;
  width: 188px;
  height: 188px;
  margin-left: -94px;
  border-radius: 30px;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
}

.art.flat img {
  top: 0;
  width: 236px;
  height: 236px;
  margin-left: -118px;
  border-radius: 0;
  box-shadow: none;
}

.initial {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 110px;
  color: rgba(255, 255, 255, 0.9);
}

.go {
  position: absolute;
  left: 51px;
  right: 51px;
  bottom: 32px;
  height: 70px;
  overflow: hidden;
  border-radius: 3px;
  will-change: opacity;
  transition: opacity 150ms linear;
  background: linear-gradient(
    180deg,
    #a9d07f 0%,
    #8fc25a 28%,
    #4d9a00 52%,
    #57a308 78%,
    #72b71d 100%
  );
}

.go.static {
  bottom: 32px;
  will-change: auto;
  transition: none;
}

.mirror {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 110px;
  margin-top: 3px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0%, transparent 100%);
  will-change: opacity;
  transition: opacity 150ms linear;
}

.flip {
  position: absolute;
  top: 0;
  left: 0;
  transform: scaleY(-1);
}

.go::before {
  content: "";
  position: absolute;
  inset: 0 0 50% 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.04));
}

.go span {
  position: relative;
  display: block;
  padding-left: 18px;
  font-size: 31px;
  line-height: 70px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .pane,
  .title {
    transition: none !important;
  }
}
</style>
