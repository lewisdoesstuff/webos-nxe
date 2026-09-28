<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref } from "vue";

import { stepFocus } from "./focus/row";
import { useAppsStore } from "./stores/apps";

/**
 * The Guide hub, authored in the console's own coordinate space.
 *
 * NXE drew at 1280x720. Every number here is a 720p pixel read out of retail
 * build 9199's scene graphs, and the hub is scaled once to fill the panel, so
 * the design resolution and the authoring resolution are the same and there is
 * no conversion table to get wrong.
 *
 * Two things are in the scene file and they are not one thing. `Blade_Center` is
 * 386x235 at x=231 and never moves: it is the panel showing whatever is focused.
 * `Blade2..5` are 70x235 and do move, stepping right by 27, 26, 24 while their
 * scale falls 0.96, 0.93, 0.90, 0.87. The blades are a section list beside a
 * panel, not a carousel of cards that one of them grows into.
 *
 * How the two compose is the one thing the scene file does not settle, because
 * the resting slots are placed at runtime. That needs frames from the real
 * dashboard. Provenance for each number is in `docs/research/NXE-XUI.md`.
 */

const apps = useAppsStore();

/** The hub's canvas, and the factor that takes it to the panel. */
const CANVAS_W = 1280;
const CANVAS_H = 720;
const PRESENT = 1.5;

interface Section {
  id: string;
  label: string;
  tint: string;
  appId?: string;
}

/** `Blade_Center`. */
const PANEL_W = 386;
const PANEL_H = 235;
const PANEL_X = 231;
/** Every blade box is 235 tall, pivoted at its own vertical centre, y=117.5. */
const BLADE_Y = 117.5;

const BLADE_W = 70;
const BLADE_H = 235;
const BLADE_COUNT = 5;
const STEP = [27, 26, 24, 22, 21] as const;
const STEP_SCALE = [0.96, 0.93, 0.9, 0.87, 0.84] as const;

const MOVE_MS = 300;
const STAGGER_MS = 50;

function step(table: readonly number[], i: number): number {
  return table[Math.min(Math.max(i, 0), table.length - 1)] ?? 0;
}

/**
 * Move along the row, clamping at both ends.
 *
 * NXE rows do not wrap. Read off retail 9199: a rightward run goes 3 of 8, 5 of
 * 8, 8 of 8 and then holds at 8 of 8, never stepping to 1, and the small lists
 * behave the same. The drops back to 1 are channel changes, which re-home the
 * row, not a wrap. See NXE-BOOT-INPUT.md section 3.6.
 */
function moveTo(index: number, delta: number): number {
  return stepFocus(index, delta, SECTIONS.length);
}

/**
 * A page the user can see and select.
 *
 * `SECTIONS` is typed as a tuple so the first entry is a `Section` and not a
 * `Section | undefined`, which is what lets the clamped index below stay typed.
 */
const SECTIONS = [
  { id: "games", label: "Games", tint: "#3f6a1f" },
  { id: "media", label: "Movies", tint: "#5a3a6e" },
  { id: "music", label: "Music", tint: "#1f5a6a" },
  { id: "live", label: "Live TV", tint: "#6a5a1f", appId: "com.webos.app.livetv" },
  { id: "store", label: "Store", tint: "#6a3a1f" },
  { id: "library", label: "Library", tint: "#3a3a44" },
  { id: "settings", label: "Settings", tint: "#2a2a32", appId: "launcher-settings" },
] as const satisfies readonly [Section, ...Section[]];

const focus = ref(0);

interface Blade {
  id: string;
  /** Step out from the panel, 0 being the blade against its right edge. */
  d: number;
  x: number;
  scale: number;
}

/**
 * The section at an offset from the focus, wrapping.
 *
 * Always defined, so every blade element exists from the first frame. A version
 * that skipped a blade when none mapped to it had one element fewer at the ends,
 * and moving off the end created another, with a layer allocated mid-transition.
 * The gate caught that.
 */
function sectionAt(offset: number): Section {
  return SECTIONS[(focus.value + offset + SECTIONS.length) % SECTIONS.length] ?? SECTIONS[0];
}

