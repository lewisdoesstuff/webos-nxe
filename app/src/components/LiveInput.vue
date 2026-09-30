<script setup lang="ts" vapor>
import { ref, watch } from "vue";

import { LIVE_BOX, type LiveTarget } from "../preview/live";

/**
 * One video element for the focused HDMI pane. It has no source until the hub
 * has stood still on a port with a signal, and loses it the moment anything
 * moves, so the TV builds no video pipeline during a transition. Any failure
 * leaves the pane's icon showing.
 */
const props = defineProps<{ target: LiveTarget | null }>();

const video = ref<HTMLVideoElement>();
const playing = ref(false);

watch(
  () => props.target?.src ?? null,
  (src) => {
    const element = video.value;
    if (!element) return;
    playing.value = false;
    while (element.firstChild) element.removeChild(element.firstChild);
    if (src === null) {
      element.load();
      return;
    }
    const source = document.createElement("source");
    source.type = "service/webos-external";
    source.src = src;
    element.appendChild(source);
    element.load();
    void element.play().catch(() => undefined);
  },
);

const box = {
  left: `${LIVE_BOX.x}px`,
  top: `${LIVE_BOX.y}px`,
  width: `${LIVE_BOX.width}px`,
  height: `${LIVE_BOX.height}px`,
};
</script>

<template>
  <video
    ref="video"
    class="live"
    :style="box"
    :data-on="playing || undefined"
    muted
    playsinline
    @playing="playing = true"
    @error="playing = false"
    @emptied="playing = false"
  />
</template>

<style scoped>
.live {
  position: absolute;
  background: #000;
  opacity: 0.001;
  pointer-events: none;
}

.live[data-on] {
  opacity: 1;
}
</style>
