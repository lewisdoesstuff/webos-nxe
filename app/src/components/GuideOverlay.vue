<script setup lang="ts" vapor>
import { computed, onUnmounted, ref, watch } from "vue";

import {
  BLADE_IDS,
  BLADE_MS,
  CHROME,
  CHEVRON_BOX,
  CLOCK_FONT,
  CLOCK_H,
  CLOCK_W,
  CLOCK_X,
  CLOCK_Y,
  DIM_ALPHA,
  DIM_IN_MS,
  DIM_OUT_MS,
  PANEL_IN_MS,
  PANEL_OUT_MS,
  SLABS_OUT_MS,
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
  LIST_OUT_MS,
  PANEL_H,
  PANEL_W,
  PANEL_X,
  PANEL_Y,
  PICPIC_H,
  PICPIC_W,
  PICPIC_X,
  PICPIC_Y,
  placeBlades,
  placeItems,
  PROMPT_FONT,
  PROMPT_H,
  promptDisc,
  promptLabel,
  ROTATED_LINE,
  SELECT_MS,
  SLAB_H,
  SLAB_LABEL_FONT,
  SLAB_W,
  SPINNER_D,
  TAB_LABEL_FONT,
  TAB_W,
  slabLabelBox,
  slabOrigin,
  spinnerBox,
  tabLabelBox,
  within,
  type Box,
  type ItemRow,
  type Slab,
} from "../guide";
import { faceFor, type Prompt } from "../prompts";
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
    /** Row of the item list the green bar is on. */
    item?: number;
    /** The focused blade's items, if the parent has them. */
    items?: readonly string[];
    /** The Guide's clock, already formatted by the caller. */
    clock?: string;
    showClock?: boolean;
    clock24h?: boolean;
    /** The gamer picture, when there is one to replace the default. */
    pic?: string;
    /** Draw the Magic Remote's keys instead of the face buttons. */
    remote?: boolean;
  }>(),
  { open: false, blade: 4, item: 0, clock: "", showClock: true, clock24h: true, remote: false },
);

const bladeIds = BLADE_IDS;

function title(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** The time as the Guide shows it, read when it opens. */
const stamp = ref("");
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const d = new Date();
    const hours = props.clock24h
      ? String(d.getHours()).padStart(2, "0")
      : `${d.getHours() % 12 || 12}`;
    stamp.value = `${hours}:${String(d.getMinutes()).padStart(2, "0")}`;
  },
  { immediate: true },
);

/** The Guide's own prompt row, the one array `prompts.ts` built. */
const prompts = guidePrompts();

/**
 * The selection, clamped into its own list. Clamping here rather than trusting
 * the caller keeps a bad index off the geometry, and it cannot change the
 * element count: an index past the end is moved to the end, not dropped.
 */
const blade = computed(() => Math.min(Math.max(props.blade, 0), bladeIds.length - 1));
const item = computed(() => Math.min(Math.max(props.item, 0), ITEM_ROWS - 1));

/**
 * Every blade's slab, the focused one parked under the panel just inside the
 * edge it came in by, so it slides straight under and back out.
 *
 * Leaving by the other edge it would cross the whole panel and come out late,
 * so it is first moved under the panel to that edge with no transition, which
 * cannot be seen, and slides out from there a frame later.
 */
type Edge = "left" | "right";
const slabs = ref(placeBlades(blade.value, bladeIds));
const park = ref(new Map<number, Edge>());
const jumping = ref<number | null>(null);
let jumpFrame = 0;

watch(blade, (next, before) => {
  cancelAnimationFrame(jumpFrame);
  jumping.value = null;
  const target = placeBlades(next, bladeIds);
  const leaving = target[before];
  const parked = park.value.get(before) ?? "left";
  const edges = new Map(park.value);
  edges.set(next, next < before ? "left" : "right");
  if (leaving && leaving.side !== "under" && leaving.side !== parked) {
    edges.set(before, leaving.side);
    park.value = edges;
    jumping.value = before;
    jumpFrame = requestAnimationFrame(() => {
      jumpFrame = requestAnimationFrame(() => {
        jumping.value = null;
        slabs.value = target;
      });
    });
    return;
  }
  park.value = edges;
  slabs.value = target;
});

