<script setup lang="ts" vapor>
import { computed } from "vue";

import { PANE_H, PANE_W } from "../hub";
import { initialsFor, paneArt, type PaneItem } from "../panel";

/**
 * One pane of the hub's row: one item's art and its name, in a box that never
 * changes size. The row moves it by transform only, so its texture is
 * allocated once and a focus change never resizes it. The mirror below is
 * paint overflow of the same box, so it moves with the pane and adds no layer.
 */
const props = defineProps<{
  /** The item this pane shows, or null while it is parked empty. */
  item: PaneItem | null;
}>();

const art = computed(() => (props.item ? paneArt(props.item) : null));
const initial = computed(() => (props.item ? initialsFor(props.item.title) : ""));

const rootStyle = { width: `${PANE_W}px`, height: `${PANE_H}px` };
</script>

<template>
  <div class="pane" :data-item="props.item?.id ?? ''" :style="rootStyle">
    <div class="clip">
      <div class="face" />
      <div class="tile">
        <img v-if="art" class="art" :src="art" alt="" />
        <span v-else class="initial">{{ initial }}</span>
      </div>
      <div class="fade" />
      <span class="name">{{ props.item?.title ?? "" }}</span>
    </div>
    <div class="mirror">
      <div class="clip flip">
        <div class="face" />
        <div class="tile">
          <img v-if="art" class="art" :src="art" alt="" />
          <span v-else class="initial">{{ initial }}</span>
        </div>
        <div class="fade" />
      </div>
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
  border-radius: 6px;
}

.mirror {
  position: absolute;
  top: 482px;
  left: 0;
  width: 630px;
  height: 144px;
  overflow: hidden;
  opacity: 0.34;
  -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0%, transparent 100%);
}

.flip {
  transform: scaleY(-1);
}

.face {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse 90% 45% at 50% 0%,
      rgba(235, 255, 130, 0.36),
      rgba(255, 255, 200, 0) 100%
    ),
    radial-gradient(
      circle at 78% 30%,
      transparent 0 38px,
      rgba(255, 255, 255, 0.13) 39px 43px,
      transparent 44px 62px,
      rgba(255, 255, 255, 0.09) 63px 66px,
      transparent 67px
    ),
    radial-gradient(
      circle at 12% 62%,
      transparent 0 44px,
      rgba(255, 255, 255, 0.12) 45px 50px,
      transparent 51px 74px,
      rgba(255, 255, 255, 0.08) 75px 79px,
      transparent 80px
    ),
    radial-gradient(
      circle at 90% 78%,
      transparent 0 24px,
      rgba(255, 255, 255, 0.1) 25px 28px,
      transparent 29px
    ),
    linear-gradient(180deg, #c2e80e 0%, #b6de10 35%, #93c60c 70%, #7bb208 100%);
  box-shadow:
    inset 0 2px 0 rgba(214, 255, 60, 1),
    inset 1px 0 0 rgba(235, 255, 140, 0.4),
    inset -1px 0 0 rgba(235, 255, 140, 0.25),
    inset 0 -3px 0 rgba(0, 24, 0, 0.55);
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

.fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 210px;
  background: linear-gradient(
    180deg,
    rgba(10, 50, 0, 0) 0%,
    rgba(8, 40, 0, 0.55) 55%,
    rgba(2, 16, 0, 0.95) 100%
  );
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
</style>
