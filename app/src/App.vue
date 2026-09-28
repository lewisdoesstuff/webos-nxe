<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useAppsStore } from "./stores/apps";

/**
 * The Guide hub, at the console's own resolution.
 *
 * Every number below is a 720p pixel from retail build 9199 or a measured table
 * from a recreation, and is scaled once by `K` into the 1920x1080 authoring
 * space. See `docs/research/NXE-XUI.md` for the provenance of each.
 *
 * The arrangement is a perspective row: each card is smaller and closer to the
 * centre line than the one before it, and the tables below are the ramp. Cards
 * are placed by a single left-to-right pass, so the row is one plane.
 */

const K = 1.5;

const apps = useAppsStore();

interface Card {
  id: string;
  label: string;
  tint: string;
  appId?: string;
}

/** Placeholder art until the launch tiles are known. Non-empty, by type. */
const CARDS: readonly [Card, ...Card[]] = [
  { id: "games", label: "Games", tint: "#3f6a1f" },
  { id: "media", label: "Movies", tint: "#5a3a6e" },
  { id: "music", label: "Music", tint: "#1f5a6a" },
  { id: "live", label: "Live TV", tint: "#6a5a1f", appId: "com.webos.app.livetv" },
  { id: "store", label: "Store", tint: "#6a3a1f" },
  { id: "library", label: "Library", tint: "#3a3a44" },
  { id: "settings", label: "Settings", tint: "#2a2a32", appId: "launcher-settings" },
];

/**
 * `GameGeneric` is the 4:3 tile, 420x320, and its three ramps are measured:
 * multiplying the scale column by 320 gives whole pixels, which is how you can
 * tell a measured table from an eyeballed one.
 */
const CARD_W = 420;
const CARD_H = 320;
const SCALE_RAMP = [1, 0.74375, 0.59375, 0.49375, 0.421875, 0.36875] as const;
const GAP_RAMP = [0, -1, -65, -85, -91, -94] as const;
/** Negative, so the row converges on the centre line. The wide tile goes positive. */
const RISE_RAMP = [0, -7, -11, -14, -16, -17] as const;

const CENTRE_Y = 352;
const HUB_LEFT = 300;
const WINDOW_BEFORE = 2;
const WINDOW_AFTER = 5;

const MOVE_MS = 300;
const STAGGER_MS = 50;

function ramp(table: readonly number[], d: number): number {
  return table[Math.min(Math.abs(d), table.length - 1)] ?? 0;
}

const focus = ref(0);

const layout = computed(() => {
  const placed: { card: Card; d: number; x: number; y: number; scale: number }[] = [];
  let edge = HUB_LEFT;
  for (let d = -WINDOW_BEFORE; d <= WINDOW_AFTER; d += 1) {
    const card = CARDS[focus.value + d];
    if (!card) continue;
    const scale = ramp(SCALE_RAMP, d);
    const w = CARD_W * scale;
    const y = CENTRE_Y + CARD_H / 2 + ramp(RISE_RAMP, d) * K;
    if (d < 0) {
      const x = HUB_LEFT - w + ramp(GAP_RAMP, d) * K;
      placed.push({ card, d, x, y, scale });
      continue;
    }
    if (d === 0) {
      placed.push({ card, d, x: edge, y, scale });
      edge = edge + w;
      continue;
    }
    const x = edge + ramp(GAP_RAMP, d) * K;
    placed.push({ card, d, x, y, scale });
    edge = x + w;
  }
  return placed;
});

function styleFor(item: {
  x: number;
  y: number;
  scale: number;
  d: number;
}): Record<string, string> {
  return {
    width: `${CARD_W * K}px`,
    height: `${CARD_H * K}px`,
    transform: `translate3d(${item.x * K}px, ${-item.y * K}px, 0) scale(${item.scale})`,
    transitionDelay: `${Math.max(0, item.d) * STAGGER_MS}ms`,
  };
}

const highlight = computed(() => layout.value.find((item) => item.d === 0) ?? null);

function highlightStyle(): Record<string, string> {
  const item = highlight.value;
  if (!item) return { opacity: "0" };
  return {
    width: `${CARD_W * K}px`,
    height: `${CARD_H * K}px`,
    transform: `translate3d(${item.x * K}px, ${-item.y * K}px, 0)`,
    transitionDelay: "0ms",
  };
}

const detail = computed((): Card => CARDS[focus.value] ?? CARDS[0]);

