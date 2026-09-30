<script setup lang="ts" vapor>
import { DRILL_EASE_IN, DRILL_EASE_OUT, DRILL_MS } from "../pages";
import type { FriendCard } from "../steam/card";

/**
 * A friend's gamercard and the Interact menu beside it, from the walkthrough's
 * `t1022` (REFERENCES.md): a slate panel with a gold gamertag bar, the picture
 * and three labelled rows, a darker block for the game and a last-online line,
 * and the menu in a lighter slate panel to its right, a little lower.
 *
 * Authored at 720p, the frame's own numbers, inside the shell's scaled frame. Mounted before it
 * is opened and resting at `opacity: 0.001`, so opening changes one opacity.
 */

defineProps<{
  card: FriendCard | null;
  focus: number;
  open: boolean;
}>();
</script>

<template>
  <div
    class="friend"
    :data-open="open || undefined"
    :style="{
      '--drill-ms': `${DRILL_MS}ms`,
      '--drill-in': DRILL_EASE_IN,
      '--drill-out': DRILL_EASE_OUT,
    }"
  >
    <div class="gamercard">
      <div class="bar">
        <span class="name">{{ card?.name }}</span>
      </div>
      <div class="stats">
        <img v-if="card?.avatar" class="pic" :src="card.avatar" alt="" />
        <div v-for="(row, index) in card?.rows ?? []" :key="row[0]" class="stat" :data-row="index">
          <span class="label">{{ row[0] }}</span>
          <span class="value">{{ row[1] }}</span>
        </div>
      </div>
      <div class="lower">
        <template v-if="card?.gameArt">
          <img
            class="game"
            :src="card.gameArt"
            alt=""
            @error="($event.target as HTMLElement).style.display = 'none'"
          />
          <span class="game-name">{{ card.gameName }}</span>
        </template>
        <span class="footer">{{ card?.footer }}</span>
      </div>
    </div>

    <div class="interact">
      <span class="head">Interact</span>
      <div
        v-for="(item, index) in card?.items ?? []"
        :key="item"
        class="item"
        :data-focused="index === focus || undefined"
        :style="{ top: `${57 + index * 37}px` }"
      >
        <span class="hilite" />
        <span class="text">{{ item }}</span>
      </div>
    </div>
    <span class="count">1 of 2</span>
  </div>
</template>

<style scoped>
.friend {
  position: absolute;
  inset: 0;
  color: #fff;
  opacity: 0.001;
  pointer-events: none;
  will-change: opacity;
  transition: opacity var(--drill-ms) var(--drill-out);
}

.friend[data-open] {
  opacity: 1;
  transition-timing-function: var(--drill-in);
}

.gamercard {
  position: absolute;
  left: 94px;
  top: 95.3px;
  width: 453.3px;
  height: 482px;
  box-sizing: border-box;
  border: 0.7px solid;
  border-color: rgba(150, 178, 188, 0.5) rgba(90, 112, 120, 0.45) rgba(96, 112, 120, 0.8)
    rgba(90, 112, 120, 0.45);
  border-radius: 2px;
  background: linear-gradient(180deg, #3d5666 0%, #2a404e 30%, #1f3441 70%, #1b2f3c 100%);
}

.bar {
  position: absolute;
  left: 20px;
  top: 25.3px;
  width: 410px;
  height: 35.3px;
  border-radius: 3.3px;
  background: linear-gradient(180deg, #f1c83a 0%, #e0ac23 45%, #c7921a 100%);
  box-shadow: inset 0 0 0 0.7px rgba(255, 230, 140, 0.45);
}

.name {
  position: absolute;
  left: 10px;
  right: 33.3px;
  top: 0;
  overflow: hidden;
  font-size: 26px;
  line-height: 35.3px;
  letter-spacing: 0.3px;
  text-overflow: ellipsis;
  text-shadow: 0 0.7px 1.3px rgba(80, 50, 0, 0.6);
  white-space: nowrap;
}

.stats {
  position: absolute;
  left: 20px;
  top: 60.7px;
  width: 410px;
  height: 86.7px;
  background: rgba(10, 30, 45, 0.28);
}

.pic {
  position: absolute;
  left: 14.7px;
  top: 8px;
  width: 64.7px;
  height: 64.7px;
  object-fit: cover;
}

.stat {
  position: absolute;
  left: 90px;
  right: 12px;
  height: 24px;
  font-size: 22px;
  line-height: 24px;
  white-space: nowrap;
}

.stat[data-row="0"] {
  top: 5.3px;
}

.stat[data-row="1"] {
  top: 31.3px;
}

.stat[data-row="2"] {
  top: 57.3px;
}

.value {
  position: absolute;
  right: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lower {
  position: absolute;
  left: 20px;
  top: 154.7px;
  width: 410px;
  height: 300px;
  background: linear-gradient(180deg, rgba(7, 22, 36, 0.78), rgba(9, 27, 42, 0.62));
}

.game {
  position: absolute;
  left: 13.3px;
  top: 17.3px;
  width: 112px;
  height: 42px;
  object-fit: cover;
}

.game-name {
  position: absolute;
  left: 13.3px;
  top: 65.3px;
  max-width: 373.3px;
  overflow: hidden;
  font-size: 22px;
  line-height: 21.3px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer {
  position: absolute;
  left: 25px;
  bottom: 14px;
  font-size: 22px;
  line-height: 21.3px;
}

.interact {
  position: absolute;
  left: 546.7px;
  top: 144px;
  width: 373.3px;
  height: 430px;
  box-sizing: border-box;
  border-radius: 2px;
  background: linear-gradient(180deg, #46606f 0%, #2d4452 35%, #172b38 75%, #101f2a 100%);
  box-shadow: inset 0 0 0 0.7px rgba(150, 178, 188, 0.3);
}

.head {
  position: absolute;
  left: 20px;
  top: 18.7px;
  font-size: 20px;
  line-height: 24px;
}

.item {
  position: absolute;
  left: 12px;
  right: 12px;
  height: 34.7px;
  color: #b6c2c8;
  font-size: 20px;
  line-height: 34.7px;
  letter-spacing: 0.3px;
}

.item::after {
  content: "";
  position: absolute;
  left: 2.7px;
  right: 2.7px;
  bottom: -1.3px;
  height: 0.7px;
  background: rgba(255, 255, 255, 0.2);
}

.text {
  position: absolute;
  left: 9.3px;
}

.hilite {
  position: absolute;
  inset: -1.3px -2.7px -0.7px;
  border-radius: 2.7px;
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
  box-shadow: inset 0 0 0 0.7px rgba(196, 238, 120, 0.6);
  opacity: 0;
}

.item[data-focused] {
  color: #fff;
  text-shadow: 0.7px 0.7px 1.3px rgba(0, 30, 0, 0.7);
}

.item[data-focused] .hilite {
  opacity: 1;
}

.count {
  position: absolute;
  left: 97px;
  top: 578px;
  color: #56626c;
  font-size: 20px;
  line-height: 24px;
}
</style>
