<script setup lang="ts" vapor>
import { computed } from "vue";

import { BUTTON_FILL, BUTTON_RING, BUTTON_SIZE, type Prompt } from "../prompts";

/**
 * The row of `A` / `B` / `X` / `Y` prompts along the foot of a screen.
 *
 * Retail 9199 put the first badge at x 102, y 640 and measured it 22 across,
 * and the captions read left to right in A, B, X, Y order. A prompt whose
 * `label` is null is a disc the dashboard drew with no word beside it, so it
 * renders pale and unlabelled rather than inventing a caption for it.
 *
 * Nothing in here moves, so nothing is promoted: the row adds no layer of its
 * own, and a page changing its prompts repaints whatever holds the row.
 */

/** Left edge of the row, the measured x of the `A` badge. */
const PROMPT_X = 100;

/** Top edge of the discs, the measured y of the `A` badge. */
const PROMPT_Y = 640;

/** A disc with no caption behind it: present, and not doing anything. */
const PALE_FILL = "rgba(255, 255, 255, 0.28)";
const PALE_LETTER = "rgba(255, 255, 255, 0.55)";

const props = withDefaults(
  defineProps<{
    prompts: readonly Prompt[];
    /** Top edge of the discs, in 720p units. */
    y?: number;
    /** Let the parent place the row instead of taking the measured position. */
    inline?: boolean;
  }>(),
  { y: PROMPT_Y, inline: false },
);

const rootStyle = computed((): Record<string, string> => ({
  left: `${PROMPT_X}px`,
  top: `${props.y}px`,
  "--disc": `${BUTTON_SIZE + 4}px`,
}));

/** A prompt with no caption is a pale disc and no word, however it was spelled. */
function bare(prompt: Prompt): boolean {
  return !prompt.label;
}

function promptStyle(prompt: Prompt): Record<string, string> {
  if (bare(prompt)) return { "--fill": PALE_FILL, "--letter": PALE_LETTER };
  return { "--fill": BUTTON_FILL[prompt.button], "--ring": BUTTON_RING[prompt.button] };
}
</script>

<template>
  <div class="prompts" :data-inline="inline || undefined" :style="rootStyle">
    <div
      v-for="prompt in prompts"
      :key="prompt.button"
      class="prompt"
      :data-button="prompt.button"
      :data-bare="bare(prompt) || undefined"
      :style="promptStyle(prompt)"
    >
      <span class="disc">
        <span class="letter">{{ prompt.button.toUpperCase() }}</span>
      </span>
      <span v-if="!bare(prompt)" class="word">{{ prompt.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.prompts {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 20px;
  width: max-content;
  color: #fff;
  font-size: 19px;
  line-height: 1;
}

.prompts[data-inline] {
  position: static;
}

.prompt {
  display: flex;
  align-items: center;
  gap: 9px;
}

.disc {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--disc);
  height: var(--disc);
  border-radius: 50%;
  background: var(--fill);
  color: var(--letter, #fff);
}

/* The darker rim the badge is inset with, at 70% of the disc. */
.disc::before {
  content: "";
  position: absolute;
  inset: 15%;
  border: 1px solid var(--ring);
  border-radius: 50%;
}

.prompt[data-bare] .disc::before {
  content: none;
}

/* Positioned so the letter paints over the rim, and the rim is its only backdrop. */
.letter {
  position: relative;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

.word {
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}
</style>
