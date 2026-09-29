<script setup lang="ts" vapor>
import { computed } from "vue";

import { PANE_H, PANE_W } from "../hub";
import { initialsFor, paneArt, type PaneItem } from "../panel";

/**
 * One pane of the hub's row: one item's art and its name, in a box that never
 * changes size. The row moves it by transform only, so its texture is
 * allocated once and a focus change never resizes it.
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
    <div class="face" />
    <img v-if="art" class="art" :src="art" alt="" />
    <span v-else class="art initial">{{ initial }}</span>
    <div class="fade" />
    <span class="name">{{ props.item?.title ?? "" }}</span>
  </div>
</template>

<style scoped>
.pane {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  border-radius: 4px;
}

.face {
  position: absolute;
  inset: 0;
  background: linear-gradient(170deg, #d4f03a 0%, #9fd31c 45%, #6fae10 100%);
}

.art {
  position: absolute;
  top: 78px;
  left: 195px;
  width: 240px;
  height: 240px;
  object-fit: contain;
  border-radius: 24px;
}

.initial {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 150px;
}

.fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 150px;
  background: linear-gradient(180deg, rgba(20, 60, 0, 0), rgba(10, 35, 0, 0.85));
}

.name {
  position: absolute;
  bottom: 50px;
  left: 28px;
  right: 28px;
  overflow: hidden;
  color: #fff;
  font-size: 33px;
  line-height: 40px;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}
</style>
