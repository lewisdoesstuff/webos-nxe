/**
 * A drilled page's row of panes: its geometry, pure.
 *
 * Read off retail 9199 `t066` (720p px, about 3px): the focused pane is 458x493
 * at (98, 105), and the row recedes to the right the way the hub's does, each
 * pane's visible right edge, its height over 493 and its vertical centre
 * below. The fourth is the sliver at the frame's right edge, and its right
 * edge is extrapolated. Slots go through `slotAt720` and the pool through
 * `placePool`, so the page recycles its panes exactly as the hub does.
 */

import { HIDDEN, type PaneSlot, px, slotAt720 } from "./hub";

export const PAGE_PANE_W = px(458);
export const PAGE_PANE_H = px(493);
export const PAGE_PANE_X = px(98);
export const PAGE_PANE_Y = px(105);

const PANE_720_W = 458;
const PANE_720_H = 493;

const SPILL_RIGHT = [934, 1203, 1393] as const;
const SPILL_SCALE = [0.832, 0.712, 0.629] as const;
const SPILL_CENTRE_Y = [353, 354.5, 355] as const;

/** One pane gone left, the focus, three receding, one parked waiting. */
export const PAGE_POOL_SIZE = SPILL_RIGHT.length + 3;

const GONE_X = -340;

export function pageSlot(offset: number): PaneSlot {
  if (offset < 0) return slotAt720(GONE_X, 351.5, 1, HIDDEN, 10, PANE_720_H);
  if (offset === 0) return slotAt720(98, 351.5, 1, 1, 10, PANE_720_H);
  const spill = offset - 1;
  if (spill < SPILL_RIGHT.length) {
    const scale = SPILL_SCALE[spill] ?? 0.6;
    const right = SPILL_RIGHT[spill] ?? 1393;
    const centre = SPILL_CENTRE_Y[spill] ?? 355;
    return slotAt720(right - PANE_720_W * scale, centre, scale, 1, 9 - spill, PANE_720_H);
  }
  return slotAt720(1420, 355, 0.55, HIDDEN, 1, PANE_720_H);
}

/** The page title, top left where the hub's channel list was. MEASURED, t066. */
export const TITLE_X = px(97);
export const TITLE_CENTRE_Y = px(68);

/** The `n of m` counter under the focused pane. MEASURED, t066. */
export const PAGE_COUNTER_X = px(97);
export const PAGE_COUNTER_Y = px(608);
