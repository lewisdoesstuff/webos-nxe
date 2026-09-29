<script setup lang="ts" vapor>
import { computed } from "vue";

import { PANE_H, PANE_W } from "../hub";
import {
  BLURB_BOX,
  COUNTER_BOX,
  counterFor,
  initialsFor,
  NAMES_BOX,
  SCRIM_BOX,
  SHELF_BOX,
  SHELF_SLOT_INDEX,
  tileArt,
  TILE_GAP,
  TILE_H,
  tileLabel,
  TILE_W,
  TILE_X,
  TITLE_BOX,
  type TileRow,
} from "../panel";
import type { Section } from "../sections";

/**
 * One pane of the hub's pane row: the section's shelf and the 2008 panel's
 * copy block, in a box that never changes size.
 *
 * The box is the tab scene's own 473x300 whatever the selection does. The
 * focused pane is that same box scaled up onto `Blade_Center`, so a selection
 * move is a transform on a texture that already exists and never a resize of
 * one. Every slot is fixed at four tiles and one of every copy line, for the
 * same reason: a tile appearing mid-move is a layer allocated mid-move, which
 * is what `tools/gate.mjs` fails on.
 *
 * The composition is DESIGN-PANEL.md section 5, scaled to the pane by one
 * factor in `panel.ts`. Nothing here measures anything.
 */
const props = defineProps<{
  section: Section;
  /** The section's rows, already hidden-filtered and in the user's order. */
  rows: readonly TileRow[];
}>();

const tiles = computed(
  (): { key: number; id: string; label: string; art: string | null; initials: string }[] =>
    SHELF_SLOT_INDEX.map((slot) => {
      const row = props.rows[slot];
      return {
        key: slot,
        id: row?.id ?? "",
        label: row ? tileLabel(row.title) : "",
        art: row ? tileArt(row) : null,
        initials: row ? initialsFor(row.title) : "",
      };
    }),
);

const names = computed((): string[] =>
  SHELF_SLOT_INDEX.map((slot) => tiles.value[slot]?.label ?? ""),
);

const counter = computed(() => counterFor(props.rows.length));

const rootStyle = {
  width: `${PANE_W}px`,
  height: `${PANE_H}px`,
};

function zone(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Record<string, string> {
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

function tileStyle(slot: number): Record<string, string> {
  return {
    left: `${TILE_X[slot] ?? SHELF_BOX.x}px`,
    top: `${SHELF_BOX.y}px`,
    width: `${TILE_W}px`,
    height: `${TILE_H}px`,
  };
}

function nameStyle(slot: number): Record<string, string> {
  return {
    left: `${TILE_X[slot] ?? SHELF_BOX.x}px`,
    top: `${NAMES_BOX.y}px`,
    width: `${TILE_W + TILE_GAP}px`,
    height: `${NAMES_BOX.height}px`,
  };
}
</script>

<template>
  <div class="pane" :data-pane="props.section.id" :style="rootStyle">
    <div class="plate" :data-tint="props.section.id">
      <div class="sheen" />

      <div class="shelf" :style="zone(SHELF_BOX)">
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="tile"
          :data-tile="tile.id"
          :style="tileStyle(tile.key)"
        >
          <img v-if="tile.art" class="art" :src="tile.art" :alt="''" />
          <div v-else class="art empty" :data-initials="tile.initials" />
        </div>
      </div>

      <div class="names">
        <span
          v-for="(name, slot) in names"
          :key="slot"
          class="name"
          :data-slot="slot"
          :style="nameStyle(slot)"
          >{{ name }}</span
        >
      </div>

      <div class="scrim" :style="zone(SCRIM_BOX)" />
      <p class="blurb" :style="zone(BLURB_BOX)">{{ props.section.blurb }}</p>
      <h1 class="title" :style="zone(TITLE_BOX)">{{ props.section.label }}</h1>
      <span v-if="counter" class="counter" :style="zone(COUNTER_BOX)">{{ counter }}</span>
    </div>
  </div>
</template>

<style scoped>
.pane {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 7px;
  overflow: hidden;
  background: #232a31;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 12px 23px rgba(0, 0, 0, 0.45);
}

.plate {
  position: absolute;
  inset: 0;
  background: #232a31;
}

/*
 * The hue is MEASURED: the hub's own radial runs #0F0F0F into #81878D, read out
 * of GuideMain.xui. The alphas are CHOSEN.
 */
.sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(129, 135, 141, 0.3) 0%,
    rgba(129, 135, 141, 0.06) 34%,
    rgba(15, 15, 15, 0.35) 100%
  );
}

.shelf,
.names {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.tile {
  position: absolute;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.22);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 5px;
}

/* Empty tile: the one state for a missing row, a missing icon and a load in
   flight, so a pane never has to grow a tile. */
.art.empty {
  background: rgba(255, 255, 255, 0.08);
}

.art.empty::after {
  content: attr(data-initials);
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.35);
}

.name {
  position: absolute;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.scrim {
  position: absolute;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.867) 64%);
}

.blurb {
  position: absolute;
  margin: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  position: absolute;
  margin: 0;
  overflow: hidden;
  color: #fff;
  font-size: 24px;
  font-weight: 300;
  line-height: 30px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.counter {
  position: absolute;
  display: block;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  line-height: 14px;
  text-align: right;
  white-space: nowrap;
}

/*
 * A pane in the spill keeps its shelf and drops its copy block, so the
 * recession reads as cards rather than as text cut through by the pane in
 * front. Opacity only, so a focus change is a repaint and not a resize.
 */
.pane[data-slot="spill"] .scrim,
.pane[data-slot="spill"] .blurb,
.pane[data-slot="spill"] .title,
.pane[data-slot="spill"] .counter,
.pane[data-slot="spill"] .names {
  opacity: 0;
}
</style>
