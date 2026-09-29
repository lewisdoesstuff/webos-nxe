<script setup lang="ts" vapor>
import { computed } from "vue";

import { shownArt, shownEcho, shownFloorFace, shownFloorPatch } from "../artCache";
import { PANE_H, PANE_W } from "../hub";
import { initialsFor, paneArt, type PaneItem } from "../panel";

/**
 * One pane of the hub's row: one item's art and its name, in a box that never
 * changes size. The row moves it by transform only, so its texture is
 * allocated once and a focus change never resizes it. The mirror below is
 * paint overflow of the same box, so it moves with the pane and adds no layer.
 * The echo and the mirror are baked images (`artCache.ts`), so a new item
 * repaints no mask.
 */
const props = defineProps<{
  /** The item this pane shows, or null while it is parked empty. */
  item: PaneItem | null;
}>();

const source = computed(() => (props.item ? paneArt(props.item) : null));
const art = computed(() => shownArt(source.value));
const echo = computed(() => shownEcho(source.value));
const floorPatch = computed(() => shownFloorPatch(source.value));
const initial = computed(() => (props.item ? initialsFor(props.item.title) : ""));
const profile = computed(() => props.item?.profile === true);

const rootStyle = { width: `${PANE_W}px`, height: `${PANE_H}px` };
</script>

<template>
  <div class="pane" :data-item="props.item?.id ?? ''" :style="rootStyle">
    <div class="clip">
      <div class="face" />
      <template v-if="profile">
        <span class="tag">{{ props.item?.title ?? "" }}</span>
        <span class="score">0<i class="coin">G</i></span>
        <span class="recent">Recent Apps</span>
      </template>
      <template v-else>
        <div class="tile">
          <img v-if="art" class="art" :src="art" alt="" />
          <span v-else class="initial">{{ initial }}</span>
        </div>
        <img v-if="echo" class="echo" :src="echo" alt="" />
        <span class="name">{{ props.item?.title ?? "" }}</span>
      </template>
    </div>
    <div class="mirror">
      <img v-if="shownFloorFace()" class="floor" :src="shownFloorFace()!" alt="" />
      <img v-if="floorPatch" class="patch" :src="floorPatch" alt="" />
    </div>
  </div>
</template>

<style scoped>
.pane {
  position: absolute;
  top: 0;
  left: 0;
}

.clip {
  position: absolute;
  top: 0;
  left: 0;
  width: 630px;
  height: 480px;
  overflow: hidden;
  border-radius: 4px;
}

.mirror {
  position: absolute;
  top: 482px;
  left: 0;
  width: 630px;
  height: 144px;
}

.floor {
  position: absolute;
  top: 0;
  left: 0;
  width: 630px;
  height: 144px;
}

.patch {
  position: absolute;
  top: 26px;
  left: 195px;
  width: 240px;
  height: 118px;
}

.face {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, #e9ea14 0, #e4e91a 3px, rgba(228, 233, 26, 0) 7px),
    radial-gradient(
      ellipse 70% 40% at 55% 0%,
      rgba(245, 248, 150, 0.4),
      rgba(245, 248, 150, 0) 100%
    ),
    url("../assets/hub/card-bokeh.svg") 0 0 / 630px 480px no-repeat,
    linear-gradient(
      180deg,
      #d2dd1c 0%,
      #c0d818 25%,
      #9fc905 53%,
      #75aa01 71%,
      #628a08 80%,
      #3e5e08 90%,
      #1e3402 97%,
      #182d01 100%
    );
}

.tile {
  position: absolute;
  top: 92px;
  left: 195px;
  width: 240px;
  height: 240px;
  overflow: hidden;
  border-radius: 34px;
  box-shadow:
    0 10px 24px rgba(20, 50, 0, 0.45),
    inset 0 0 0 2px rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.14);
}

.echo {
  position: absolute;
  top: 334px;
  left: 195px;
  width: 240px;
  height: 120px;
}

.tile::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    170deg,
    rgba(255, 255, 255, 0.5) 0%,
    rgba(255, 255, 255, 0.12) 42%,
    rgba(255, 255, 255, 0) 43%
  );
}

.art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.initial {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
  font-size: 120px;
}

.name {
  position: absolute;
  bottom: 40px;
  left: 28px;
  right: 28px;
  overflow: hidden;
  color: #fff;
  font-family: "Convection", "Inter", sans-serif;
  font-size: 34px;
  line-height: 42px;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* The gamercard on the profile pane, read off t122: the tag and score at the
   top left, a dimmer heading a third of the way down. */
.tag,
.score,
.recent {
  position: absolute;
  left: 21px;
  color: #fff;
  font-family: "Convection", "Inter", sans-serif;
  white-space: nowrap;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.35);
}

.tag {
  top: 36px;
  font-size: 42px;
  line-height: 52px;
}

.score {
  top: 90px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 36px;
  line-height: 44px;
}

.coin {
  display: inline-block;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 30%, #fff 0%, #f0f3f4 60%, #cfd6da 100%);
  color: #6f8a1a;
  font-size: 20px;
  font-style: normal;
  font-weight: 700;
  line-height: 30px;
  text-align: center;
  text-shadow: none;
}

.recent {
  top: 218px;
  font-size: 26px;
  line-height: 32px;
  opacity: 0.8;
}
</style>
