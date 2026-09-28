<script setup lang="ts" vapor>
import { computed } from "vue";

import {
  counterText,
  DRILL_EASE_IN,
  DRILL_EASE_OUT,
  DRILL_MS,
  FOOT_H,
  groupTitle,
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

/**
 * One drilled-in page, as a single surface that is mounted before it is opened.
 *
 * The contract with the shell, which is the thing that makes the drill free:
 *
 * - Mount one of these per page that can be opened, at the hub, and leave it
 *   there. The surface is closed at `opacity: 0` on the hub panel's box, so a
 *   page is never created, destroyed or resized by the key that opens it. The
 *   layer and its texture are on the compositor before the press.
 * - `page` is fixed for the life of the instance. A surface that changed its
 *   page would re-raster at the press, which is a repaint the budget can afford
 *   but is not the invariant the gate enforces.
 * - `open` is the only thing the drill changes, and it changes one transform and
 *   one opacity. Both are already-promoted properties on a surface whose layer
 *   is already there.
 * - `focus` may be the stack top's focus, shared with the closed pages. A closed
 *   surface's rows re-render with it, which is free because the surface is not
 *   on screen and its layer does not change size.
 * - Paint the hub beneath these. The prompt row is the shell's, at the foot of
 *   the screen and clear of the panel; the `A`/`B`/`X`/`Y` captions for the open
 *   page come from `pagePrompts` in `pages.ts`.
 *
 * A list and a dialog are the same box with the same elements, so a dialog costs
 * what a page costs and changing between them changes no layer. `docs/PERF.md`
 * records the drill as the project's open risk, and the whole of the answer is
 * that the surface is 544x315 rather than the frame: 2.61MiB on this panel
 * against 31.64MiB for one full frame and 63.3MiB for two of them cross-fading.
 */

const props = defineProps<{
  page: Page;
  focus: PageFocus;
  open: boolean;
  /** The box a closed surface rests on. The hub panel, unless the shell says otherwise. */
  rest?: Box;
}>();

const rest = computed(() => pageRest(props.rest ?? HUB_PANEL_BOX));

/**
 * The surface's own box and its two transforms.
 *
 * The closed transform is `pageRest` applied to the resting box, and the open one
 * is the identity, so the drill interpolates between them on a layer whose
 * bounds never change. `docs/PERF.md` is explicit that a transform leaves layer
 * bounds alone and that a layer's texture is measured from them, which is the
 * whole reason the page grows out of the panel rather than resizing into it.
 */
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

/**
 * The row track's own transform, which carries the sub-row part of the scroll.
 *
 * Whole rows move by swapping which item each slot holds, so this is bounded by
 * one row and the track stays a fixed `TRACK_H` tall whatever the list holds. A
 * track that grew with the list would resize a promoted layer mid-move.
 */
const track = computed((): Record<string, string> => ({
  transform: `translate3d(0, ${-trackOffset(props.page, props.focus)}px, 0)`,
}));

function rowStyle(row: Row): Record<string, string> {
  return { top: `${row.y}px` };
}

const list = computed(() => rows(props.page, props.focus));
const counter = computed(() => counterText(props.page, props.focus));
const more = computed(() => hasMoreBelow(props.page, props.focus));

/**
 * The focused group's own title, carried so a probe can read it over CDP.
 *
 * Nothing in the research places a group title on screen, so nothing here draws
 * one: the counter is the only group affordance that was measured.
 */
const group = computed(() => groupTitle(props.page, props.focus));
</script>

<template>
  <div
    class="page"
    :data-page="page.id"
    :data-kind="page.kind"
    :data-open="open || undefined"
    :style="style"
  >
    <div class="head">
      <span class="title">{{ page.title }}</span>
    </div>

    <div class="list" :data-group="group">
      <div class="track" :style="track">
        <div
          v-for="row in list"
          :key="row.index"
          class="row"
          :data-focused="row.focused"
          :style="rowStyle(row)"
        >
          <span class="row-label">{{ row.label }}</span>
          <span class="row-note">{{ row.note }}</span>
        </div>
      </div>

      <span class="more" :data-on="more || undefined" />
    </div>

    <div class="foot">
      <span class="counter">{{ counter }}</span>
    </div>
  </div>
</template>

<style scoped>
/*
 * Promoted from the first frame, and closed rather than absent. `will-change` is
 * what makes the compositor own this box, and `opacity: 0` is what the closed
 * state is, so the layer and its 544x315 bounds are on the compositor before the
 * press that shows it. A surface mounted on open would be an allocation, and
 * that is the thing `tools/gate.mjs` exists to fail.
 *
 * The one thing this cannot prove on its own, and the thing to check on the TV:
 * `docs/PERF.md` measures a layer as `w * h * 4` from its bounds, so the gate
 * sees an identical layer before and during whether or not Chromium has
 * rasterised its tiles yet. A composited layer at opacity 0 is very likely
 * rasterised on the compositor's own schedule, and a first raster of one
 * 544x315 surface is 2.61MiB on one frame rather than 63MiB, so even the
 * pessimistic answer is a twentieth of the budget. What it must not be is a
 * layer that does not exist, and `will-change` is what rules that out.
 *
 * Nothing inside moves except the track, so this is the only box here promoted
 * by its own motion, plus the track.
 */
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

/* The incoming direction is the decelerating family, which is 251 of the scene
   file's 275 eased keyframes. Its mirror, 24 of them, is the outgoing one. */
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

/*
 * The window is 211 tall and the rows are 40, so five rows stand whole and the
 * sixth is cut by 29 of its 40. That is the clipped item NXE ended a list on,
 * and it is free: a window height that is not a whole number of rows clips its
 * last row by construction.
 */
.list {
  position: relative;
  height: var(--list-h);
  overflow: hidden;
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

/* The Guide drew the selected row on a green highlight bar. We have no measured
   selection colour, so this is the dashboard's own A-button green. `rows` never
   marks a blank slot focused, so this never lands on an empty row. */
.row[data-focused] {
  background: var(--selection);
  color: #08150a;
}

.row-note {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
}

.row[data-focused] .row-note {
  color: rgba(8, 21, 10, 0.72);
}

/* The chevron is a rotated corner rather than an asset, and it is shown only
   while there is more of the list below the window. */
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

.foot {
  display: flex;
  align-items: center;
  height: var(--foot-h);
  padding: 0 20px;
}

.counter {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

@media (prefers-reduced-motion: reduce) {
  .page,
  .track,
  .more {
    transition: none;
  }
}
</style>