/** Single source for the move, so the stylesheet cannot drift from the model. */
const motion = { "--move-ms": `${MOVE_MS}ms`, "--stagger-ms": `${STAGGER_MS}ms` };

const gamertag = "Player";

function onKeyDown(event: KeyboardEvent): void {
  const forward = event.keyCode === 39;
  const back = event.keyCode === 37;
  if (!forward && !back) return;
  event.preventDefault();
  const next = (focus.value + (forward ? 1 : CARDS.length - 1)) % CARDS.length;
  focus.value = next;
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  void apps.load();
  expose();
});

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

/** Readable over CDP, so the TV can be probed without a rebuild. */
function expose(): void {
  (window as typeof window & { xneDebug?: unknown }).xneDebug = { focus, layout, detail };
}
</script>

<template>
  <main class="stage" :style="motion">
    <div class="hub">
      <div class="glow" />

      <header class="who">
        <div class="avatar" />
        <div class="id">
          <span class="tag">{{ gamertag }}</span>
          <span class="score">G 1250</span>
        </div>
      </header>

      <div class="row">
        <div
          v-for="item in layout"
          :key="item.card.id"
          class="card"
          :class="{ on: item.d === 0 }"
          :style="styleFor(item)"
          :data-card="item.card.id"
        >
          <div class="art" :style="{ background: item.card.tint }" />
          <span class="cap">{{ item.card.label }}</span>
        </div>

        <div class="mark" :style="highlightStyle()" />
      </div>

      <aside class="detail">
        <h1>{{ detail.label }}</h1>
        <p>
          Detail plate. The 2008 hub carried a preview here, with the panel's own copy beneath it.
        </p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
/*
 * The stage is 1920x1080 at `devicePixelRatio: 2` on this TV, so an unzoomed
 * plane rasterises at 3840x2160 and a single one of those costs 31.6MB of the
 * 311MB the GPU gets per frame. `zoom: 0.5` drops the whole stack to one
 * device pixel per CSS pixel, 8.3MB for everything, which is 2.25x the pixel
 * count NXE itself ran at. See docs/PERF.md.
 */
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0b0f14;
}

.hub {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1920px;
  height: 1080px;
  margin: -540px 0 0 -960px;
  zoom: 0.5;
  transform: translateZ(0);
}

/* The hub's own radial, from GuideMain.xui: #0F0F0F at alpha 100 into #81878D
   at alpha 0. Real values, not the greys the recreations picked. */
.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 38% 45%,
    rgba(15, 15, 15, 0.39) 0%,
    rgba(129, 135, 141, 0) 72%
  );
}

.who {
  position: absolute;
  top: 96px;
  left: 168px;
  display: flex;
  gap: 24px;
  align-items: center;
}

.avatar {
  width: 132px;
  height: 132px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: linear-gradient(160deg, #4a4f57, #22262b);
}

.id {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tag {
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.score {
  font-size: 24px;
  color: #9aa4ad;
}

.row {
  position: absolute;
  inset: 0;
}

.card {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 10px;
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.45);
  /* Promoted, because a transform on an unpromoted box repaints it every frame.
     The layer exists at rest and only its transform changes, so a move
     allocates nothing. */
  will-change: transform;
  transform-origin: 0 0;
  transition: transform var(--move-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.art {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  opacity: 0.82;
}

.card.on .art {
  opacity: 1;
}

.cap {
  position: absolute;
  bottom: 22px;
  left: 26px;
  font-size: 30px;
  font-weight: 700;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.55);
}

/* The selection rides on its own element so that moving it never changes a
   card's content, and a card's content is what would force a re-raster. */
.mark {
  position: absolute;
  top: 0;
  left: 0;
  border: 3px solid rgba(255, 255, 255, 0.85);
  border-radius: 13px;
  box-shadow: 0 0 22px rgba(255, 255, 255, 0.25);
  will-change: transform;
  transition: transform var(--move-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
  pointer-events: none;
}

.detail {
  position: absolute;
  top: 300px;
  right: 150px;
  width: 560px;
}

.detail h1 {
  margin: 0 0 18px;
  font-size: 52px;
  font-weight: 300;
  letter-spacing: 0.015em;
}

.detail p {
  margin: 0;
  font-size: 28px;
  line-height: 1.3;
  color: #c3ccd4;
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .mark {
    transition: none;
  }
}
</style>
