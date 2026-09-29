<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref } from "vue";

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
import { SELECT, promptsFor } from "./prompts";
import { CANVAS_H, CANVAS_W } from "./ribbon";
import { CHANNEL_ORDER, SECTIONS, sectionRows, START_CHANNEL } from "./sections";
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
  channels.map((channel) => sectionRows(channel.id, apps.launchPoints, settings.settings)),
);

const counts = computed(() => rows.value.map((row) => row.length));

const shownRow = computed(() => rows.value[shown.value.channel] ?? []);

const pool = computed(() => placePool(shown.value.item, shownRow.value.length));

const counter = computed(() => counterText(shown.value.item, shownRow.value.length));

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
  void apps.launch(item.id);
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
    <div class="sky" />
    <div class="floor" />

    <span
      v-for="(channel, index) in channels"
      :key="channel.id"
      class="label"
      :data-channel="channel.id"
      :data-selected="index === hub.channel || undefined"
      :style="labelStyle(index)"
      >{{ channel.label }}</span
    >
    <span class="bullet" :style="bulletStyle" />

    <div class="row" data-panes>
      <HubPane
        v-for="pane in pool"
        :key="pane.element"
        :item="paneItem(pane)"
        :data-offset="pane.offset"
        :style="paneStyle(pane)"
      />
    </div>

    <span class="counter" :style="counterStyle">{{ counter }}</span>

    <header class="card" :style="cardStyle">
      <span class="tag">{{ settings.settings.gamertag || "Player1" }}</span>
      <span class="score">0 G</span>
    </header>
    <div class="pic" :style="picStyle" />

    <div class="frame" data-frame :style="frameStyle">
      <PromptBar :prompts="promptsFor({ a: SELECT.label })" />

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

/* Placeholder ground, to be replaced by the theme art: a green sky over a grey
   floor, with the horizon at the measured y 390 (585 at 1080p). */
.sky {
  position: absolute;
  inset: 0 0 auto 0;
  height: 600px;
  background: linear-gradient(170deg, #1f4a08 0%, #5d9a12 30%, #b5d77a 70%, #eef4dc 100%);
}

.floor {
  position: absolute;
  top: 585px;
  left: -200px;
  right: -200px;
  bottom: 0;
  border-radius: 50% 50% 0 0 / 40px 40px 0 0;
  background: linear-gradient(180deg, #8b949c 0%, #4d565f 30%, #b8c1c9 75%, #5d666f 100%);
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
  font-size: 32px;
  line-height: 40px;
}

.pic {
  position: absolute;
  border-radius: 3px;
  background: linear-gradient(160deg, #6d747c, #3a4047);
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
