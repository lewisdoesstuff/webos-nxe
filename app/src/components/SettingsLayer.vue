<script setup lang="ts" vapor>
import { computed } from "vue";

import {
  DRILL_EASE_IN,
  DRILL_EASE_OUT,
  DRILL_MS,
  FOOT_H,
  hasMoreBelow,
  HEADER_H,
  HUB_PANEL_BOX,
  LIST_H,
  LIST_MS,
  PAGE_H,
  PAGE_W,
  PAGE_X,
  PAGE_Y,
  pageRest,
  ROW_H,
  rows,
  trackOffset,
  TRACK_H,
  type Page,
  type PageFocus,
  type Row,
} from "../pages";
import { BUTTON_FILL } from "../prompts";
import type { Box } from "../ribbon";
import type { SettingDetail } from "../settingsScreen";

/**
 * One settings page, as a single surface mounted before it is opened.
 *
 * The same contract as `PageLayer`, which this mirrors: always mounted, closed
 * at `opacity: 0` on the hub panel's box, and the drill changes one transform
 * and one opacity on a layer that is already there. Read that component's
 * comment for the whole of the allocation story; nothing here differs except
 * the interior.
 *
 * The interior follows the retail settings screens (the walkthrough's Console
 * Settings and Display frames): the title in the head strip, the option list
 * down the left with the green highlight and the chevron, and the focused
 * row's detail down the right: its current values over its description. There
 * is no `n of m` counter, because retail drew none on these screens. Every box
 * inside is static paint on the one promoted surface.
 */

const props = defineProps<{
  page: Page;
  focus: PageFocus;
  open: boolean;
  detail: SettingDetail;
  /** The box a closed surface rests on. The hub panel, unless the shell says otherwise. */
  rest?: Box;
}>();

const rest = computed(() => pageRest(props.rest ?? HUB_PANEL_BOX));

const style = computed((): Record<string, string> => {
  const at = rest.value;
  return {
    "--head-h": `${HEADER_H}px`,
    "--list-h": `${LIST_H}px`,
    "--foot-h": `${FOOT_H}px`,
    "--row-h": `${ROW_H}px`,
    "--track-h": `${TRACK_H}px`,
    "--drill-ms": `${DRILL_MS}ms`,
    "--list-ms": `${LIST_MS}ms`,
    "--drill-in": DRILL_EASE_IN,
    "--drill-out": DRILL_EASE_OUT,
    "--selection": BUTTON_FILL.a,
    left: `${PAGE_X}px`,
    top: `${PAGE_Y}px`,
    width: `${PAGE_W}px`,
    height: `${PAGE_H}px`,
    transformOrigin: `${at.originX}px ${at.originY}px`,
    transform: props.open
      ? "translate3d(0, 0, 0) scale(1, 1)"
      : `translate3d(${at.dx}px, ${at.dy}px, 0) scale(${at.scaleX}, ${at.scaleY})`,
  };
});

const track = computed((): Record<string, string> => ({
  transform: `translate3d(0, ${-trackOffset(props.page, props.focus)}px, 0)`,
}));

function rowStyle(row: Row): Record<string, string> {
  return { top: `${row.y}px` };
}

const list = computed(() => rows(props.page, props.focus));
const more = computed(() => hasMoreBelow(props.page, props.focus));
</script>

<template>
  <div class="page" :data-page="page.id" :data-open="open || undefined" :style="style">
    <div class="head">
      <span class="title">{{ page.title }}</span>
    </div>

    <div class="body">
      <div class="list">
        <div class="track" :style="track">
          <div
            v-for="row in list"
            :key="row.index"
            class="row"
            :data-focused="row.focused || undefined"
            :style="rowStyle(row)"
          >
            <span class="row-label">{{ row.label }}</span>
          </div>
        </div>

        <span class="more" :data-on="more || undefined" />
      </div>

      <div class="detail">
        <span class="current">Current Setting</span>
        <span v-for="value in detail.values" :key="value" class="value">{{ value }}</span>
        <span class="about">{{ detail.description }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  position: absolute;
  z-index: 1;
  border-radius: 7px;
  overflow: hidden;
  background: linear-gradient(165deg, #2b3038, #14181d 72%);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
  color: #f2f5f7;
  opacity: 0;
  will-change: transform, opacity;
  transition:
    transform var(--drill-ms) var(--drill-out),
    opacity var(--drill-ms) var(--drill-out);
}

.page[data-open] {
  opacity: 1;
  transition-timing-function: var(--drill-in);
}

.head {
  display: flex;
  align-items: center;
  height: var(--head-h);
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.title {
  font-size: 20px;
  font-weight: 700;
}

.body {
  display: flex;
  height: calc(var(--list-h) + var(--foot-h));
}

.list {
  position: relative;
  width: 264px;
  flex: 0 0 auto;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}

.track {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: var(--track-h);
  will-change: transform;
  transition: transform var(--list-ms) var(--drill-in);
}

.row {
  position: absolute;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: var(--row-h);
  padding: 0 20px;
  font-size: 15px;
  line-height: 1.15;
}

.row[data-focused] {
  background: var(--selection);
  color: #08150a;
}

.more {
  position: absolute;
  right: 18px;
  bottom: 10px;
  width: 9px;
  height: 9px;
  border-right: 2px solid rgba(255, 255, 255, 0.7);
  border-bottom: 2px solid rgba(255, 255, 255, 0.7);
  opacity: 0;
  transform: rotate(45deg);
  transition: opacity 120ms linear;
}

.more[data-on] {
  opacity: 1;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 20px;
  overflow: hidden;
}

.current {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
}

.value {
  font-size: 15px;
  color: #fff;
}

.about {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.68);
}

@media (prefers-reduced-motion: reduce) {
  .page,
  .track,
  .more {
    transition: none;
  }
}
</style>
