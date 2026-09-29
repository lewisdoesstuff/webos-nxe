<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { type BootReason, type BootSpeed, resolveBootMode } from "./boot";
import BootScreen from "./components/BootScreen.vue";
import GuideOverlay from "./components/GuideOverlay.vue";
import HubPane from "./components/HubPane.vue";
import PromptBar from "./components/PromptBar.vue";
import {
  BULLET_SIZE,
  BULLET_X,
  BULLET_Y,
  CARD_PIC,
  CARD_PIC_X,
  CARD_PIC_Y,
  CARD_RIGHT,
  CHANNEL_IN_MS,
  CHANNEL_OUT_MS,
  COUNTER_X,
  COUNTER_Y,
  counterText,
  DEAL_MS,
  DEAL_STAGGER_MS,
  HIDDEN,
  type HubMove,
  type HubState,
  LABEL_FONT,
  LABEL_H,
  LABEL_W,
  labelSlot,
  MOVE_EASE,
  MOVE_MS,
  PANE_W,
  PANE_X,
  placePool,
  POOL_SIZE,
  type PooledPane,
  stepHub,
} from "./hub";
import { channelItems, launchTarget } from "./hubRows";
import { paneArt } from "./panel";
import { SELECT, promptsFor } from "./prompts";
import { CANVAS_H, CANVAS_W } from "./ribbon";
import { CHANNEL_ORDER, SECTIONS, START_CHANNEL } from "./sections";
import { useAppsStore } from "./stores/apps";
import { useSettingsStore } from "./stores/settings";

/**
 * The hub: the channel list at the top left, the channel's row of panes below
 * it receding to the right, the gamercard at the top right and the prompts at
 * the foot. Geometry and navigation are `hub.ts`'s, measured off retail 9199.
 *
 * A transition must not allocate (docs/PERF.md). The row is a fixed pool of
 * pane elements whatever the channel holds, recycled as the focus moves, and
 * the list is one label per channel. Both are promoted, so a move is transform
 * and opacity writes on textures that already exist.
 */

const apps = useAppsStore();
const settings = useSettingsStore();

/** Where the user is. The labels follow it at once. */
const hub = ref<HubState>({ channel: START_CHANNEL, item: 0 });
/** What the row shows. It lags `hub` through a channel change's fade. */
const shown = ref<HubState>({ channel: START_CHANNEL, item: 0 });

/**
 * A channel change: `out` fades the row, `collapsed` swaps it in behind the
 * focused pane with no transition, `in` fades the focused pane up and deals the
 * spill out to the right.
 */
type Phase = "rest" | "out" | "collapsed" | "in";
const phase = ref<Phase>("rest");
let generation = 0;

/** The Guide is a full-screen takeover, not a side panel. VERIFIED, 9199. */
const guide = ref(false);

/**
 * The boot, mounted over a dashboard that is already there.
 *
 * The handover is the boot's own plane fading out onto the dashboard, so the
 * dashboard has to exist from the first frame. Mounting it after `done` would
 * put an allocation inside the transition, which is the one thing this project
 * treats as a defect.
 *
 * `boot` is a counter rather than a boolean so that `Y` can replay it: setting
 * the same boolean to true twice would not remount the component.
 */
const boot = ref(0);
const booting = ref(true);
const bootMode = ref<BootSpeed | "off">("full");

/**
 * `auto` resolves to full on a cold start and short on a warm one, and to off
 * under a reduced-motion preference, since the whole sequence is a large moving
 * light. `?boot=off|full|short` in the URL overrides it, for development and
 * `tools/compare.mjs`; there is no setting for it yet.
 */
function chooseBootMode(): void {
  const asked = new URLSearchParams(window.location.search).get("boot");
  const preference = asked === "off" || asked === "full" || asked === "short" ? asked : "auto";
  bootMode.value = resolveBootMode(preference, { cold: true });
}

function onBootDone(payload: { reason: BootReason }): void {
  if (payload.reason === "skipped") console.info("[xne] boot skipped");
  booting.value = false;
}

/** A boot resolved to off never mounts, so the dashboard is simply the first thing shown. */
function settleBoot(): void {
  if (bootMode.value === "off") booting.value = false;
}

const channels = CHANNEL_ORDER.map(
  (id) => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0],
);

const rows = computed(() =>
  channels.map((channel) => channelItems(channel.id, apps.launchPoints, settings.settings)),
);

