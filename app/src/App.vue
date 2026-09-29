<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref } from "vue";

import GuideOverlay from "./components/GuideOverlay.vue";
import HubPanel from "./components/HubPanel.vue";
import PromptBar from "./components/PromptBar.vue";
import { stepFocus } from "./focus/row";
import {
  COLUMN_H,
  COLUMN_W,
  COLUMN_X,
  COLUMN_Y,
  MOVE_EASE,
  MOVE_MS,
  placeLabels,
  placePanes,
  PROMPT_Y_FRAME,
  RAIL_ALPHA,
  railFigures,
  type Slot,
} from "./hub";
import { SELECT, promptsFor } from "./prompts";
import { CANVAS_H, CANVAS_W } from "./ribbon";
import { SECTIONS, SECTION_IDS, sectionRows } from "./sections";
import { useAppsStore } from "./stores/apps";
import { useSettingsStore } from "./stores/settings";

/**
 * The hub: a channel column of five fixed channels on the left and a row of
 * five panes to its right, with the prompt row at the measured height.
 *
 * Authored at 1920x1080 and rendered 1:1 (docs/PERF.md). Every number is a
 * 720p measurement out of `GuideMain.xui` and lives in `hub.ts`, which
 * converts it once; nothing here measures anything.
 *
 * The sheet in docs/PERF.md is what shapes the markup. A transition must not
 * allocate, so the pane row is five panes whatever the sections are, the
 * column is five labels whatever the selection is, and the shelf inside every
 * pane is four tiles whatever the rows are. A `v-for` whose length follows the
 * data is the bug this project exists to avoid. The movers are promoted with
 * `will-change: transform`, so a move is transform writes on textures that are
 * already there, and only `transform` and `opacity` ever animate.
 */

const apps = useAppsStore();
const settings = useSettingsStore();

const focus = ref(0);
/** The Guide is a full-screen takeover, not a side panel. VERIFIED, 9199. */
const guide = ref(false);

const panes = computed(() => placePanes(focus.value, SECTION_IDS));
const labels = computed(() => placeLabels(focus.value, SECTION_IDS));

const rowsBySection = computed((): Record<string, ReturnType<typeof sectionRows>> => {
  const rows: Record<string, ReturnType<typeof sectionRows>> = {};
  for (const section of SECTIONS) {
    rows[section.id] = sectionRows(section.id, apps.launchPoints, settings.settings);
  }
  return rows;
});

function sectionFor(id: string) {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
}

function rowsFor(id: string) {
  return rowsBySection.value[id] ?? [];
}

/**
 * A slot as a style: a translate and a scale about the slot's own pivot. The
 * box behind the transform never changes, so the compositor's allocation does
 * not either.
 */
function slotStyle(slot: Slot): Record<string, string> {
  return {
    width: `${slot.width}px`,
    height: `${slot.height}px`,
    transform: `translate3d(${slot.x}px, ${slot.y}px, 0) scale(${slot.scaleX}, ${slot.scaleY})`,
    "transform-origin": `${slot.pivotX * 100}% 50%`,
    transition: `transform ${MOVE_MS}ms ${MOVE_EASE}`,
  };
}

const columnStyle = {
  left: `${COLUMN_X}px`,
  top: `${COLUMN_Y}px`,
  width: `${COLUMN_W}px`,
  height: `${COLUMN_H}px`,
};

