import { computed, type Ref, ref } from "vue";

import type { HubState, PooledPane } from "../hub";
import { type HubItem, isMovable, moveStep, movableIds } from "../hubRows";
import type { Button } from "../keys";
import { isChannel } from "../sections";
import { playSound } from "../sound";
import { useSettingsStore } from "../stores/settings";

interface MoveDeps {
  readonly rows: Ref<readonly (readonly HubItem[])[]>;
  readonly hub: Ref<HubState>;
  readonly shown: Ref<HubState>;
  readonly pool: Ref<readonly PooledPane[]>;
  readonly pins: Ref<ReadonlyMap<number, number>>;
  /** Whether the row is at rest, outside a channel change. */
  readonly resting: () => boolean;
}

function onHome(channel: number): boolean {
  return isChannel(channel, "home");
}

/**
 * Picking a pane up and moving it along its row: Y picks it up, left and right
 * trade it with its neighbours, A puts it down, B puts the old order back, and
 * X pins it to Home from any other channel.
 */
export function usePaneMove({ rows, hub, shown, pool, pins, resting }: MoveDeps) {
  const settings = useSettingsStore();

  /** The pane being moved along its row, and the order to put back if it is cancelled. */
  const moving = ref<{ readonly channel: number; readonly before: readonly string[] } | null>(null);

  /** Whether Y can pick the focused pane up: a real item, or the profile. */
  const canMove = computed(() => isMovable(rows.value[hub.value.channel]?.[hub.value.item]));

  /** The pane in hand can be pinned to Home from any other channel, and leaves Home from Home. */
  const pinLabel = computed(() => {
    if (moving.value === null || onHome(moving.value.channel)) return null;
    const item = rows.value[moving.value.channel]?.[hub.value.item];
    return item && settings.isAppHome(item.id) ? "Remove from Home" : "Add to Home";
  });

  function writeOrder(channel: number, order: readonly string[], save: boolean): void {
    if (onHome(channel)) settings.setHomeOrder(order, save);
    else settings.setAppOrder(order, save);
  }

  function start(): void {
    const row = rows.value[hub.value.channel] ?? [];
    if (!isMovable(row[hub.value.item]) || !resting()) return;
    moving.value = { channel: hub.value.channel, before: movableIds(row) };
    playSound("option");
  }

  function togglePin(): void {
    const held = moving.value;
    const item = held && rows.value[held.channel]?.[hub.value.item];
    if (!item || onHome(held.channel)) return;
    settings.setAppHome(item.id, !settings.isAppHome(item.id));
    playSound("option");
  }

  /** One step of the moved pane along its row: the order changes and the focus follows the pane. */
  function step(direction: -1 | 1): void {
    const held = moving.value;
    if (held === null) return;
    const row = rows.value[held.channel] ?? [];
    const next = moveStep(row, hub.value.item, direction);
    if (next === null) return;
    const elements = new Map<string, number>();
    for (const pane of pool.value) {
      const id = pane.item === null ? undefined : row[pane.item]?.id;
      if (id !== undefined) elements.set(id, pane.element);
    }
    writeOrder(held.channel, next.order, false);
    const state = { channel: held.channel, item: next.index };
    hub.value = state;
    shown.value = state;
    const moved = new Map<number, number>();
    (rows.value[held.channel] ?? []).forEach((item, index) => {
      const element = elements.get(item.id);
      if (element !== undefined) moved.set(index, element);
    });
    pins.value = moved;
    playSound(direction === 1 ? "panelRight" : "panelLeft");
  }

  function end(keep: boolean): void {
    const held = moving.value;
    if (held === null) return;
    if (keep) {
      settings.persist();
      playSound("select");
    } else {
      const id = rows.value[held.channel]?.[hub.value.item]?.id;
      writeOrder(held.channel, held.before, false);
      const after = rows.value[held.channel] ?? [];
      const item = Math.max(
        0,
        after.findIndex((candidate) => candidate.id === id),
      );
      hub.value = { channel: held.channel, item };
      shown.value = hub.value;
      playSound("back");
    }
    moving.value = null;
  }

  /** A button while a pane is in hand. Every button is the move's while it lasts. */
  function onButton(button: Button | null): void {
    if (button === "left" || button === "right") step(button === "right" ? 1 : -1);
    else if (button === "a") end(true);
    else if (button === "x") togglePin();
    else if (button === "b") end(false);
  }

  return { moving, canMove, pinLabel, start, onButton };
}
