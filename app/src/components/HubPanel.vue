<script setup lang="ts" vapor>
import { computed } from "vue";

import { SHELF_SLOT_INDEX, counterFor, tileArt, tileLabel } from "../panel";
import type { Section } from "../sections";

/**
 * The hub's detail plate: the section cover for whatever is focused.
 *
 * Fixed at 386x235 and never moved, resized or promoted, so a focus change is a
 * repaint and nothing else. A layer that appears when the focus moves is a layer
 * allocated inside the ribbon move, which is the one thing `tools/gate.mjs`
 * exists to catch, and the shelf deliberately keeps all four tiles mounted for
 * the same reason: one empty state instead of three.
 *
 * The layout is DESIGN-PANEL.md section 5. Every value below is either MEASURED
 * from the retail scene graphs or CHOSEN there, and the two are marked in the
 * stylesheet's comments.
 */
const props = defineProps<{
  section: Section;
  /** The section's rows, already hidden-filtered and in the user's order. */
  rows: readonly TileSource[];
  /** Dims the plate while the Guide is up. Opacity only. */
  dimmed?: boolean;
}>();

interface TileSource {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly largeIcon?: string;
  readonly iconColor?: string;
}

const tiles = computed(
  (): { key: number; id: string; label: string; art: string | null; tint: string }[] =>
    SHELF_SLOT_INDEX.map((slot) => {
      const row = props.rows[slot];
      return {
        key: slot,
        id: row?.id ?? "",
        label: row ? tileLabel(row.title) : "",
        art: row ? tileArt(row) : null,
        tint: props.section.tint,
      };
    }),
);

const counter = computed(() => counterFor(props.rows.length));
</script>

<template>
  <div class="panel" :class="{ dimmed: props.dimmed }" :data-panel="props.section.id">
    <div class="plate">
      <div class="sheen" />

      <div class="shelf">
        <div v-for="tile in tiles" :key="tile.key" class="tile" :data-tile="tile.id">
          <img v-if="tile.art" class="art" :src="tile.art" :alt="''" />
          <div
            v-else
            class="art empty"
            :style="{ background: tile.tint }"
            :data-initials="tile.label.slice(0, 1)"
          />
          <span class="name">{{ tile.label }}</span>
        </div>
      </div>

      <div class="scrim" />
      <p class="blurb">{{ props.section.blurb }}</p>

      <div class="foot">
        <h1 class="title">{{ props.section.label }}</h1>
        <span v-if="counter" class="counter">{{ counter }}</span>
      </div>
    </div>

    <!--
      The mirror. A static box with a static gradient rather than a real one: the
      original is a full-height mirrored copy driven by a shader whose source is
      unavailable, and painting the plate twice is a layer the gate would then
      have to account for. Masked and faded, so it reads as one.
    -->
    <div class="mirror" aria-hidden="true" />
  </div>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 0;
  left: 231px;
  width: 386px;
  height: 235px;
  transition: opacity 120ms linear;
}

.panel.dimmed {
  opacity: 0.12;
}

.plate {
  position: absolute;
  inset: 0;
  border-radius: 7px;
  overflow: hidden;
  /* CHOSEN. A 1px hairline is 2 device pixels at dpr 2, so it reads as a rim. */
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 12px 23px rgba(0, 0, 0, 0.45);
  background: #232a31;
}

.sheen {
  position: absolute;
  inset: 0;
  /*
   * The hue is MEASURED: the hub's own radial runs #0F0F0F into #81878D, read out
   * of GuideMain.xui. The alphas are CHOSEN. Two stops only, because a third
   * would band on a 772x470 texture.
   */
  background: linear-gradient(
    180deg,
    rgba(129, 135, 141, 0.3) 0%,
    rgba(129, 135, 141, 0.06) 34%,
    rgba(15, 15, 15, 0.35) 100%
  );
}

.shelf {
  position: absolute;
  top: 18px;
  left: 19px;
  display: flex;
  gap: 12px;
}

.tile {
  position: relative;
  width: 78px;
  height: 107px;
  /* 78/107 = 0.729, from the measured 234x320 GameCover archetype's 0.731. */
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

/* Empty tile: the one state for a missing row, a missing icon, and a load in
   flight, so the plate never has to grow a tile. */
.art.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.35;
}

.art.empty::after {
  content: attr(data-initials);
  font-size: 24px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
}

.name {
  position: absolute;
  top: 111px;
  left: 0;
  width: 78px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* 64% of 235 is 150, so the copy block starts here. DERIVED from the
   scrim opacity one recreation measures. */
.scrim {
  position: absolute;
  top: 150px;
  left: 0;
  right: 0;
  height: 85px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.867) 64%);
}

.blurb {
  position: absolute;
  top: 157px;
  left: 19px;
  right: 19px;
  margin: 0;
  height: 20px;
  font-size: 15px;
  line-height: 20px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.foot {
  position: absolute;
  top: 191px;
  left: 19px;
  right: 19px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 24px;
  font-weight: 300;
  line-height: 30px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.counter {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
}

/*
 * The mirror sits under the plate rather than inside it, and is a static gradient
 * rather than a second copy of the plate: painting the plate twice is a layer
 * the gate would have to allow for, and the shader that made the original's
 * reflection convincing is not available to us.
 */
.mirror {
  position: absolute;
  top: 237px;
  left: 231px;
  width: 386px;
  height: 46px;
  border-radius: 0 0 7px 7px;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(129, 135, 141, 0.12) 0%, rgba(15, 15, 15, 0) 100%);
  -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0));
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0));
}
</style>
