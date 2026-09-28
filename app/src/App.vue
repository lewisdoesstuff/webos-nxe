<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref } from "vue";

import GuideOverlay from "./components/GuideOverlay.vue";
import HubPanel from "./components/HubPanel.vue";
import PromptBar from "./components/PromptBar.vue";
import { stepFocus } from "./focus/row";
import { SELECT, promptsFor } from "./prompts";
import { SECTIONS, type SectionId, sectionRows } from "./sections";
import { useAppsStore } from "./stores/apps";
import { useSettingsStore } from "./stores/settings";

/**
 * The hub, wired to real data.
 *
 * Every layout number is a 720p pixel read out of retail build 9199's scene
 * graphs, so the design resolution and the authoring resolution are the same and
 * there is no conversion table to get wrong. The hub is scaled once to fill the
 * panel by `--present`.
 *
 * The sheet in `docs/PERF.md` is what shapes this file. A transition must not
 * allocate, so the shelf keeps four tiles whatever the rows are, the ribbon keeps
 * five blades whatever the focus is, and every page is mounted closed. A
 * `v-for` whose length follows the data is the bug this project exists to avoid.
 */

const apps = useAppsStore();
const settings = useSettingsStore();

const CANVAS_W = 1280;
const CANVAS_H = 720;
const PRESENT = 1.5;

const BLADE_Y = 117.5;
const BLADE_W = 70;
const BLADE_H = 235;
const MOVE_MS = 300;
const STAGGER_MS = 50;
const STEP = [27, 26, 24, 22, 21] as const;
const STEP_SCALE = [0.96, 0.93, 0.9, 0.87, 0.84] as const;

/** Sections are fixed at five against five ramp slots, so the ribbon is one lap. */
const SLOT_COUNT = STEP.length;

function ramp(table: readonly number[], i: number): number {
  return table[Math.min(Math.max(i, 0), table.length - 1)] ?? 0;
}

const focus = ref(0);

function clampTo(index: number, delta: number, count: number): number {
  return stepFocus(index, delta, count);
}

interface Blade {
  id: string;
  d: number;
  x: number;
  scale: number;
  section: (typeof SECTIONS)[number];
}

/**
 * The ribbon, one pass outward from the plate.
 *
 * Geometry never depends on the focus, only the ids on it, so the boxes on
 * screen are identical before and after a move. Five slots, always.
 */
const blades = computed<Blade[]>(() => {
  const placed: Blade[] = [];
  let edge = 231 + 386;
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const scale = ramp(STEP_SCALE, i);
    const x = i === 0 ? edge : edge + ramp(STEP, i);
    edge = x + BLADE_W * scale;
    const section = SECTIONS[(focus.value + i) % SECTIONS.length] ?? SECTIONS[0];
    placed.push({ id: section.id, d: i, x, scale, section });
  }
  return placed;
});

function bladeStyle(blade: Blade): Record<string, string> {
  return {
    width: `${BLADE_W}px`,
    height: `${BLADE_H}px`,
    transform: `translate3d(${blade.x}px, ${BLADE_Y}px, 0) scale(${blade.scale})`,
    transitionDelay: `${blade.d * STAGGER_MS}ms`,
  };
}

const section = computed(() => SECTIONS[focus.value] ?? SECTIONS[0]);

const rows = computed(() =>
  sectionRows(section.value.id as SectionId, apps.launchPoints, settings.settings),
);

/** The Guide is a full-screen takeover, not a side panel. VERIFIED, 9199. */
const guide = ref(false);

const motion = {
  "--move-ms": `${MOVE_MS}ms`,
  "--stagger-ms": `${STAGGER_MS}ms`,
  "--present": String(PRESENT),
  "--canvas-w": `${CANVAS_W}px`,
  "--canvas-h": `${CANVAS_H}px`,
};

function onKeyDown(event: KeyboardEvent): void {
  if (guide.value) {
    if (event.keyCode === 89 || event.keyCode === 461 || event.keyCode === 27) {
      event.preventDefault();
      guide.value = false;
    }
    return;
  }
  if (event.keyCode === 39) {
    event.preventDefault();
    focus.value = clampTo(focus.value, 1, SECTIONS.length);
    return;
  }
  if (event.keyCode === 37) {
    event.preventDefault();
    focus.value = clampTo(focus.value, -1, SECTIONS.length);
    return;
  }
  // The Guide, on the key a desktop keyboard has for it.
  if (event.keyCode === 71) {
    event.preventDefault();
    guide.value = true;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  void apps.load();
  expose();
});

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

function expose(): void {
  (window as typeof window & { xneDebug?: unknown }).xneDebug = { focus, blades, section, guide };
}
</script>

<template>
  <main class="stage" :style="motion">
    <div class="hub">
      <div class="glow" />

      <header class="who">
        <div class="avatar" />
        <div class="id">
          <span class="tag">{{ settings.settings.gamertag || "Player" }}</span>
          <span class="score">G 1250</span>
        </div>
      </header>

      <HubPanel :section="section" :rows="rows" :dimmed="guide" />

      <div class="ribbon">
        <div
          v-for="blade in blades"
          :key="blade.d"
          class="blade"
          :style="bladeStyle(blade)"
          :data-blade="blade.id"
          :data-offset="blade.d"
        >
          <span class="blade-label">{{ blade.section.label }}</span>
        </div>
      </div>

      <PromptBar :prompts="promptsFor({ a: SELECT.label })" :y="640" />

      <GuideOverlay :open="guide" :blade="focus" :items="rows.map((r) => r.title)" />
    </div>
  </main>
</template>

<style scoped>
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
  width: var(--canvas-w);
  height: var(--canvas-h);
  margin: calc(var(--canvas-h) / -2) 0 0 calc(var(--canvas-w) / -2);
  transform: scale(var(--present)) translateZ(0);
}

/* MEASURED, GuideMain.xui: #0F0F0F at alpha 100 into #81878D at alpha 0. */
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
  top: 40px;
  left: 112px;
  display: flex;
  gap: 14px;
  align-items: center;
}

.avatar {
  width: 64px;
  height: 64px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 5px;
  background: linear-gradient(160deg, #4a4f57, #22262b);
}

.id {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tag {
  font-size: 20px;
  font-weight: 700;
}

.score {
  font-size: 13px;
  color: #9aa4ad;
}

.ribbon {
  position: absolute;
  inset: 0;
}

/*
 * Blades move, so they are promoted: a transform on an unpromoted box repaints it
 * every frame. The layer exists at rest and only its transform changes, which is
 * what keeps a move from allocating.
 */
.blade {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 5px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.16), rgba(0, 0, 0, 0.3));
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4);
  will-change: transform;
  transform-origin: 0 0;
  transition: transform var(--move-ms) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.blade-label {
  position: absolute;
  bottom: 10px;
  left: 0;
  width: 100%;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  color: rgba(255, 255, 255, 0.85);
}

@media (prefers-reduced-motion: reduce) {
  .blade {
    transition: none;
  }
}
</style>
