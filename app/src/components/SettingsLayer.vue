<script setup lang="ts" vapor>
import { computed, nextTick, ref, watch } from "vue";

import {
  DRILL_EASE_IN,
  DRILL_EASE_OUT,
  DRILL_MS,
  HUB_PANEL_BOX,
  pageRest,
  type Page,
  type PageFocus,
} from "../pages";
import { PARKED, useParked } from "../parked";
import type { Box } from "../ribbon";
import { SETTINGS_ROWS, settingsWindow, type SettingDetail } from "../settingsScreen";

/**
 * The dashboard's settings screen, in the layout of the retail settings
 * screens: the title over the sky at the top left, one dark panel with the
 * option list down its left and the focused row's detail down its right.
 *
 * Two surfaces, both mounted before the screen is opened and both resting at
 * `opacity: 0.001`. The panel is authored at its open box and transformed onto
 * the pane it grows from, so opening changes one transform and one opacity on a
 * layer that already exists; its texture is the panel and nothing else. The
 * title is a small layer of its own that only fades. Every box inside the panel
 * is static paint on that one surface.
 */

const props = defineProps<{
  page: Page;
  focus: PageFocus;
  open: boolean;
  detail: SettingDetail;
  /** The box a closed panel rests on, in the frame's 720p pixels. */
  rest?: Box;
  /** A value being typed in the detail column, with the TV's keyboard, or null. */
  draft?: string | null;
}>();

const emit = defineEmits<{
  commit: [value: string];
  cancel: [];
}>();

const entry = ref<HTMLInputElement>();

watch(
  () => props.draft ?? null,
  (draft, before) => {
    if (draft === null || before !== null) return;
    void nextTick(() => {
      entry.value?.focus();
      entry.value?.select();
    });
  },
);

/** Enter keeps the value; Escape and the remote's Back throw it away. */
function onEntryKey(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.keyCode === 13) {
    event.preventDefault();
    emit("commit", (event.target as HTMLInputElement).value.trim());
  } else if (event.keyCode === 27 || event.keyCode === 461) {
    event.preventDefault();
    emit("cancel");
  }
}

/** The retail panel, measured off the 1280x720 settings frames. */
const PANEL: Box = { x: 196, y: 111, width: 889, height: 481 };

const parked = useParked(() => props.open, DRILL_MS);

const rest = computed(() => pageRest(props.rest ?? HUB_PANEL_BOX, PANEL));

const panelStyle = computed((): Record<string, string> => {
  const at = rest.value;
  return {
    "--drill-ms": `${DRILL_MS}ms`,
    "--drill-in": DRILL_EASE_IN,
    "--drill-out": DRILL_EASE_OUT,
    left: `${PANEL.x}px`,
    top: `${PANEL.y}px`,
    width: `${PANEL.width}px`,
    height: `${PANEL.height}px`,
    transformOrigin: `${at.originX}px ${at.originY}px`,
    transform: props.open
      ? "translate3d(0, 0, 0) scale(1, 1)"
      : `translate3d(${at.dx}px, ${at.dy}px, 0) scale(${at.scaleX}, ${at.scaleY})`,
  };
});

const titleStyle = {
  "--drill-ms": `${DRILL_MS}ms`,
  "--drill-out": DRILL_EASE_OUT,
};

interface Slot {
  readonly index: number;
  readonly label: string;
  readonly icon: string;
  readonly focused: boolean;
  readonly y: number;
}

const ROW_PITCH = 45;

const items = computed(() =>
  props.page.kind === "list" ? (props.page.groups[props.focus.group]?.items ?? []) : [],
);

const slots = computed((): Slot[] => {
  const list = items.value;
  const first = settingsWindow(list.length, props.focus.item);
  return Array.from({ length: SETTINGS_ROWS }, (_, slot) => {
    const index = first + slot;
    const item = list[index];
    return {
      index,
      label: item?.label ?? "",
      icon: item?.icon ?? "",
      focused: item !== undefined && index === props.focus.item,
      y: slot * ROW_PITCH,
    };
  });
});

const withIcons = computed(() => items.value.some((item) => item.icon !== undefined));
</script>