const counts = computed(() => rows.value.map((row) => row.length));

const shownRow = computed(() => rows.value[shown.value.channel] ?? []);

const pool = computed(() => placePool(shown.value.item, shownRow.value.length));

const counter = computed(() => counterText(shown.value.item, shownRow.value.length));

/**
 * Every pane's art, decoded as soon as the apps load and held for the life of
 * the page, so a channel change that puts eight new icons up at once finds
 * them already decoded (PERF-STATUS, "decode artwork at boot").
 */
const heldArt = new Map<string, HTMLImageElement>();
watch(
  () => apps.launchPoints,
  (points) => {
    for (const point of points) {
      const url = paneArt(point);
      if (!url || heldArt.has(url)) continue;
      const image = new Image();
      image.src = url;
      heldArt.set(url, image);
      image.decode().catch(() => undefined);
    }
  },
);

function paneItem(pane: PooledPane) {
  return pane.item === null ? null : (shownRow.value[pane.item] ?? null);
}

const moveTransition = `transform ${MOVE_MS}ms ${MOVE_EASE}, opacity ${MOVE_MS}ms ${MOVE_EASE}`;

function paneStyle(pane: PooledPane): Record<string, string> {
  let { x, y, scale, opacity } = pane.slot;
  let transition = moveTransition;
  if (phase.value === "out") {
    opacity = HIDDEN;
    transition = `opacity ${CHANNEL_OUT_MS}ms linear`;
  } else if (phase.value === "collapsed") {
    if (pane.offset > 0) x = PANE_X + PANE_W * (1 - scale);
    opacity = HIDDEN;
    transition = "none";
  } else if (phase.value === "in") {
    const dealt = pane.offset > 0;
    const delay = dealt ? CHANNEL_IN_MS + (pane.offset - 1) * DEAL_STAGGER_MS : 0;
    const fade = dealt ? DEAL_MS / 2 : CHANNEL_IN_MS;
    transition = `transform ${DEAL_MS}ms ${MOVE_EASE} ${delay}ms, opacity ${fade}ms linear ${delay}ms`;
  }
  return {
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
    opacity: `${opacity}`,
    "z-index": `${pane.slot.z}`,
    transition,
  };
}

function labelStyle(index: number): Record<string, string> {
  const slot = labelSlot(hub.value.channel - index);
  return {
    width: `${LABEL_W}px`,
    height: `${LABEL_H}px`,
    "font-size": `${LABEL_FONT}px`,
    "line-height": `${LABEL_H}px`,
    transform: `translate3d(${slot.x}px, ${slot.y}px, 0) scale(${slot.scale})`,
    opacity: `${slot.opacity}`,
  };
}

const bulletStyle = {
  left: `${BULLET_X}px`,
  top: `${BULLET_Y}px`,
  width: `${BULLET_SIZE}px`,
  height: `${BULLET_SIZE}px`,
};

const counterStyle = { left: `${COUNTER_X}px`, top: `${COUNTER_Y}px` };

const cardStyle = {
  right: `${1920 - CARD_RIGHT}px`,
  top: `${CARD_PIC_Y}px`,
};

const picStyle = {
  left: `${CARD_PIC_X}px`,
  top: `${CARD_PIC_Y}px`,
  width: `${CARD_PIC}px`,
  height: `${CARD_PIC}px`,
};

