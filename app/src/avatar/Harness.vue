<script setup lang="ts" vapor>
import { onMounted, onUnmounted, ref } from "vue";

import AvatarFigure from "../components/AvatarFigure.vue";
import fixture from "./fixture.glb?url";

/**
 * The avatar alone on a stand-in hub, in dev only: `/avatar.html`, or
 * `/avatar.html?src=<url>` for a 360sona export. Space freezes and resumes it,
 * as a transition would.
 */
const src = new URLSearchParams(window.location.search).get("src") ?? fixture;
const playing = ref(true);
const state = ref("loading");
const clip = ref("");

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== " ") return;
  event.preventDefault();
  playing.value = !playing.value;
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <main class="stage">
    <div class="sky" />
    <div class="floor" />
    <div class="spot">
      <AvatarFigure
        :src="src"
        :playing="playing"
        @loaded="state = 'loaded'"
        @failed="state = 'failed'"
        @clip="clip = $event"
      />
    </div>
    <p class="note">{{ state }}, {{ playing ? "playing" : "held" }}, {{ clip }}. Space holds.</p>
  </main>
</template>

<style scoped>
.stage {
  position: relative;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
}

.sky {
  position: absolute;
  inset: 0 0 45% 0;
  background: linear-gradient(#2f6b12, #9fce3b 70%, #e6f2c8);
}

.floor {
  position: absolute;
  inset: 55% 0 0 0;
  background: linear-gradient(#cfd5da, #7d858c 60%, #3a4046);
}

.spot {
  position: absolute;
  left: 1100px;
  top: 400px;
}

.note {
  position: absolute;
  left: 40px;
  bottom: 20px;
  color: #fff;
  font-size: 28px;
}
</style>
