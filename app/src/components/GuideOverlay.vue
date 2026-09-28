<script setup lang="ts" vapor>
import { computed } from "vue";

import {
  BLADE_IDS,
  BULLET_D,
  CHANNELS,
  CHANNEL_BOX_H,
  CHANNEL_FONT,
  CHANNEL_W,
  CHANNEL_X,
  CHROME,
  CHEVRON_BOX,
  CLOCK_FONT,
  CLOCK_H,
  CLOCK_W,
  CLOCK_X,
  CLOCK_Y,
  DIM_ALPHA,
  guidePrompts,
  highlightBox,
  inChrome,
  ITEM_BAR_W,
  ITEM_FONT,
  ITEM_H,
  ITEM_PITCH,
  ITEM_ROWS,
  ITEM_X,
  ITEMS,
  OPEN_MS,
  OPEN_RISE,
  PANEL_H,
  PANEL_W,
  PANEL_X,
  PANEL_Y,
  PICPIC_H,
  PICPIC_W,
  PICPIC_X,
  PICPIC_Y,
  placeChannels,
  placeItems,
  placeSlabs,
  PROMPT_CELL_W,
  PROMPT_FONT,
  PROMPT_H,
  promptDisc,
  promptLabel,
  ROTATED_LINE,
  SELECT_MS,
  SLAB_H,
  SLAB_LABEL_FONT,
  SLAB_STAGGER_MS,
  SLAB_W,
  SPINNER_D,
  TAB_LABEL_FONT,
  TAB_W,
  channelBox,
  channelLabelX,
  slabLabelBox,
  slabOrigin,
  spinnerBox,
  tabLabelBox,
  within,
  type Box,
  type Channel,
  type ItemRow,
  type Slab,
} from "../guide";
import { BUTTON_FILL, BUTTON_RING, type Prompt } from "../prompts";
import { CANVAS_H, CANVAS_W } from "../ribbon";

/**
 * The Guide: the takeover the Guide button opens over the dashboard.
 *
 * It dims what is behind it rather than covering it, and its own chrome is
 * centred on the frame. Every box is in `guide.ts` with its provenance; nothing
 * here measures anything. The parent owns the selection and the keys, so this is
 * a controlled view: `blade`, `channel` and `item` in, nothing out.
 *
 * **The Guide is always mounted.** Every element exists from the first frame,
 * whether or not it is open, and no box resizes on a key press. That is the whole
 * of the allocation story. A `v-if` on the open state, or a row count that
 * followed the data, would create a compositor layer inside the transition and
 * `tools/gate.mjs` fails on a layer that appears. The four `v-for`s are over
 * arrays whose length is a constant (`CHANNELS.length`, `SLAB_COUNT`,
 * `ITEM_ROWS`, `PROMPT_COUNT`), so none of them can re-create, and every key is
 * the index rather than the label, so a selection change re-labels and
 * re-transforms elements that are already there.
 *
 * Opening it is then two things: the dim plane's opacity, and the chrome box's
 * transform and opacity. Both have a `will-change`, so the compositor has those
 * layers before the key is pressed. Inside the Guide the moving elements are
 * promoted on the same grounds, since a transform on an unpromoted box repaints
 * it every frame and the chrome box is 720x554 to repaint, so a channel change
 * is nine transform writes and no paint.
 *
 * The item rows are the exception. A selection only changes their opacity, and
 * animating that would cost either a layer each or sixteen repaints of the chrome
 * box, so the colour snaps and there is no transition to allocate for.
 *
 * Every box below is placed in the chrome's own coordinates by `inChrome`, and
 * the chrome's children are all siblings of it rather than nested, so there is
 * one coordinate space in the stylesheet and not three. The exception is a slab's
 * label, which has to be a child of the slab to travel with it, and that one is
 * placed with `within`.
 */

const props = withDefaults(
  defineProps<{
    open?: boolean;
    /** Index into `BLADE_IDS`: the blade the panel is showing. */
    blade?: number;
    /** Index into the channel list, 0 being the topmost channel. */
    channel?: number;
    /** Row of the item list the green bar is on. */
    item?: number;
    /** The focused blade's items, if the parent has them. */
    items?: readonly string[];
    /** The Guide's clock, already formatted by the caller. */
    clock?: string;
  }>(),
  { open: false, blade: 1, channel: 4, item: 0, clock: "" },
);

const bladeIds = BLADE_IDS;

/** The Guide's own prompt row, the one array `prompts.ts` built. */
const prompts = guidePrompts();