/**
 * One pass outward along the ribbon.
 *
 * Blades are a fixed count and always populated, and a move only changes their
 * transforms. Nothing is created, destroyed or resized, so the compositor has
 * every layer it will need before the key is pressed.
 */
const blades = computed<Blade[]>(() => {
  const placed: Blade[] = [];
  let edge = PANEL_X + PANEL_W;
  for (let i = 0; i < BLADE_COUNT; i += 1) {
    const scale = step(STEP_SCALE, i);
    const width = BLADE_W * scale;
    const x = i === 0 ? edge : edge + step(STEP, i);
    placed.push({ id: sectionAt(i).id, d: i, x, scale });
    edge = x + width;
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

const panel = computed((): Section => SECTIONS[focus.value] ?? SECTIONS[0]);

/** Single source for the move and the canvas, so the stylesheet cannot drift. */
const motion = {
  "--move-ms": `${MOVE_MS}ms`,
  "--stagger-ms": `${STAGGER_MS}ms`,
  "--present": String(PRESENT),
  "--canvas-w": `${CANVAS_W}px`,
  "--canvas-h": `${CANVAS_H}px`,
  "--panel-h": `${PANEL_H}px`,
};

function onKeyDown(event: KeyboardEvent): void {
  const forward = event.keyCode === 39;
  const back = event.keyCode === 37;
  if (!forward && !back) return;
  event.preventDefault();
  focus.value = moveTo(focus.value, forward ? 1 : -1);
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  void apps.load();
  expose();
});

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

/** Readable over CDP, so the TV can be probed without a rebuild. */
function expose(): void {
  (window as typeof window & { xneDebug?: unknown }).xneDebug = { focus, blades, panel };
}
</script>

<template>
  <main class="stage" :style="motion">
    <div class="hub">
      <div class="glow" />

      <header class="who">
        <div class="avatar" />
        <div class="id">
          <span class="tag">Player</span>
          <span class="score">G 1250</span>
        </div>
      </header>

      <div class="ribbon">
        <div class="panel" :data-panel="panel.id">
          <div class="panel-art" :style="{ background: panel.tint }" />
          <div class="panel-copy">
            <span class="panel-label">{{ panel.label }}</span>
            <span class="panel-note">
              Detail plate. The 2008 hub carried a preview here, with the section's own copy beneath
              it.
            </span>
          </div>
        </div>

        <div
          v-for="blade in blades"
          :key="blade.d"
          class="blade"
          :style="bladeStyle(blade)"
          :data-blade="blade.id"
          :data-offset="blade.d"
        >
          <span class="blade-label">{{ blade.id }}</span>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/*
 * The stage is 1920x1080 at `devicePixelRatio: 2` on this TV, so a plane authored
 * at on-screen size rasterises at 3840x2160. Authoring at 1280x720 and scaling by
 * 1.5 leaves the layer's own bounds at 1280x720, which rasterises at 2560x1440.
 * `zoom` does not do this: it scales a box's contents and leaves its bounds
 * alone, and the gate measured the hub still costing 31.6MB with `zoom: 0.5` on it.
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
  width: var(--canvas-w);
  height: var(--canvas-h);
  margin: calc(var(--canvas-h) / -2) 0 0 calc(var(--canvas-w) / -2);
  transform: scale(var(--present)) translateZ(0);
}

/* The hub's own radial, from GuideMain.xui: #0F0F0F at alpha 100 into #81878D at
   alpha 0. The real values, not the greys the recreations picked. */
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
 * The panel is a fixed size at a fixed place, so focusing a different section
 * repaints it and allocates nothing. It is deliberately not promoted: a layer
 * here would be re-rastered on every focus change for no gain, and 386x235 is
 * small enough that a paint costs nothing worth a layer.
 */
.panel {
  position: absolute;
  top: 0;
  left: 231px;
  width: 386px;
  height: var(--panel-h);
  border-radius: 7px;
  box-shadow: 0 12px 23px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.panel-art {
  position: absolute;
  inset: 0;
  background: #3f6a1f;
}

.panel-copy {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  padding: 14px 16px;
}

.panel-label {
  font-size: 22px;
  font-weight: 700;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.55);
}

.panel-note {
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.78);
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
