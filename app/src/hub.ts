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

/** Seven channels, one per section. */
export const CHANNEL_COUNT = 7;

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
 * The launch hub's card line, from `controlp/Variables.xur` in dash.xex 7357
 * (docs/research/HUB-ENGINE.md). Cards stand on a line in 3D from
 * `MobyFrontPosition` toward `MobyBackPosition`, `MobyDefaultSpacing` apart
 * along it, anchored at their bottom-left corner. VERIFIED from the scene,
 * which puts the front at 96,570; the line is moved 1px right and 2px up so
 * the focused card lands on the box measured off `t062`.
 */
const MOBY_FRONT = [97, 568, 0] as const;
const MOBY_BACK = [1185, 588, 1000] as const;
const MOBY_SPACING = 505;

/**
 * The camera the line is seen through, in 720p pixels. FITTED: a focal length
 * and centre that put cards 1 to 4 within 2px of the edges, scales and centres
 * measured off `t062`. The fit is to the measured frame, the line it projects
 * is retail's.
 */
const CAMERA_FOCAL = 982;
const CAMERA_X = 657;
const CAMERA_Y = 362;

const MOBY_LENGTH = Math.hypot(
  MOBY_BACK[0] - MOBY_FRONT[0],
  MOBY_BACK[1] - MOBY_FRONT[1],
  MOBY_BACK[2] - MOBY_FRONT[2],
);
const MOBY_STEP = MOBY_FRONT.map(
  (front, axis) => ((MOBY_BACK[axis]! - front) / MOBY_LENGTH) * MOBY_SPACING,
);

/** Where a card `offset` places along the line projects to, as its 720p left edge, bottom and scale. */
export function projectCard(offset: number): { left: number; bottom: number; scale: number } {
  const [x, y, z] = MOBY_FRONT.map((front, axis) => front + MOBY_STEP[axis]! * offset) as [
    number,
    number,
    number,
  ];
  const scale = CAMERA_FOCAL / (CAMERA_FOCAL + z);
  return {
    left: CAMERA_X + (x - CAMERA_X) * scale,
    bottom: CAMERA_Y + (y - CAMERA_Y) * scale,
    scale,
  };
}

/** How many cards stand to the right of the focused one. The sixth is past the frame's edge. */
const SPILL_COUNT = 5;

/**
 * The opacity of anything parked out of sight. Not 0: a promoted layer at 0
 * drops its painted texture, and showing it again re-rasters it mid-move
 * (PERF-STATUS, "0.001 instead of 0").
 */
export const HIDDEN = 0.001;

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
export const LAST_OFFSET = SPILL_COUNT + 1;
export const POOL_SIZE = LAST_OFFSET - FIRST_OFFSET + 1;

/**
 * The slot for a pane `offset` places from the focus. Offsets outside the
 * visible range are parked, invisible, just past the ends, so a pane entering
 * slides in from where it would have been.
 */
