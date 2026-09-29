<script setup lang="ts" vapor>
import { computed } from "vue";

import { HIDDEN, LABEL_H, LABEL_W, MOVE_EASE, MOVE_MS, placePool, type PooledPane } from "../hub";
import {
  PAGE_POOL_SIZE,
  pageSlot,
  PAGE_PANE_H,
  PAGE_PANE_W,
  TITLE_CENTRE_Y,
  TITLE_X,
} from "../pageRow";
import { artTint, initialsFor, paneArt, type PaneItem } from "../panel";

/**
 * A drilled page: its title and a row of panes receding like the hub's.
 *
 * The panes are a fixed pool, mounted before the page is opened and recycled
 * as the focus moves, so opening, closing and moving change transforms and
 * opacities on textures that already exist. A closed page rests every pane at
 * `HIDDEN` on its own slot, so opening is an opacity change alone. The shell
 * latches `items` when it opens, so a channel change repaints nothing here.
 */
const props = defineProps<{
  title: string;
  items: readonly PaneItem[];
  focus: number;
  open: boolean;
}>();

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
    transition: props.open ? move : `opacity 150ms linear`,
  };
}

function focused(pane: PooledPane): boolean {
  return props.open && pane.item !== null && pane.item === props.focus;
}

function focusStyle(pane: PooledPane, shown: number): Record<string, string> {
  return { opacity: `${focused(pane) ? shown : HIDDEN}` };
}

function artStyle(pane: PooledPane): Record<string, string> {
  const tint = artTint(itemOf(pane)?.iconColor);
  return { background: `linear-gradient(180deg, ${tint.top}, ${tint.bottom})` };
}

function detail(pane: PooledPane): string {
  const id = itemOf(pane)?.id ?? "";
  return id.includes(".") ? id : "";
}

const paneBox = { width: `${PAGE_PANE_W}px`, height: `${PAGE_PANE_H}px` };

const titleStyle = computed((): Record<string, string> => ({
  left: `${TITLE_X}px`,
  top: `${TITLE_CENTRE_Y - LABEL_H / 2}px`,
  width: `${LABEL_W}px`,
  height: `${LABEL_H}px`,
  "line-height": `${LABEL_H}px`,
  opacity: props.open ? "1" : `${HIDDEN}`,
}));
</script>

<template>
  <div class="page" :data-open="open || undefined">
    <span class="title" :style="titleStyle">{{ title }}</span>
    <div class="pane" v-for="pane in pool" :key="pane.element" :style="[paneBox, paneStyle(pane)]">
      <div class="clip">
        <span class="name">{{ itemOf(pane)?.title ?? "" }}</span>
        <div class="art" :style="artStyle(pane)">
          <img v-if="itemOf(pane) && paneArt(itemOf(pane)!)" :src="paneArt(itemOf(pane)!)!" alt="" />
          <span v-else class="initial">{{ initialsFor(itemOf(pane)?.title ?? "") }}</span>
        </div>
        <p class="body">{{ detail(pane) }}</p>
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

.title {
  position: absolute;
  color: #fff;
  font-size: 48px;
  white-space: nowrap;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  will-change: opacity;
  transition: opacity 150ms linear;
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

.initial {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 110px;
  color: rgba(255, 255, 255, 0.9);
}

.body {
  position: absolute;
  top: 366px;
  left: 51px;
  right: 51px;
  margin: 0;
  overflow: hidden;
  font-size: 23px;
  line-height: 32px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.55);
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