/**
 * What the panel shows. A blade change fades the list out while the stacks
 * slide, swaps it while it cannot be seen, and fades the new one in, so the
 * list and the tab label lag the blade by `LIST_OUT_MS`. Opening the Guide
 * takes the blade as it is.
 */
const shownBlade = ref(blade.value);
const shownItems = ref<readonly string[] | undefined>(props.items);
const fading = ref(false);
let swap: ReturnType<typeof setTimeout> | undefined;

watch(blade, (next) => {
  clearTimeout(swap);
  if (!props.open) {
    shownBlade.value = next;
    shownItems.value = props.items;
    return;
  }
  fading.value = true;
  swap = setTimeout(() => {
    shownBlade.value = blade.value;
    shownItems.value = props.items;
    fading.value = false;
  }, LIST_OUT_MS);
});

watch(
  () => props.items,
  (items) => {
    if (!fading.value) shownItems.value = items;
  },
);

/**
 * The open and the close as states. `opening` grows the empty panel; `open`
 * shows the content and slides the blades out; `closing` hides the content at
 * once, shrinks the panel and lifts the dim; `closed` rests hidden. A closed
 * Guide never plays the close, so nothing flashes at mount.
 */
type State = "closed" | "opening" | "open" | "closing";
const state = ref<State>(props.open ? "open" : "closed");
/** The blades are sliding out from behind the panel, on the reveal's timing. */
const revealing = ref(false);
let stage: ReturnType<typeof setTimeout> | undefined;
let reveal: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.open,
  (open) => {
    clearTimeout(stage);
    clearTimeout(reveal);
    revealing.value = false;
    if (open) {
      state.value = "opening";
      stage = setTimeout(() => {
        state.value = "open";
        revealing.value = true;
        reveal = setTimeout(() => (revealing.value = false), SLABS_OUT_MS);
      }, PANEL_IN_MS);
      return;
    }
    if (state.value === "closed") return;
    state.value = "closing";
    stage = setTimeout(() => (state.value = "closed"), Math.max(PANEL_OUT_MS, DIM_OUT_MS));
  },
);

const shown = computed(() => state.value === "open");

onUnmounted(() => {
  clearTimeout(swap);
  clearTimeout(stage);
  clearTimeout(reveal);
  cancelAnimationFrame(jumpFrame);
});

const rows = computed(() =>
  placeItems(shownItems.value ?? ITEMS[bladeIds[shownBlade.value] ?? ""] ?? [], item.value),
);