export function paneSlot(offset: number): PaneSlot {
  const at = Math.max(FIRST_OFFSET, Math.min(offset, LAST_OFFSET));
  const card = projectCard(at);
  const scale = Math.min(card.scale, 1);
  const bottom = at < 0 ? projectCard(0).bottom : card.bottom;
  const parked = at === FIRST_OFFSET || at === LAST_OFFSET;
  return {
    x: Math.round(card.left * 1.5),
    y: Math.round((bottom - 320 * scale) * 1.5),
    scale,
    opacity: parked ? HIDDEN : 1,
    z: 10 - Math.max(0, at),
  };
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
  pins: ReadonlyMap<number, number> = NO_PINS,
): readonly PooledPane[] {
  const first = focus + FIRST_OFFSET;
  const elementOf = pinnedElements(first, size, pins);
  const pool: PooledPane[] = [];
  for (let element = 0; element < size; element++) {
    const item = first + elementOf.indexOf(element);
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

const NO_PINS: ReadonlyMap<number, number> = new Map();

/**
 * The pins after the focus moves so the window starts at `newFirst` instead of
 * `first`: items that stay in the window keep their element, and each item that
 * enters takes the element of one that left, the way the modulo rule does. Every
 * window place is pinned, so the assignment survives however the row was
 * reordered.
 */
export function advancePins(
  pins: ReadonlyMap<number, number>,
  first: number,
  newFirst: number,
  size: number = POOL_SIZE,
): ReadonlyMap<number, number> {
  const before = pinnedElements(first, size, pins);
  const next = new Map<number, number>();
  const free: number[] = [];
  for (let place = 0; place < size; place++) {
    const item = first + place;
    const element = before[place] ?? wrap(item, size);
    if (item >= newFirst && item < newFirst + size) next.set(item, element);
    else free.push(element);
  }
  for (let place = 0; place < size; place++) {
    const item = newFirst + place;
    if (!next.has(item)) next.set(item, free.shift() ?? wrap(item, size));
  }
  return next;
}

/**
 * The element of each item in the window starting at `first`, by window place.
 *
 * A pin keeps an item on the element it already drew on when a reorder moves its
 * index, so the pane slides rather than being repainted. A pin is honoured only
 * while every element in the window is claimed exactly once, and otherwise the
 * whole window falls back to the modulo rule.
 */
function pinnedElements(first: number, size: number, pins: ReadonlyMap<number, number>): number[] {
  const byIndex = Array.from({ length: size }, (_, place) => {
    const item = first + place;
    return pins.get(item) ?? wrap(item, size);
  });
  if (new Set(byIndex).size !== size) {
    return Array.from({ length: size }, (_, place) => wrap(first + place, size));
  }
  return byIndex;
}

/**
 * The channel list, read off `t048`: the selected channel is lowest, largest
 * and brightest, and the ones above it shrink and fade upward. Rows by
 * distance above the selection, as a label's vertical centre, cap height and
 * opacity. MEASURED, the opacities to about a tenth.
 */
const LABEL_CENTRE_Y = [203, 159, 126, 99, 73, 52] as const;
const LABEL_CAP = [30, 22, 16, 13, 12, 11] as const;
const LABEL_ALPHA = [1, 0.72, 0.5, 0.3, 0.15, 0.08] as const;

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
 * How long a row move takes, and on what curve. Retail moves the row with a
 * spring (`MobyPanelInputAcceleration` 40, `Deceleration` 30, `MaxVelocity` 20,
 * run 1.75 times fast while moving; HUB-ENGINE.md), which settles one card in
 * 12 frames at 60fps. The curve is the least-squares fit to that spring's
 * track. The 1080p capture measured the same move at about 225ms.
 */
export const MOVE_MS = 200;
export const MOVE_EASE = "cubic-bezier(0.35, 0.1, 0.45, 0.85)";

/**
 * A channel change, MEASURED at 60fps off the 1080p capture (7:29.1): the row
 * fades out in about 70ms, the screen holds empty for two frames, and the new
 * focused pane fades in where the old one was over 150ms. The spill then deals
 * out on retail's own unfold (`hubMotion.ts`).
 */
export const CHANNEL_OUT_MS = 70;
export const CHANNEL_IN_MS = 150;

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

/**
 * Where the avatar stands for its pane, as the transform its fixed canvas is
 * drawn with. Retail's avatar is a 3D figure beside the profile pane rather
 * than art on it, so it does not scale rigidly with the pane: focused (`t122`)
 * it stands full size in front of the pane's right half with its feet on the
 * floor below it; in the spill (`t062`) it stands at the pane's right edge,
 * smaller against the pane than the pane is against the focused one. Between
 * the two, mid-move, the anchor blends with the pane's place along the line. Each
 * anchor is the figure's centre and feet in the pane's own 1080p box, and its
 * size over the pane's. MEASURED to a few pixels off those two frames.
 */
const AVATAR_FOCUSED = { centre: px(298), feet: px(392), size: 1 } as const;
const AVATAR_SPILL = { centre: px(370), feet: px(358), size: 0.871 } as const;

/** The figure's centre and feet in its own canvas, which `avatar/framing.ts` sets. */
export interface AvatarCanvas {
  readonly centre: number;
  readonly feet: number;
}

/** A friend's figure stands just past the focused pane's right edge, so the picture on the pane stays clear. */
export const AVATAR_FRIEND = { centre: px(452), feet: px(392), size: 1 } as const;

export function avatarPlace(
  pane: { readonly x: number; readonly y: number; readonly scale: number },
  offset: number,
  canvas: AvatarCanvas,
  friend = false,
): { x: number; y: number; scale: number } {
  const mix = friend ? 0 : Math.max(0, Math.min(1, offset));
  const near = friend ? AVATAR_FRIEND : AVATAR_FOCUSED;
  const centre = near.centre + (AVATAR_SPILL.centre - near.centre) * mix;
  const feet = near.feet + (AVATAR_SPILL.feet - near.feet) * mix;
  const scale = pane.scale * (near.size + (AVATAR_SPILL.size - near.size) * mix);
  return {
    x: pane.x + pane.scale * centre - scale * canvas.centre,
    y: pane.y + pane.scale * feet - scale * canvas.feet,
    scale,
  };
}
