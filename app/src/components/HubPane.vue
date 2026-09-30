<script setup lang="ts" vapor>
import { computed } from "vue";

import {
  shownArt,
  shownEcho,
  shownFace,
  shownFloorFace,
  shownFloorOwn,
  shownFloorPatch,
} from "../artCache";
import { cardFor } from "../cards";
import { PANE_H, PANE_W } from "../hub";
import { initialsFor, paneArt, type PaneItem } from "../panel";
import { formatGamerscore } from "../settingsScreen";

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
const face = computed(() => shownFace(source.value));
const floorOwn = computed(() => shownFloorOwn(source.value));
const initial = computed(() => (props.item ? initialsFor(props.item.title) : ""));
const profile = computed(() => props.item?.profile === true);
const score = computed(() => formatGamerscore(props.item?.score ?? 0));
const recent = computed(() =>
  (props.item?.recent ?? []).map((app) => ({
    id: app.id,
    art: paneArt(app),
    initial: initialsFor(app.title),
  })),
);

const rootStyle = { width: `${PANE_W}px`, height: `${PANE_H}px` };

/** The item's card background, the same one wherever it is in the row. */
const faceStyle = computed(() => ({ "--card": `url(${cardFor(props.item?.id ?? "")})` }));
</script>

<template>
  <div class="pane" :data-item="props.item?.id ?? ''" :style="rootStyle">
    <div class="clip">
      <div class="face" :style="faceStyle" />
      <template v-if="profile">
        <span class="tag">{{ props.item?.title ?? "" }}</span>
        <span class="score">{{ score }}<i class="coin">G</i></span>
        <span class="recent">Recent Apps</span>
        <div class="recents">
          <span v-for="app in recent" :key="app.id" class="mini">
            <img v-if="app.art" :src="app.art" alt="" />
            <span v-else>{{ app.initial }}</span>
          </span>
        </div>
      </template>
      <template v-else>
        <img v-if="face" class="cface" :src="face" alt="" />
        <img v-if="face && art" class="flat" :src="art" alt="" />
        <div v-else class="tile" :class="{ bare: props.item?.bare }">
          <img v-if="art" class="art" :src="art" alt="" />
          <span v-else class="initial">{{ initial }}</span>
        </div>
        <img v-if="echo" class="echo" :src="echo" alt="" />
        <span class="name" :class="{ two: props.item?.detail }">{{ props.item?.title ?? "" }}</span>
        <span v-if="props.item?.detail" class="detail">{{ props.item.detail }}</span>
      </template>
    </div>
    <div class="mirror">
      <img v-if="floorOwn" class="floor" :src="floorOwn" alt="" />
      <img v-else-if="shownFloorFace()" class="floor" :src="shownFloorFace()!" alt="" />
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

/*
 * The face: one of the dashboard's eight card backgrounds, which carry the
 * light from above, the chamfered top edge and the bokeh, under the dark foot
 * sampled off the 1080p capture (`LeLocNfgexM`, 5:50), where the retail cards
 * match these backgrounds to within 9 levels above the foot.
 */
.face {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      180deg,
      rgba(15, 29, 0, 0) 0%,
      rgba(15, 29, 0, 0.05) 45%,
      rgba(15, 29, 0, 0.08) 58%,
      rgba(15, 29, 0, 0.25) 71%,
      rgba(15, 29, 0, 0.55) 83%,
      rgba(15, 29, 0, 0.75) 92%,
      rgba(15, 29, 0, 0.9) 98%
    ),
    var(--card) 0 0 / 630px 480px no-repeat;
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

.tile.bare {
  overflow: visible;
  border-radius: 0;
  box-shadow: none;
  background: none;
}

.tile.bare::after {
  display: none;
}

.echo {
  position: absolute;
  top: 334px;
  left: 195px;
  width: 240px;
  height: 120px;
}

.cface {
  position: absolute;
  inset: 0;
  width: 630px;
  height: 480px;
}

.flat {
  position: absolute;
  top: 36px;
  left: 165px;
  width: 300px;
  height: 300px;
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

.name.two {
  bottom: 70px;
}

.detail {
  position: absolute;
  bottom: 34px;
  left: 28px;
  right: 28px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.85);
  font-family: "Convection", "Inter", sans-serif;
  font-size: 26px;
  line-height: 32px;
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
.recents {
  position: absolute;
  top: 262px;
  left: 21px;
  display: flex;
  gap: 14px;
}

.mini {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.14);
  box-shadow:
    0 4px 10px rgba(20, 50, 0, 0.35),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.92);
  font-size: 40px;
}

.mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
