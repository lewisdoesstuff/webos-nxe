/**
 * The hub: its geometry and its navigation, as static numbers and pure
 * functions. No Vue, no DOM, no Luna.
 *
 * Every measured number is a 720p pixel read off retail 9199 running
 * (docs/REFERENCES.md, frames `t048`, `t062`, `t128`) and passes through `px`
 * exactly once. `GuideMain.xui` is the Guide overlay, not the hub, so nothing
 * here comes from it.
 *
 * The navigation is the 2008 dashboard's (NXE-BOOT-INPUT §3): up and down
 * change channel and clamp, left and right move along the channel's row and
 * clamp, a channel change re-homes the row to its first item, and the bumpers
 * page along the row.
 */

/** NXE drew at 1280x720 and the app authors at 1920x1080. */
export function px(value: number): number {
  return Math.round(value * 1.5);
}

/** A rendered rectangle. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Five channels, one per section. */
export const CHANNEL_COUNT = 5;

/**
 * The focused pane: 420x320 at 97,248. Every pane is this box; the spill is
 * the same box scaled down, so no layer resizes when the focus moves.
 * MEASURED, and the size three independent recreations use.
 */
export const PANE_W = px(420);
export const PANE_H = px(320);
export const PANE_X = px(97);
export const PANE_Y = px(248);

/** How far the bumpers page along the row. CHOSEN: one spill's worth. */
export const PAGE_STEP = 5;

/**
 * A pane's place in the row, as the transform its fixed box is drawn with:
 * translated to `x, y` and scaled about its top-left corner.
 */
export interface PaneSlot {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
  readonly z: number;
}

/**
 * The spill, read off `t062`: each pane's visible right edge, its height
 * over 320, and its vertical centre, which rises toward the horizon. The fifth
 * is the sliver past the frame's right edge. MEASURED to about 3px, except the
 * fifth, which is extrapolated.
 */
const SPILL_RIGHT = [827, 1012, 1134, 1222, 1290] as const;
const SPILL_SCALE = [0.744, 0.594, 0.4875, 0.4125, 0.35] as const;
const SPILL_CENTRE_Y = [401, 397, 394, 392, 390] as const;

/**
 * The opacity of anything parked out of sight. Not 0: a promoted layer at 0
 * drops its painted texture, and showing it again re-rasters it mid-move
 * (PERF-STATUS, "0.001 instead of 0").
 */
export const HIDDEN = 0.001;

/** Where a pane that has left the front goes: off the left edge, faded. CHOSEN from `row-048`. */
const GONE_X = -330;

export function slotAt720(
  x: number,
  centreY: number,
  scale: number,
  opacity: number,
  z: number,
  height = 320,
): PaneSlot {
  return {
    x: px(x),
    y: px(centreY - (height * scale) / 2),
    scale,
    opacity,
    z,
  };
}

/** Offsets the pool covers: one pane gone left, the focused pane, the spill, one waiting. */
export const FIRST_OFFSET = -1;
export const LAST_OFFSET = SPILL_RIGHT.length + 1;
export const POOL_SIZE = LAST_OFFSET - FIRST_OFFSET + 1;

/**
 * The slot for a pane `offset` places from the focus. Offsets outside the
 * visible range are parked, invisible, just past the ends, so a pane entering
 * slides in from where it would have been.
 */
export function paneSlot(offset: number): PaneSlot {
  if (offset <= FIRST_OFFSET) return slotAt720(GONE_X, 408, 1, HIDDEN, 10);
  if (offset === 0) return slotAt720(97, 408, 1, 1, 10);
  const spill = offset - 1;
  if (spill < SPILL_RIGHT.length) {
    const scale = SPILL_SCALE[spill] ?? 0.35;
    const right = SPILL_RIGHT[spill] ?? 1290;
    const centre = SPILL_CENTRE_Y[spill] ?? 390;
    return slotAt720(right - 420 * scale, centre, scale, 1, 9 - spill);
  }
  return slotAt720(1330, 390, 0.3, HIDDEN, 1);
}

/** A pooled pane element and the row item it currently shows, or null. */
export interface PooledPane {
  readonly element: number;
  readonly item: number | null;
  readonly offset: number;
  readonly slot: PaneSlot;
}

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/**
 * The fixed pool of pane elements for a row, focused on `focus`.
 *
 * Element `e` always shows the one item in the covered window whose index is
 * `e` modulo the pool size, so a move changes one element's content (the one
 * wrapping from one end to the other, while it is invisible) and every other
 * element only its transform. The pool never grows or shrinks with the row.
 */
