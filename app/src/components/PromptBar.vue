<script setup lang="ts" vapor>
import { computed } from "vue";

import { BUTTON_SIZE, faceFor, type Prompt } from "../prompts";

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
    /** Draw the Magic Remote's keys instead of the face buttons. */
    remote?: boolean;
  }>(),
  { y: PROMPT_Y, inline: false, remote: false },
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
  const face = faceFor(prompt, props.remote);
  return { "--fill": face.fill, "--ring": face.ring, "--letter": face.glyph };
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
        <span class="letter" :data-remote="remote || undefined">{{
          faceFor(prompt, remote).letter
        }}</span>
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
  background:
    radial-gradient(
      ellipse 70% 40% at 50% 24%,
      rgba(255, 255, 255, 0.3),
      rgba(255, 255, 255, 0) 100%
    ),
    radial-gradient(circle at 50% 42%, var(--fill) 0%, var(--fill) 38%, var(--ring) 100%);
  box-shadow: inset 0 0 0 2px var(--ring, rgba(0, 0, 0, 0.25));
  color: var(--letter, #fff);
}

/* Positioned so the letter paints over the rim, and the rim is its only backdrop. */
.letter {
  position: relative;
  font-size: 15px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}

.letter[data-remote] {
  font-size: 11px;
  letter-spacing: 0;
  top: -0.75px;
  text-shadow: none;
}

.word {
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}
</style>
