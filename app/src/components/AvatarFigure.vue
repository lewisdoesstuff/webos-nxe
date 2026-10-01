<script setup lang="ts" vapor>
import { onMounted, onUnmounted, ref, watch } from "vue";

import type { AvatarRenderer } from "../avatar/avatarGl";
import { AVATAR_H, AVATAR_W } from "../avatar/framing";
import type { Look } from "../avatar/look";

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
    /** Loaded instead when `src` is missing or unreadable. */
    fallback?: string;
    playing?: boolean;
    /** Tints the figure for someone else; null is the owner's own. */
    look?: Look | null;
    renderScale?: number;
    fps?: number;
  }>(),
  { fallback: "", playing: true, look: null, renderScale: 1, fps: 60 },
);

const emit = defineEmits<{
  loaded: [];
  failed: [cause: unknown];
  clip: [name: string];
  /** A gamer picture of the avatar, as a data URL, once it has loaded. */
  portrait: [url: string];
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
    if (props.fallback === "") {
      console.error("[nxe] avatar failed to load", cause);
      emit("failed", cause);
      return;
    }
    try {
      await own.load(props.fallback);
    } catch (again: unknown) {
      console.error("[nxe] avatar failed to load", again);
      emit("failed", again);
      return;
    }
  }
  if (renderer !== own) return;
  ready = true;
  sync();
  emit("loaded");
  const portrait = own.portrait();
  if (portrait !== null) emit("portrait", portrait);
  if (props.look !== null) own.setLook(props.look);
}

onMounted(() => void begin());

onUnmounted(() => {
  gone = true;
  renderer?.release();
  renderer = null;
});

watch(() => props.playing, sync);
watch(
  () => props.look,
  (look) => renderer?.setLook(look),
);
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