/**
 * The selection, clamped into its own list. Clamping here rather than trusting
 * the caller keeps a bad index off the geometry, and it cannot change the
 * element count: an index past the end is moved to the end, not dropped.
 */
const blade = computed(() => Math.min(Math.max(props.blade, 0), bladeIds.length - 1));
const channel = computed(() => Math.min(Math.max(props.channel, 0), CHANNELS.length - 1));
const item = computed(() => Math.min(Math.max(props.item, 0), ITEM_ROWS - 1));

/** The slab stack, cut from the same ring the focused blade's tab label is on. */
const slabs = computed(() => placeSlabs(blade.value, bladeIds));

const channels = computed(() => placeChannels(CHANNELS, channel.value));
const rows = computed(() =>
  placeItems(props.items ?? ITEMS[bladeIds[blade.value] ?? ""] ?? [], item.value),
);

/** Every constant the stylesheet needs, so the two cannot drift apart. */
const rootStyle: Record<string, string> = {
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`,
  "--chrome-x": `${CHROME.x}px`,
  "--chrome-y": `${CHROME.y}px`,
  "--chrome-w": `${CHROME.width}px`,
  "--chrome-h": `${CHROME.height}px`,
  "--open-ms": `${OPEN_MS}ms`,
  "--select-ms": `${SELECT_MS}ms`,
  "--stagger-ms": `${SLAB_STAGGER_MS}ms`,
  "--rise": `${OPEN_RISE}px`,
  "--dim": `${DIM_ALPHA}`,
  "--panel-w": `${PANEL_W}px`,
  "--panel-h": `${PANEL_H}px`,
  "--tab-w": `${TAB_W}px`,
  "--tab-font": `${TAB_LABEL_FONT}px`,
  "--spinner-d": `${SPINNER_D}px`,
  "--clock-w": `${CLOCK_W}px`,
  "--clock-h": `${CLOCK_H}px`,
  "--clock-font": `${CLOCK_FONT}px`,
  "--chan-w": `${CHANNEL_W}px`,
  "--chan-h": `${CHANNEL_BOX_H}px`,
  "--chan-font": `${CHANNEL_FONT}px`,
  "--label-x": `${channelLabelX() - CHANNEL_X}px`,
  "--bullet-d": `${BULLET_D}px`,
  "--item-bar-w": `${ITEM_BAR_W}px`,
  "--item-h": `${ITEM_H}px`,
  "--item-font": `${ITEM_FONT}px`,
  "--slab-w": `${SLAB_W}px`,
  "--slab-h": `${SLAB_H}px`,
  "--slab-font": `${SLAB_LABEL_FONT}px`,
  "--line": `${ROTATED_LINE}px`,
  "--prompt-cell": `${PROMPT_CELL_W}px`,
  "--prompt-h": `${PROMPT_H}px`,
  "--prompt-font": `${PROMPT_FONT}px`,
};

/** A canvas box as a style, moved into the chrome box's own coordinates. */
function at(box: Box): Record<string, string> {
  const b = inChrome(box);
  return {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.width}px`,
    height: `${b.height}px`,
  };
}

/**
 * A channel row, written at the full 384x42 and scaled down from its own top
 * left, so the element's box never changes and only the transform does. The
 * scale and the fade are the whole of a channel change.
 */