export function placePool(
  focus: number,
  count: number,
  slotOf: (offset: number) => PaneSlot = paneSlot,
  size: number = POOL_SIZE,
): readonly PooledPane[] {
  const pool: PooledPane[] = [];
  for (let element = 0; element < size; element++) {
    const first = focus + FIRST_OFFSET;
    const item = first + wrap(element - first, size);
    const offset = item - focus;
    const real = item >= 0 && item < count;
    const slot = slotOf(offset);
    pool.push({
      element,
      item: real ? item : null,
      offset,
      slot: real ? slot : { ...slot, opacity: HIDDEN },
    });
  }
  return pool;
}

/**
 * The channel list, read off `t048`: the selected channel is lowest, largest
 * and brightest, and the ones above it shrink and fade upward. Rows by
 * distance above the selection, as a label's vertical centre, cap height and
 * opacity. MEASURED, the opacities to about a tenth.
 */
const LABEL_CENTRE_Y = [203, 159, 126, 99, 73] as const;
const LABEL_CAP = [30, 22, 16, 13, 12] as const;
const LABEL_ALPHA = [1, 0.72, 0.5, 0.3, 0.15] as const;

/** The label box's left edge and the selected label's cap height, the scale's 1. */
export const LABEL_X = px(97);
export const LABEL_FONT = px(43);
export const LABEL_W = px(560);
export const LABEL_H = px(56);

/** The selection's bullet: a small white square left of the selected label. MEASURED. */
export const BULLET_SIZE = px(7);
export const BULLET_X = px(84);
export const BULLET_Y = px(203) - Math.round(BULLET_SIZE / 2) + px(4);

export interface LabelSlot {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
}

/**
 * A channel label's slot by its distance above the selection. Channels below
 * the selection are hidden at rest, parked just under it so the one that
 * becomes selected rises into place.
 */
export function labelSlot(above: number): LabelSlot {
  if (above < 0) {
    return { x: LABEL_X, y: px(245) - LABEL_H / 2, scale: 0.8, opacity: HIDDEN };
  }
  const index = Math.min(above, LABEL_CENTRE_Y.length - 1);
  const scale = (LABEL_CAP[index] ?? 12) / LABEL_CAP[0];
  return {
    x: LABEL_X,
    y: px(LABEL_CENTRE_Y[index] ?? 73) - LABEL_H / 2,
    scale,
    opacity: above >= LABEL_CENTRE_Y.length ? HIDDEN : (LABEL_ALPHA[index] ?? HIDDEN),
  };
}

/** The `n of m` counter under the focused pane. MEASURED. */
export const COUNTER_X = px(97);
export const COUNTER_Y = px(578);

/** The gamercard, top right: the tag right-aligned to x 1112, a 64x64 picture at 1120,64. MEASURED. */
export const CARD_RIGHT = px(1112);
export const CARD_PIC = px(64);
export const CARD_PIC_X = px(1120);
export const CARD_PIC_Y = px(64);

/**
 * How long a row move takes, and on what curve. 300ms on the scene data's
 * decelerating S-curve, as before; the 9199 capture runs under emulation, so
 * its timing is not evidence.
 */
export const MOVE_MS = 300;
export const MOVE_EASE = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/**
 * A channel change, read off `chan-148`: the row fades out, the new focused
 * pane fades in where the old one was, then the spill deals out to the right
 * from behind it, nearest first. CHOSEN durations in those proportions.
 */
export const CHANNEL_OUT_MS = 150;
export const CHANNEL_IN_MS = 150;
export const DEAL_MS = 320;
export const DEAL_STAGGER_MS = 45;

/** Where hub navigation stands. */
export interface HubState {
  readonly channel: number;
  readonly item: number;
}

export type HubMove = "up" | "down" | "left" | "right" | "pageLeft" | "pageRight";

function clamp(value: number, count: number): number {
  return Math.max(0, Math.min(value, count - 1));
}

/**
 * One navigation step. `counts` is each channel's row length. Up is the
 * channel above in the list, which is the lower index; a channel change puts
 * the row back at its first item. Everything clamps; nothing wraps.
 */
export function stepHub(state: HubState, move: HubMove, counts: readonly number[]): HubState {
  const channels = counts.length;
  const rowLength = counts[state.channel] ?? 0;
  switch (move) {
    case "up":
    case "down": {
      const channel = clamp(state.channel + (move === "up" ? -1 : 1), channels);
      return channel === state.channel ? state : { channel, item: 0 };
    }
    case "left":
    case "right":
    case "pageLeft":
    case "pageRight": {
      const step =
        move === "left" ? -1 : move === "right" ? 1 : move === "pageLeft" ? -PAGE_STEP : PAGE_STEP;
      const item = rowLength === 0 ? 0 : clamp(state.item + step, rowLength);
      return item === state.item ? state : { channel: state.channel, item };
    }
  }
}

/** The counter's text: `3 of 8`, or nothing for an empty row. */
export function counterText(item: number, count: number): string {
  return count > 0 ? `${item + 1} of ${count}` : "";
}