/** The 720p frame's own size, which the prompt row and the Guide are authored in. */
const frameStyle = {
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`,
};

const motion = {
  "--move-ms": `${MOVE_MS}ms`,
  "--move-ease": MOVE_EASE,
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function changeChannel(): Promise<void> {
  const mine = ++generation;
  phase.value = "out";
  await new Promise((resolve) => setTimeout(resolve, CHANNEL_OUT_MS));
  if (mine !== generation) return;
  shown.value = hub.value;
  phase.value = "collapsed";
  await nextFrame();
  await nextFrame();
  if (mine !== generation) return;
  phase.value = "in";
  const settle = CHANNEL_IN_MS + DEAL_MS + DEAL_STAGGER_MS * POOL_SIZE;
  await new Promise((resolve) => setTimeout(resolve, settle));
  if (mine === generation) phase.value = "rest";
}

function navigate(move: HubMove): void {
  const next = stepHub(hub.value, move, counts.value);
  if (next === hub.value) return;
  const channelChanged = next.channel !== hub.value.channel;
  hub.value = next;
  if (channelChanged) {
    void changeChannel();
    return;
  }
  if (phase.value === "out") return;
  generation++;
  phase.value = "rest";
  shown.value = next;
}

/** A launches the focused pane's item. */
function activate(): void {
  const item = rows.value[hub.value.channel]?.[hub.value.item];
  if (!item) return;
  const target = launchTarget(item);
  void apps.launch(target.id, { ...target.params });
}

/**
 * The remote, mapped to the controller: OK and green are A, Back and red are
 * B, the arrows are the D-pad, and Channel +/- are the bumpers. B does nothing
 * at the hub root, as on the dashboard.
 */
const MOVES: Readonly<Record<number, HubMove>> = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  34: "pageLeft",
  33: "pageRight",
};

function onKeyDown(event: KeyboardEvent): void {
  if (guide.value) {
    if (
      event.keyCode === 89 ||
      event.keyCode === 461 ||
      event.keyCode === 27 ||
      event.keyCode === 403
    ) {
      event.preventDefault();
      guide.value = false;
    }
    return;
  }
  const move = MOVES[event.keyCode];
  if (move) {
    event.preventDefault();
    navigate(move);
    return;
  }
  if (event.keyCode === 13 || event.keyCode === 404) {
    event.preventDefault();
    activate();
    return;
  }
  // `Y` on a desktop keyboard replays the boot.
  if (event.keyCode === 89) {
    event.preventDefault();
    booting.value = true;
    boot.value += 1;
    return;
  }
  // The Guide, on the key a desktop keyboard has for it.
  if (event.keyCode === 71) {
    event.preventDefault();
    guide.value = true;
  }
}

onMounted(() => {
  chooseBootMode();
  settleBoot();
  window.addEventListener("keydown", onKeyDown);
  void apps.load();
  expose();
});

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

function expose(): void {
  (window as typeof window & { xneDebug?: unknown }).xneDebug = {
    hub,
    shown,
    phase,
    pool,
    guide,
    boot,
  };
}
</script>

<template>
  <main class="stage" :style="motion">
    <!--
      Everything static paints before anything promoted. Unpromoted content
      painted after an animating layer has to be squashed into a layer of its
      own, and that layer changes identity mid-move, which is an allocation.
    -->
    <div class="sky" />
    <div class="floor" />
    <div class="orb" />
    <span class="bullet" :style="bulletStyle" />
    <span class="counter" :style="counterStyle">{{ counter }}</span>
    <header class="card" :style="cardStyle">
      <span class="tag">{{ settings.settings.gamertag || "Player1" }}</span>
      <span class="score">0<i class="coin">G</i></span>
    </header>
    <div class="pic" :style="picStyle" />
    <div class="frame" data-frame :style="frameStyle">
      <PromptBar :prompts="promptsFor({ a: SELECT.label })" />
    </div>

    <span
      v-for="(channel, index) in channels"
      :key="channel.id"
      class="label"
      :data-channel="channel.id"
      :data-selected="index === hub.channel || undefined"
      :style="labelStyle(index)"
      >{{ channel.label }}</span
    >

    <div class="row" data-panes>
      <HubPane
        v-for="pane in pool"
        :key="pane.element"
        :item="paneItem(pane)"
        :data-offset="pane.offset"
        :style="paneStyle(pane)"
      />
    </div>

    <div class="frame" data-guide :style="frameStyle">
      <GuideOverlay
        :open="guide"
        :blade="hub.channel"
        :items="(rows[hub.channel] ?? []).map((row) => row.title)"
      />
    </div>

    <!--
      Mounted over the dashboard, which is already mounted. The handover is the
      boot's own plane fading out, so the dashboard behind it has to exist from
      the first frame or the boot would have to create it mid-transition.
    -->
    <BootScreen
      v-if="booting && bootMode !== 'off'"
      :key="boot"
      :mode="bootMode"
      @done="onBootDone"
    />
  </main>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #2c3a1a;
}

/* Lime sky lit from the right horizon, over a grey reflective floor whose
   horizon is the measured y 585. Everything here is static paint. */
.sky {
  position: absolute;
  inset: 0 0 auto 0;
  height: 620px;
  background:
    radial-gradient(
      circle 60px at 1130px 150px,
      transparent 0 34px,
      rgba(255, 255, 255, 0.1) 35px 38px,
      transparent 39px
    ),
    radial-gradient(
      circle 60px at 1400px 90px,
      transparent 0 40px,
      rgba(255, 255, 255, 0.09) 41px 45px,
      transparent 46px
    ),
    radial-gradient(circle 40px at 860px 350px, rgba(255, 255, 255, 0.1) 0 26px, transparent 27px),
    radial-gradient(circle 40px at 1450px 360px, rgba(255, 255, 255, 0.1) 0 24px, transparent 25px),
    radial-gradient(
      ellipse 34% 60% at 96% 100%,
      rgba(250, 250, 150, 0.95) 0%,
      rgba(230, 240, 90, 0.6) 45%,
      rgba(230, 240, 90, 0) 100%
    ),
    radial-gradient(
      ellipse 42% 60% at 80% 60%,
      rgba(226, 234, 226, 1) 0%,
      rgba(226, 234, 226, 0) 100%
    ),
    radial-gradient(ellipse 75% 85% at 0% 0%, rgba(14, 52, 4, 0.95) 0%, rgba(14, 52, 4, 0) 100%),
    linear-gradient(180deg, #2f6a08 0%, #7db510 45%, #b4d64a 100%);
}

.floor {
  position: absolute;
  top: 585px;
  left: -300px;
  right: -300px;
  bottom: 0;
  border-radius: 50% 50% 0 0 / 60px 60px 0 0;
  background:
    radial-gradient(
      ellipse 45% 22% at 42% 8%,
      rgba(232, 240, 248, 0.95) 0%,
      rgba(232, 240, 248, 0) 100%
    ),
    radial-gradient(ellipse 50% 40% at 100% 0%, rgba(40, 46, 50, 0.7) 0%, rgba(40, 46, 50, 0) 100%),
    radial-gradient(
      ellipse 60% 60% at 50% 115%,
      rgba(20, 24, 28, 0.55) 0%,
      rgba(20, 24, 28, 0) 100%
    ),
    linear-gradient(180deg, #6f7880 0%, #8b949c 25%, #b9c3cc 55%, #7d8791 100%);
}

.orb {
  position: absolute;
  left: 1737px;
  top: 948px;
  width: 0;
  height: 0;
}

.orb::before {
  content: "";
  position: absolute;
  left: -110px;
  top: 30px;
  width: 220px;
  height: 56px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse 50% 50% at 50% 50%,
    rgba(255, 255, 255, 0) 55%,
    rgba(255, 255, 255, 0.4) 62%,
    rgba(40, 46, 52, 0.35) 70%,
    rgba(255, 255, 255, 0.3) 78%,
    rgba(255, 255, 255, 0) 88%
  );
}

.orb::after {
  content: "";
  position: absolute;
  left: -33px;
  top: -33px;
  width: 66px;
  height: 66px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 30%, #fff 0%, #d5dadd 45%, #7f8a90 100%);
  box-shadow: inset 0 0 0 3px rgba(60, 130, 20, 0.5);
}

/* A channel label is a promoted box scaled about its left edge, so the list
   scrolls and recedes by transform and opacity alone. */
.label {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  color: #fff;
  white-space: nowrap;
  transform-origin: 0 50%;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.45);
  will-change: transform, opacity;
  transition:
    transform var(--move-ms) var(--move-ease),
    opacity var(--move-ms) var(--move-ease);
}

.bullet {
  position: absolute;
  background: #fff;
}

.row {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.row :deep(.pane) {
  transform-origin: 0 0;
  will-change: transform, opacity;
}

.counter {
  position: absolute;
  color: rgba(255, 255, 255, 0.85);
  font-size: 24px;
  line-height: 30px;
}

.card {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: #fff;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.45);
}

.tag {
  font-size: 40px;
  line-height: 48px;
}

.score {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 34px;
  line-height: 40px;
}

.coin {
  display: inline-block;
  width: 33px;
  height: 33px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 30%, #fff 0%, #c9cfd3 60%, #8d979d 100%);
  color: #4a5258;
  font-size: 21px;
  font-style: normal;
  font-weight: 700;
  line-height: 33px;
  text-align: center;
  text-shadow: none;
}

.pic {
  position: absolute;
  border-radius: 3px;
  background: linear-gradient(160deg, #6d747c, #3a4047);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.45);
}

/* The prompt row and the Guide are authored in the 720p frame's own pixels
   and scaled to 1080p about the stage's origin by one transform. */
.frame {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  transform: scale(1.5);
  transform-origin: 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .label,
  .row :deep(.pane) {
    transition: none !important;
  }
}
</style>