/** Every constant the stylesheet needs, so the two cannot drift apart. */
const rootStyle: Record<string, string> = {
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`,
  "--chrome-x": `${CHROME.x}px`,
  "--chrome-y": `${CHROME.y}px`,
  "--chrome-w": `${CHROME.width}px`,
  "--chrome-h": `${CHROME.height}px`,
  "--dim-in-ms": `${DIM_IN_MS}ms`,
  "--dim-out-ms": `${DIM_OUT_MS}ms`,
  "--panel-in-ms": `${PANEL_IN_MS}ms`,
  "--panel-out-ms": `${PANEL_OUT_MS}ms`,
  "--select-ms": `${SELECT_MS}ms`,
  "--blade-ms": `${BLADE_MS}ms`,
  "--list-out-ms": `${LIST_OUT_MS}ms`,
  "--list-in-ms": `${BLADE_MS - LIST_OUT_MS}ms`,
  "--dim": `${DIM_ALPHA}`,
  "--panel-w": `${PANEL_W}px`,
  "--panel-h": `${PANEL_H}px`,
  "--tab-w": `${TAB_W}px`,
  "--tab-font": `${TAB_LABEL_FONT}px`,
  "--spinner-d": `${SPINNER_D}px`,
  "--clock-w": `${CLOCK_W}px`,
  "--clock-h": `${CLOCK_H}px`,
  "--clock-font": `${CLOCK_FONT}px`,
  "--item-bar-w": `${ITEM_BAR_W}px`,
  "--item-h": `${ITEM_H}px`,
  "--item-font": `${ITEM_FONT}px`,
  "--slab-w": `${SLAB_W}px`,
  "--slab-h": `${SLAB_H}px`,
  "--slab-font": `${SLAB_LABEL_FONT}px`,
  "--line": `${ROTATED_LINE}px`,
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

/** An item row, at its own slot, lit only while the bar is on it. */
function itemStyle(row: ItemRow): Record<string, string> {
  return {
    ...at({ x: ITEM_X, y: row.y, width: ITEM_BAR_W, height: ITEM_H }),
    opacity: row.selected ? "1" : "0.92",
  };
}

/**
 * A slab, written at the tab's place under the panel and moved to its slot by a
 * transform, so a blade change is five transform writes on boxes that already
 * exist. It scales about the edge that faces the panel and about its own
 * mid-height; the origin stays at the left edge, so the move and the scale
 * interpolate as one.
 */
function slabStyle(slab: Slab): Record<string, string> {
  const edge =
    shown.value || slab.side === "under" ? (park.value.get(slab.d) ?? "left") : slab.side;
  const under = slab.side === "under" || !shown.value;
  const shift = under
    ? edge === "right"
      ? PANEL_X + PANEL_W - SLAB_W
      : PANEL_X
    : slab.side === "right"
      ? slab.x
      : slab.x + SLAB_W * (1 - slab.scale);
  const scale = under ? 1 : slab.scale;
  return {
    ...at(slabOrigin({ ...slab, x: PANEL_X })),
    transform: `translate3d(${shift - PANEL_X}px, 0, 0) scale(${scale})`,
    transition: jumping.value === slab.d ? "none" : "",
    transitionDuration: revealing.value ? `${SLABS_OUT_MS}ms` : "",
    zIndex: String(under ? 0 : 10 - slab.slot),
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
  const face = faceFor(prompt, props.remote);
  return {
    "--fill": face.fill,
    "--ring": face.ring,
    "--letter": face.glyph,
    "--art": `var(--theme-btn-${prompt.button}, none)`,
  };
}

const PANEL: Box = { x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H };
const TAB: Box = { x: PANEL_X, y: PANEL_Y, width: TAB_W, height: PANEL_H };
const PIC: Box = { x: PICPIC_X, y: PICPIC_Y, width: PICPIC_W, height: PICPIC_H };
const CLOCK: Box = { x: CLOCK_X, y: CLOCK_Y, width: CLOCK_W, height: CLOCK_H };
</script>

<template>
  <div class="guide" :data-state="state" :style="rootStyle">
    <div class="dim" />

    <div class="frame">
      <div class="slabs" :data-shown="shown || undefined">
        <div
          v-for="slab in slabs"
          :key="slab.d"
          class="slab"
          :data-blade="slab.id"
          :data-side="slab.side"
          :style="slabStyle(slab)"
        >
          <span class="slab-label" :style="slabLabelStyle(slab)">{{ title(slab.id) }}</span>
        </div>
      </div>

      <div class="panel" :style="at(PANEL)" />

      <div class="chrome" :data-shown="shown || undefined">
        <div
          class="gamerpic"
          :style="pic ? { ...at(PIC), backgroundImage: `url(${pic})` } : at(PIC)"
        />

        <div class="clock" :style="at(CLOCK)">{{ showClock ? clock || stamp : "" }}</div>

        <div class="tab" :style="at(TAB)" />
        <span class="spinner" :style="at(spinnerBox())" />

        <div class="sheet" :data-fading="fading || undefined">
          <span class="tab-label" :style="at(tabLabelBox())">{{
            title(bladeIds[shownBlade] ?? "")
          }}</span>
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
        </div>

        <div
          v-for="(prompt, i) in prompts"
          :key="prompt.button"
          class="prompt"
          :data-button="prompt.button"
          :data-index="i"
        >
          <span class="disc" :style="[at(promptDisc(i)), discStyle(prompt)]">
            <span class="letter" :data-remote="remote || undefined">{{
              faceFor(prompt, remote).letter
            }}</span>
          </span>
          <span class="word" :style="at(promptLabel(i))">{{ prompt.label }}</span>
        </div>
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
  /* Not 0: a layer at 0 drops its texture and is rebuilt mid-open (PERF-STATUS). */
  opacity: 0.001;
  will-change: opacity;
}

/* Most of the way in the first frame, then the rest; lifting a quarter of the way before it drops. */
.guide[data-state="opening"] .dim,
.guide[data-state="open"] .dim {
  opacity: 1;
  animation: dim-in var(--dim-in-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.guide[data-state="closing"] .dim {
  opacity: 0.75;
  animation: dim-out var(--dim-out-ms) linear;
}

@keyframes dim-in {
  from {
    opacity: 0.8;
  }
  to {
    opacity: 1;
  }
}

@keyframes dim-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.75;
  }
}

/* The chrome's box, which places the stacks, the panel and the chrome and draws nothing. */
.frame {
  position: absolute;
  top: var(--chrome-y);
  left: var(--chrome-x);
  width: var(--chrome-w);
  height: var(--chrome-h);
}

/*
 * Everything on the panel but the panel: promoted so it appears and goes in a
 * frame, an opacity on a layer that is already there.
 */
.chrome {
  position: absolute;
  inset: 0;
  opacity: 0.001;
  will-change: opacity;
}

.chrome[data-shown] {
  opacity: 1;
}

/* The profile plate, centred above the panel at the gamerpic's own box. */
.gamerpic {
  position: absolute;
  background: #222 url("../assets/hub/gamerpic.svg") center / 100% 100% no-repeat;
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

/* The other blades, stacked either side of the panel. A stacking context of
   its own, so no slab's z-index lifts it over the panel it slides under. */
.slabs {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.001;
  will-change: opacity;
}

.slabs[data-shown] {
  opacity: 1;
}

/*
 * A slab, sampled off the 1080p capture: pale blue-grey, lightest toward its
 * outer edge and shading down toward the panel, with a dark seam where it
 * meets the slab behind it. Its outer edge bows in, narrowest halfway down.
 */
.slab {
  position: absolute;
  transform-origin: 0 50%;
  border-radius: 10px 3px 0 0;
  clip-path: polygon(
    0 0,
    100% 0,
    100% 100%,
    0 100%,
    1% 92%,
    3.5% 80%,
    6% 66%,
    8% 50%,
    6% 34%,
    3.5% 20%,
    1% 8%
  );
  background:
    linear-gradient(
      180deg,
      rgba(210, 222, 234, 0.35) 0%,
      rgba(210, 222, 234, 0) 30%,
      rgba(0, 0, 0, 0) 75%,
      rgba(200, 216, 228, 0.3) 100%
    ),
    linear-gradient(
      90deg,
      #80868e 0%,
      #c3cbd3 5%,
      #c6cdd5 35%,
      #b4bcc3 52%,
      #a6aeb5 66%,
      #8d949b 76%,
      #6f777f 100%
    );
  box-shadow: -3px 0 8px rgba(0, 0, 0, 0.5);
  will-change: transform;
  transition: transform var(--blade-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.slab[data-side="right"] {
  border-radius: 3px 10px 0 0;
  clip-path: polygon(
    0 0,
    100% 0,
    99% 8%,
    96.5% 20%,
    94% 34%,
    92% 50%,
    94% 66%,
    96.5% 80%,
    99% 92%,
    100% 100%,
    0 100%
  );
  background:
    linear-gradient(
      180deg,
      rgba(210, 222, 234, 0.35) 0%,
      rgba(210, 222, 234, 0) 30%,
      rgba(0, 0, 0, 0) 75%,
      rgba(200, 216, 228, 0.3) 100%
    ),
    linear-gradient(
      270deg,
      #80868e 0%,
      #c3cbd3 5%,
      #c6cdd5 35%,
      #b4bcc3 52%,
      #a6aeb5 66%,
      #8d949b 76%,
      #6f777f 100%
    );
  box-shadow: 3px 0 8px rgba(0, 0, 0, 0.5);
}

.slab-label {
  position: absolute;
  text-align: center;
  transform: rotate(90deg);
  transform-origin: 0 0;
  color: #383a42;
  font-size: var(--slab-font);
  font-weight: 400;
  letter-spacing: 0.6px;
  line-height: var(--line);
  white-space: nowrap;
}

/*
 * The panel, the tab strip and the arc are backgrounds and nothing else. They are
 * siblings of the rows rather than their parent so that every box in the chrome
 * is placed in one coordinate space.
 */
/* Promoted at rest: it paints over the animating slabs, so the compositor
   would otherwise split it into a layer of its own mid-open. */
/*
 * The panel grows out of its own centre with an overshoot, empty, before
 * anything is on it, and shrinks away the same way. Promoted, so both are a
 * transform and an opacity on a layer that already exists.
 */
.panel {
  position: absolute;
  opacity: 0.001;
  will-change: transform, opacity;
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0, rgba(255, 255, 255, 0) 12%),
    linear-gradient(180deg, #26384e 0%, #1b2a3b 100%);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.3),
    0 10px 28px rgba(0, 0, 0, 0.55);
}

.guide[data-state="opening"] .panel,
.guide[data-state="open"] .panel {
  opacity: 1;
  animation: panel-in var(--panel-in-ms) linear;
}

.guide[data-state="closing"] .panel {
  animation: panel-out var(--panel-out-ms) linear both;
}

@keyframes panel-in {
  0% {
    opacity: 0.001;
    transform: scale(0.72);
    animation-timing-function: cubic-bezier(0.33, 0.6, 0.6, 1);
  }
  40% {
    opacity: 1;
    transform: scale(0.95);
  }
  72% {
    transform: scale(1.05);
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes panel-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  30% {
    opacity: 1;
    transform: scale(1.04);
    animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
  }
  100% {
    opacity: 0.001;
    transform: scale(0.75);
  }
}

.tab {
  position: absolute;
  border-radius: 6px 0 0 6px;
  background: linear-gradient(180deg, #17222f, #121b26);
}

/*
 * The ring above the tab label, the controller indicator: four quadrants, the
 * upper left lit for player one. It is not animated.
 */
.spinner {
  position: absolute;
  border-radius: 50%;
  background: repeating-conic-gradient(
    from 5deg,
    rgba(214, 222, 228, 0.75) 0deg 80deg,
    rgba(0, 0, 0, 0) 80deg 90deg
  );
  -webkit-mask: radial-gradient(circle, transparent 54%, #000 56%);
  mask: radial-gradient(circle, transparent 54%, #000 56%);
}

.spinner::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from -85deg, #a4e21a 0deg 80deg, rgba(0, 0, 0, 0) 80deg 360deg);
}

/*
 * The list, the bar and the tab's label, which a blade change fades out and
 * back in while the stacks slide. Promoted at rest so the fade is an opacity
 * on a layer that exists before the key press.
 */
.sheet {
  position: absolute;
  inset: 0;
  will-change: opacity;
  transition: opacity var(--list-in-ms) linear;
}

.sheet[data-fading] {
  opacity: 0.001;
  transition-duration: var(--list-out-ms);
}

/* The bar goes first, before the text has begun to fade. */
.sheet[data-fading] .bar {
  opacity: 0.001;
}

.tab-label {
  position: absolute;
  transform: rotate(90deg);
  transform-origin: 0 0;
  text-align: center;
  color: #fff;
  font-size: var(--tab-font);
  font-weight: 400;
  letter-spacing: 0.6px;
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
  border-radius: 3px;
  background: linear-gradient(180deg, #86c826 0%, #6db01a 48%, #4f9210 52%, #5ba316 100%);
  will-change: transform;
  transition: transform var(--select-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.bar::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 10px rgba(110, 176, 26, 0.5);
}

.item {
  position: absolute;
  padding-left: 8px;
  overflow: hidden;
  color: #fff;
  font-size: var(--item-font);
  letter-spacing: 1px;
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
  background:
    radial-gradient(
      ellipse 70% 40% at 50% 24%,
      rgba(255, 255, 255, 0.3),
      rgba(255, 255, 255, 0) 100%
    ),
    radial-gradient(circle at 50% 42%, var(--fill) 0%, var(--fill) 38%, var(--ring) 100%);
  box-shadow: inset 0 0 0 2px var(--ring, rgba(0, 0, 0, 0.25));
  color: var(--letter, #fff);
}

:global(:root[data-button-art]) .disc {
  background: none;
  box-shadow: none;
}

:global(:root[data-button-art]) .disc::before {
  content: "";
  position: absolute;
  inset: -3px;
  background: var(--art) center / 100% 100% no-repeat;
}

.letter[data-remote] {
  font-size: 9px;
  letter-spacing: 0;
  top: -0.75px;
  text-shadow: none;
}

.letter {
  position: relative;
  z-index: 1;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}

.prompt .word {
  position: absolute;
  left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dim,
  .panel,
  .bar,
  .slab,
  .sheet {
    transition: none;
    animation: none;
  }
}
</style>
