<script setup lang="ts" vapor>
import { onMounted, onUnmounted, ref, watch } from "vue";

import type { AvatarRenderer } from "../avatar/avatarGl";
import { AVATAR_H, AVATAR_W } from "../avatar/framing";

/**
 * The avatar, standing. One canvas of a fixed size, promoted at rest, so the
 * hub places it by transform and a move allocates nothing. `playing` false
 * freezes it on its last frame: the hub clears it for every transition and
 * while the avatar is off channel. three.js is 640KB of script and the model
 * several MB, so neither is read until `src` is set: the hub sets it once the
 * boot has finished, and the canvas stands empty until then.
 */
const props = withDefaults(
  defineProps<{
    /** The model: a 360sona GLB. Empty until it should load. */
    src: string;
    playing?: boolean;
    renderScale?: number;
    fps?: number;
  }>(),
  { playing: true, renderScale: 1, fps: 30 },
);

const emit = defineEmits<{
  loaded: [];
  failed: [cause: unknown];
  clip: [name: string];
}>();

const canvas = ref<HTMLCanvasElement>();
let renderer: AvatarRenderer | null = null;
let ready = false;
let gone = false;
let started = false;

function sync(): void {
  if (renderer === null || !ready) return;
  if (props.playing) renderer.start();
  else renderer.stop();
}

async function begin(): Promise<void> {
  const element = canvas.value;
  if (started || element === undefined || props.src === "") return;
  started = true;
  const { AvatarRenderer } = await import("../avatar/avatarGl");
  if (gone) return;
  const own = new AvatarRenderer(element, {
    width: AVATAR_W,
    height: AVATAR_H,
    renderScale: props.renderScale,
    fps: props.fps,
    onClip: (name) => emit("clip", name),
  });
  renderer = own;
  try {
    await own.load(props.src);
  } catch (cause: unknown) {
    console.error("[xne] avatar failed to load", cause);
    emit("failed", cause);
    return;
  }
  if (renderer !== own) return;
  ready = true;
  sync();
  emit("loaded");
}

onMounted(() => void begin());

onUnmounted(() => {
  gone = true;
  renderer?.release();
  renderer = null;
});

watch(() => props.playing, sync);
watch(
  () => props.src,
  () => void begin(),
);

const style = { width: `${AVATAR_W}px`, height: `${AVATAR_H}px` };
</script>

<template>
  <canvas ref="canvas" class="avatar" :style="style" />
</template>

<style scoped>
.avatar {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform, opacity;
}
</style>