function figureStyle(figure: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Record<string, string> {
  return {
    left: `${figure.x}px`,
    top: `${figure.y}px`,
    width: `${figure.width}px`,
    height: `${figure.height}px`,
    opacity: `${RAIL_ALPHA}`,
  };
}

/** The move's own timing, so the stylesheet and the geometry cannot drift apart. */
const motion = {
  "--move-ms": `${MOVE_MS}ms`,
  "--move-ease": MOVE_EASE,
};

/** The 720p frame's own size, which the frame furniture is authored in. */
const frameStyle = {
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`,
};

function onKeyDown(event: KeyboardEvent): void {
  if (guide.value) {
    if (event.keyCode === 89 || event.keyCode === 461 || event.keyCode === 27) {
      event.preventDefault();
      guide.value = false;
    }
    return;
  }
  if (event.keyCode === 39) {
    event.preventDefault();
    focus.value = stepFocus(focus.value, 1, SECTIONS.length);
    return;
  }
  if (event.keyCode === 37) {
    event.preventDefault();
    focus.value = stepFocus(focus.value, -1, SECTIONS.length);
    return;
  }
  // The Guide, on the key a desktop keyboard has for it.
  if (event.keyCode === 71) {
    event.preventDefault();
    guide.value = true;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  void apps.load();
  expose();
});

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

function expose(): void {
  (window as typeof window & { xneDebug?: unknown }).xneDebug = { focus, panes, labels, guide };
}
</script>

<template>
  <main class="stage" :style="motion">
    <div class="glow" />

    <header class="who">
      <div class="avatar" />
      <div class="id">
        <span class="tag">{{ settings.settings.gamertag || "Player" }}</span>
        <span class="score">G 1250</span>
      </div>
    </header>

    <div class="column" data-column :style="columnStyle">
      <div class="rail" data-rail>
        <span
          v-for="(figure, index) in railFigures()"
          :key="index"
          class="figure"
          :data-figure="index"
          :style="figureStyle(figure)"
        />
      </div>
    </div>

    <span
      v-for="label in labels"
      :key="label.id"
      class="label"
      :data-channel="label.id"
      :data-row="label.row"
      :data-selected="label.selected || undefined"
      :style="slotStyle(label.slot)"
      >{{ sectionFor(label.id).label }}</span
    >

    <div class="row" data-panes>
      <HubPanel
        v-for="(pane, index) in panes"
        :key="pane.id"
        :section="sectionFor(pane.id)"
        :rows="rowsFor(pane.id)"
        :data-offset="index"
        :data-slot="pane.focused ? 'focused' : 'spill'"
        :style="slotStyle(pane.slot)"
      />
    </div>

    <div class="frame" data-frame :style="frameStyle">
      <PromptBar :prompts="promptsFor({ a: SELECT.label })" :y="PROMPT_Y_FRAME" />

      <GuideOverlay
        :open="guide"
        :blade="focus"
        :items="rowsFor(SECTION_IDS[focus] ?? '').map((row) => row.title)"
      />
    </div>
  </main>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0b0f14;
}

/* MEASURED, GuideMain.xui: #0F0F0F at alpha 100 into #81878D at alpha 0. */
.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 38% 45%,
    rgba(15, 15, 15, 0.39) 0%,
    rgba(129, 135, 141, 0) 72%
  );
}

/* UNVERIFIED, project chrome: the gamercard the old hub carried at the top left. */
.who {
  position: absolute;
  top: 60px;
  left: 168px;
  display: flex;
  gap: 21px;
  align-items: center;
}

.avatar {
  width: 96px;
  height: 96px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 5px;
  background: linear-gradient(160deg, #4a4f57, #22262b);
}

.id {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tag {
  font-size: 30px;
  font-weight: 700;
}

.score {
  font-size: 20px;
  color: #9aa4ad;
}

.column {
  position: absolute;
}

/* The rail is SelBlade's own figures. It rests at the measured 0.4 and never
   moves: the scene data only fades it, and this build holds it still so a move
   stays a transform write. */
.rail {
  position: absolute;
  inset: 0;
}

.figure {
  position: absolute;
  background: rgba(255, 255, 255, 0.5);
}

/*
 * A label is a promoted box that scales about its own centre, which is the
 * pivot every label carries in the scene data, so a label that becomes
 * selected stops scaling and its text ends up furthest left.
 */
.label {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.85);
  font-size: 24px;
  line-height: 32px;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  will-change: transform;
  transition: transform var(--move-ms) var(--move-ease);
}

.label[data-selected] {
  color: #fff;
}

/*
 * The panes move, so they are promoted: a transform on an unpromoted box
 * repaints it every frame. The layer exists at rest and only its transform
 * changes, which is what keeps a move from allocating.
 */
.row {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.row :deep(.pane) {
  will-change: transform;
}

/*
 * The prompt row and the Guide are authored in the 720p frame's own pixels
 * (`PromptBar`, `guide.ts`), so they sit in that frame and one transform on the
 * frame puts them at 1080p about the stage's origin. A transform is not a
 * composited layer on its own, so this costs no texture.
 */
.frame {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  transform: scale(1.5);
  transform-origin: 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .label,
  .row :deep(.pane) {
    transition: none;
  }
}
</style>