function channelStyle(row: Channel): Record<string, string> {
  const box = inChrome(channelBox(row));
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${CHANNEL_W}px`,
    height: `${CHANNEL_BOX_H}px`,
    transform: `scale(${row.scale})`,
    opacity: `${row.alpha}`,
  };
}

/** An item row, at its own slot, lit only while the bar is on it. */
function itemStyle(row: ItemRow): Record<string, string> {
  return {
    ...at({ x: ITEM_X, y: row.y, width: ITEM_BAR_W, height: ITEM_H }),
    opacity: row.selected ? "1" : "0.6",
  };
}

/**
 * A slab, written at the panel's height and scaled about its own mid-height, so
 * the recession is a transform on a box that does not change. The tilt hinges it
 * away from the panel, and `perspective` on the parent is what makes that read
 * as 3D rather than as a squash.
 */
function slabStyle(slab: Slab): Record<string, string> {
  return {
    ...at(slabOrigin(slab)),
    transform: `rotateY(${-slab.tilt}deg) scale(${slab.scale})`,
    transitionDelay: `${slab.d * SLAB_STAGGER_MS}ms`,
  };
}

/** A slab's label, inside the slab, so it recedes and tilts with it. */
function slabLabelStyle(slab: Slab): Record<string, string> {
  const box = within(slabOrigin(slab), slabLabelBox(slab));
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

/**
 * The green bar, written at the first row's slot and moved down by a transform.
 * Its layer is one box at one place whichever row is selected, so the bar moving
 * is a transform and not a paint into a new layer.
 */
function barStyle(): Record<string, string> {
  return {
    ...at(highlightBox(0)),
    transform: `translateY(${item.value * ITEM_PITCH}px)`,
  };
}

function discStyle(prompt: Prompt): Record<string, string> {
  return { "--fill": BUTTON_FILL[prompt.button], "--ring": BUTTON_RING[prompt.button] };
}

const PANEL: Box = { x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H };
const TAB: Box = { x: PANEL_X, y: PANEL_Y, width: TAB_W, height: PANEL_H };
const PIC: Box = { x: PICPIC_X, y: PICPIC_Y, width: PICPIC_W, height: PICPIC_H };
const CLOCK: Box = { x: CLOCK_X, y: CLOCK_Y, width: CLOCK_W, height: CLOCK_H };
</script>

<template>
  <div class="guide" :data-open="open || undefined" :style="rootStyle">
    <div class="dim" />

    <div class="chrome">
      <div
        v-for="row in channels"
        :key="row.d"
        class="channel"
        :data-channel="row.label"
        :data-selected="row.selected || undefined"
        :style="channelStyle(row)"
      >
        <span class="bullet" />
        <span class="word">{{ row.label }}</span>
      </div>

      <div class="gamerpic" :style="at(PIC)" />

      <div class="clock" :style="at(CLOCK)">{{ clock }}</div>

      <div class="slabs">
        <div
          v-for="slab in slabs"
          :key="slab.d"
          class="slab"
          :data-blade="slab.id"
          :data-offset="slab.d"
          :style="slabStyle(slab)"
        >
          <span class="slab-label" :style="slabLabelStyle(slab)">{{ slab.id }}</span>
        </div>
      </div>

      <div class="panel" :style="at(PANEL)" />
      <div class="tab" :style="at(TAB)" />
      <span class="spinner" :style="at(spinnerBox())" />
      <span class="tab-label" :style="at(tabLabelBox())">{{ bladeIds[blade] }}</span>

      <div class="bar" :style="barStyle()" />
      <div
        v-for="row in rows"
        :key="row.d"
        class="item"
        :data-item="row.label || undefined"
        :style="itemStyle(row)"
      >
        {{ row.label }}
      </div>
      <span class="chevron" :style="at(CHEVRON_BOX)" />

      <div
        v-for="(prompt, i) in prompts"
        :key="prompt.button"
        class="prompt"
        :data-button="prompt.button"
        :data-index="i"
      >
        <span class="disc" :style="[at(promptDisc(i)), discStyle(prompt)]">
          <span class="letter">{{ prompt.button.toUpperCase() }}</span>
        </span>
        <span class="word" :style="at(promptLabel(i))">{{ prompt.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * The overlay is a 1280x720 plane inside the hub's own canvas, so every
 * coordinate in `guide.ts` is the 720p pixel the research measured. It is never
 * promoted: at the root it would be a second full-frame layer for a box that
 * draws nothing itself.
 */
.guide {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  /*
   * No mouse support at all, VERIFIED in NXE-BOOT-INPUT.md section 3.8, so the
   * Guide never takes the pointer and never has to give it back.
   */
  pointer-events: none;
  z-index: 2;
}

/*
 * The dim. A full-frame plane, so it fills the frame it covers and the gate's
 * rule about a layer spanning the frame is met by the one thing this plane is
 * for. Flat, because a plane is one layer either way and this is the most
 * expensive element in the app.
 */
.dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, var(--dim));
  opacity: 0;
  will-change: opacity;
  transition: opacity var(--open-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.guide[data-open] .dim {
  opacity: 1;
}

/*
 * One box for the whole of the Guide's chrome, promoted so the open is a
 * transform and an opacity on a layer that is already there.
 */
.chrome {
  position: absolute;
  top: var(--chrome-y);
  left: var(--chrome-x);
  width: var(--chrome-w);
  height: var(--chrome-h);
  opacity: 0;
  transform: translate3d(0, var(--rise), 0);
  will-change: transform, opacity;
  transition:
    transform var(--open-ms) cubic-bezier(0.215, 0.61, 0.355, 1),
    opacity var(--open-ms) linear;
}

.guide[data-open] .chrome {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

/*
 * A channel row, written at the full 384x42 and scaled from its own top left, so
 * a channel change is a transform and an opacity and the box never resizes.
 */
.channel {
  position: absolute;
  transform-origin: 0 0;
  will-change: transform, opacity;
  color: #fff;
  font-size: var(--chan-font);
  font-weight: 700;
  line-height: var(--chan-h);
  white-space: nowrap;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6);
  transition:
    transform var(--select-ms) cubic-bezier(0.215, 0.61, 0.355, 1),
    opacity var(--select-ms) linear;
}

.bullet {
  position: absolute;
  left: 0;
  top: 50%;
  width: var(--bullet-d);
  height: var(--bullet-d);
  margin-top: calc(var(--bullet-d) / -2);
  background: #fff;
}

.channel .word {
  position: absolute;
  left: var(--label-x);
  top: 0;
}

/* The profile plate, centred above the panel at the gamerpic's own box. */
.gamerpic {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 3px;
  background: linear-gradient(160deg, #4a4f57, #22262b);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.clock {
  position: absolute;
  color: #fff;
  font-size: var(--clock-font);
  font-weight: 300;
  line-height: var(--clock-h);
  text-align: right;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}

/* The other blades, receding right. The perspective belongs here so the tilt on
   each slab reads as a hinge away from the panel and not as a squash. */
.slabs {
  position: absolute;
  inset: 0;
  perspective: 700px;
}

.slab {
  position: absolute;
  transform-origin: 0 50%;
  border-right: 1px solid rgba(255, 255, 255, 0.85);
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.62) 62%,
    rgba(255, 255, 255, 0.9) 100%
  );
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  will-change: transform;
  transition: transform var(--open-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.slab-label {
  position: absolute;
  transform: rotate(90deg);
  transform-origin: 0 0;
  color: #16181b;
  font-size: var(--slab-font);
  font-weight: 700;
  line-height: var(--line);
  white-space: nowrap;
}

/*
 * The panel, the tab strip and the arc are backgrounds and nothing else. They are
 * siblings of the rows rather than their parent so that every box in the chrome
 * is placed in one coordinate space.
 */
.panel {
  position: absolute;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(24, 26, 30, 0.96), rgba(12, 13, 16, 0.96));
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
}

.tab {
  position: absolute;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04));
}

/*
 * The arc above the tab label, the Guide's spinner. It is not animated: a
 * spinner is a promise that something is loading, and the Guide's content is
 * already resident, so there is nothing in flight to spin for.
 */
.spinner {
  position: absolute;
  margin-left: calc(var(--spinner-d) / -2);
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-top-color: transparent;
  border-radius: 50%;
}

.tab-label {
  position: absolute;
  transform: rotate(90deg);
  transform-origin: 0 0;
  color: #fff;
  font-size: var(--tab-font);
  font-weight: 700;
  line-height: var(--line);
  white-space: nowrap;
}

/*
 * The selection bar, with its glow on a pseudo-element carrying a static shadow.
 * A shadow animated on the bar itself would be repainted on every frame of its
 * 260ms move, and the bar is the one thing that moves on every item change.
 */
.bar {
  position: absolute;
  border-radius: 2px;
  background: linear-gradient(90deg, #4e9a3d, #5eae4c 60%, #6fbe5a);
  will-change: transform;
  transition: transform var(--select-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.bar::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 10px rgba(94, 174, 76, 0.55);
}

.item {
  position: absolute;
  padding-left: 14px;
  overflow: hidden;
  color: #fff;
  font-size: var(--item-font);
  line-height: var(--item-h);
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

/* The down chevron at the panel's bottom right, the Guide's answer to "there is
   more here". Always mounted, and never animated. */
.chevron {
  position: absolute;
  border-right: 2px solid rgba(255, 255, 255, 0.75);
  border-bottom: 2px solid rgba(255, 255, 255, 0.75);
  transform: translateY(-4px) rotate(45deg);
}

.prompt {
  position: absolute;
  color: #fff;
  font-size: var(--prompt-font);
  line-height: var(--prompt-h);
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.disc {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--fill);
}

.disc::before {
  content: "";
  position: absolute;
  inset: 15%;
  border: 1px solid var(--ring);
  border-radius: 50%;
}

.letter {
  position: relative;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.prompt .word {
  left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dim,
  .chrome,
  .channel,
  .bar,
  .slab {
    transition: none;
  }
}
</style>