<template>
  <div
    class="settings"
    :data-page="page.id"
    :data-open="open || undefined"
    :style="{ transform: parked ? PARKED : 'none' }"
  >
    <span class="title" :style="titleStyle">{{ page.title }}</span>

    <div class="panel" :style="panelStyle">
      <div class="list" :data-icons="withIcons || undefined">
        <div
          v-for="slot in slots"
          :key="slot.index"
          class="row"
          :data-focused="slot.focused || undefined"
          :data-empty="slot.label === '' || undefined"
          :style="{ top: `${slot.y}px` }"
        >
          <span class="bar" />
          <img v-if="slot.icon" class="icon" :src="slot.icon" alt="" />
          <span class="label">{{ slot.label }}</span>
        </div>
      </div>

      <div class="detail">
        <span v-if="detail.values.length > 0" class="current">Current Setting</span>
        <input
          v-if="draft != null"
          ref="entry"
          class="entry"
          maxlength="15"
          :value="draft"
          @keydown="onEntryKey"
        />
        <template v-else>
          <span v-for="value in detail.values" :key="value" class="value">{{ value }}</span>
        </template>
        <span class="about" :data-after-values="detail.values.length > 0 || undefined">{{
          detail.description
        }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  color: #fff;
}

.title {
  position: absolute;
  left: 97px;
  top: 46px;
  font-size: 35px;
  letter-spacing: 0.7px;
  line-height: 44px;
  white-space: nowrap;
  text-shadow: 0 2px 3px rgba(0, 0, 0, 0.5);
  opacity: 0.001;
  will-change: transform, opacity;
  transition: opacity var(--drill-ms) var(--drill-out);
}

.settings[data-open] .title {
  opacity: 1;
}

.panel {
  position: absolute;
  z-index: 1;
  box-sizing: border-box;
  border: 1px solid;
  border-color: rgba(150, 178, 188, 0.55) rgba(90, 112, 120, 0.5) rgba(96, 112, 120, 0.9)
    rgba(90, 112, 120, 0.5);
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    #445c68 0%,
    #203843 18%,
    #162b36 39%,
    #091e29 60%,
    #00131f 80%,
    #001421 100%
  );
  opacity: 0.001;
  will-change: transform, opacity;
  transition:
    transform var(--drill-ms) var(--drill-out),
    opacity var(--drill-ms) var(--drill-out);
}

.settings[data-open] .panel {
  opacity: 1;
  transition-timing-function: var(--drill-in);
}

.list {
  position: absolute;
  top: 19px;
  left: 14px;
  width: 423px;
  height: 450px;
}

.list::before {
  content: "";
  position: absolute;
  top: 0;
  left: 5px;
  right: 5px;
  height: 1px;
  background: rgba(255, 255, 255, 0.16);
}

.row {
  position: absolute;
  left: 0;
  width: 100%;
  height: 45px;
  color: #c9d5db;
  font-size: 22px;
  letter-spacing: 0.6px;
  line-height: 45px;
  white-space: nowrap;
}

.row::after {
  content: "";
  position: absolute;
  left: 5px;
  right: 5px;
  bottom: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.16);
}

.row[data-empty]::after {
  content: none;
}

.label {
  position: absolute;
  left: 12px;
  right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list[data-icons] .label {
  left: 62px;
}

.icon {
  position: absolute;
  left: 22px;
  top: 9px;
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.bar {
  position: absolute;
  top: -2px;
  bottom: -1px;
  left: -4px;
  right: -4px;
  border-radius: 4px;
  background:
    radial-gradient(60% 45% at 50% 100%, rgba(214, 255, 150, 0.45), rgba(214, 255, 150, 0)),
    linear-gradient(
      180deg,
      #91c74e 0%,
      #c5dd98 12%,
      #a7d065 23%,
      #8ac140 33%,
      #6fb211 44%,
      #519f00 54%,
      #4c9d00 65%,
      #6ab507 75%,
      #95ce3b 85%,
      #b6e856 96%,
      #8cc440 100%
    );
  box-shadow: inset 0 0 0 1px rgba(196, 238, 120, 0.6);
  opacity: 0;
}

.row[data-focused] {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 40, 0, 0.45);
}

.row[data-focused] .bar {
  opacity: 1;
}

.detail {
  position: absolute;
  top: 21px;
  left: 462px;
  width: 400px;
  display: flex;
  flex-direction: column;
  font-size: 23px;
  letter-spacing: 0.5px;
  line-height: 30px;
}

.current {
  color: #fff;
  font-size: 25px;
}

.value {
  padding-left: 8px;
  color: #eef4f6;
}

.entry {
  width: 360px;
  margin: 2px 0 0 8px;
  padding: 2px 8px;
  border: 0;
  border-radius: 3px;
  outline: 2px solid #8cc218;
  background: #eef4f6;
  color: #1d2328;
  font: inherit;
}

.about {
  padding-left: 8px;
  width: 372px;
  color: #e2eaee;
}

.about[data-after-values] {
  margin-top: 58px;
}

@media (prefers-reduced-motion: reduce) {
  .title,
  .panel {
    transition: none;
  }
}
</style>
