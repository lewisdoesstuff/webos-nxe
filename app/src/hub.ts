/**
 * The hub's geometry, as static numbers and pure placement.
 *
 * Framework-free: no Vue, no DOM, no Luna. Every measured number here is a
 * 720p pixel out of retail build 9199's `GuideMain.xui`, read in NXE-XUI.md
 * section 1a, and every one of them passes through `px` exactly once. The app
 * authors at 1920x1080 and renders 1:1 (docs/PERF.md), so the conversion is
 * arithmetic done in one place rather than a table of hand-multiplied values.
 *
 * Provenance is on each constant: VERIFIED is read out of the scene data,
 * DERIVED is arithmetic on verified numbers, UNVERIFIED is a guess this build
 * has to make because the scene data does not say.
 */

/**
 * The one conversion. NXE drew on a 1280x720 canvas and the app authors at
 * 1920x1080, so every source number is multiplied by 1.5 exactly once. Halves
 * round up, which reproduces the stated 1080p values: a pane is 473x300, the
 * channel column is 122x368, the stage is 1278x720 and the prompts are at
 * y 794. VERIFIED as arithmetic.
 */
export function px(value: number): number {
  return Math.round(value * 1.5);
}

/** The channels: `Tab1` to `Tab5` and five label pairs. VERIFIED. */
export const CHANNEL_COUNT = 5;

/** `Tabscene` is 852x480, two thirds of the canvas on both axes. VERIFIED. */
export const STAGE_W = px(852);
export const STAGE_H = px(480);

/**
 * `SelBlade` is 81x245 at 227,117: the channel column, left of the panes. It
 * animates only `Opacity` and `Show`, so it never moves. VERIFIED.
 */
export const COLUMN_X = px(227);
export const COLUMN_Y = px(117);
export const COLUMN_W = px(81);
export const COLUMN_H = px(245);

/**
 * The column's row pitch: the column's height over its five channels, so the
 * rows fill it exactly. DERIVED.
 */
export const ROW_H = COLUMN_H / CHANNEL_COUNT;

/**
 * A pane is a `Tab` scene: 315x200. The pane's own box never changes; the
 * focused pane is reached by scaling it up, so no layer resizes when the
 * selection moves. VERIFIED.
 */
export const PANE_W = px(315);
export const PANE_H = px(200);

/**
 * `Blade_Center` is 386x235 at 231,122: the focused pane. Its box is what the
 * focused pane scales onto, so "larger than the rest" is a measured size and
 * not a picked one. VERIFIED.
 */
export const FOCUSED_W = px(386);
export const FOCUSED_H = px(235);
export const FOCUSED_X = px(231);
export const FOCUSED_Y = px(122);

/**
 * `Blade2` to `Blade5` at 575,602,628,652, scale 0.96, 0.93, 0.90, 0.87: the
 * focused pane's recession, and the ramp a pane walks as the selection
 * changes. The x deltas are 27, 26, 24, so the ramp compresses slightly and is
 * not one constant. VERIFIED.
 */
export const SPILL_X = [px(575), px(602), px(628), px(652)] as const;
export const SPILL_SCALE = [0.96, 0.93, 0.9, 0.87] as const;

/**
 * A channel label is a 212x21 box pivoted at its own centre (106, 10.5), and
 * the selected one sits at x 152 with no scale. VERIFIED.
 */
export const LABEL_W = px(212);
export const LABEL_H = px(21);
export const LABEL_X = px(152);

/**
 * The label ramp: 1 at the selection, then 0.96, 0.93, 0.90, 0.87 by distance.
 * The four shrink values are the unselected labels' own scales in the scene
 * data, and 1 is what the selected labels carry there. VERIFIED.
 */
export const LABEL_RAMP = [1, 0.96, 0.93, 0.9, 0.87] as const;

/**
 * The scene data keeps the unselected labels in one horizontal cascade at x
 * 512, 539, 563, 588 and y 226.5, with the selected ones 360px to their left.
 * VERIFIED. This build puts the labels in the channel column instead, at the
 * measured selected x and the measured ramp, because the hub is a column of
 * five fixed channels and a row of panes; the cascade is carried here so the
 * source's arrangement is not lost.
 */
export const LABEL_CASCADE_X = [px(512), px(539), px(563), px(588)] as const;

/**
 * `SelBlade`'s own figures: two 23x23 caps at its top left and bottom left with
 * a 9x199 spine between them. A fourth figure sits at x 23 with height 211 and
 * no width in the file, so it is left out rather than invented. VERIFIED.
 */
export const RAIL_CAP = px(23);
export const RAIL_SPINE_X = px(14);
export const RAIL_SPINE_Y = px(23);
export const RAIL_SPINE_W = px(9);
export const RAIL_SPINE_H = px(199);
export const RAIL_BOTTOM_Y = px(222);

/** `SelBlade` rests at 0.4 and fades between 0 and 0.4. It never moves. VERIFIED. */
export const RAIL_ALPHA = 0.4;

/** The rail's figures, in the column's own coordinates. */
export function railFigures(): readonly Box[] {
  return [
    { x: 0, y: 0, width: RAIL_CAP, height: RAIL_CAP },
    { x: RAIL_SPINE_X, y: RAIL_SPINE_Y, width: RAIL_SPINE_W, height: RAIL_SPINE_H },
    { x: 0, y: RAIL_BOTTOM_Y, width: RAIL_CAP, height: RAIL_CAP },
  ];
}

/** `btnB`'s own y: 529, the prompt row's measured height. VERIFIED. */
export const PROMPT_Y = px(529);

/**
 * The same height in the 720p frame's own units, for the frame furniture that
 * is authored in them (`PromptBar`, the Guide) and scaled to 1080p by one
 * transform. VERIFIED as the same measurement as `PROMPT_Y`.
 */
export const PROMPT_Y_FRAME = 529;

/** `btnB` is 422x40, so the prompt row is 40 tall. VERIFIED as a height. */
export const PROMPT_ROW_H = px(40);

/**
 * How long a channel move takes, and on what curve.
 *
 * DERIVED, and not from the scene data: NXE-XUI.md section 2.2 puts a slide at
 * 359 time units and cannot say what a unit is, while NXE-EXISTING.md section
 * 3.1.3 measures 300 ms on an OutCubic curve in `pegasus-theme-npe`, which is a
 * recreation rather than the dashboard. The curve is the scene data's own
 * decelerating family (EaseIn -100, EaseOut 100, EaseScale 50, 251 of the 275
 * eased keyframes), transcribed the way `pages.ts` transcribes it. Every blade
 * in a row moves in the same keyframe window, so there is no per-slot stagger.
 */
export const MOVE_MS = 300;
export const MOVE_EASE = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/** A rendered rectangle. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * An element's box and the transform it is drawn with.
 *
 * The box is the element's own CSS box and never changes: the compositor
 * allocates a layer from it and a transform does not move the allocation
 * (docs/PERF.md). `pivotX` is the transform origin as a fraction of the width,
 * because the panes scale about their left edge (the blades' pivot is 0,
 * 117.5) and the labels scale about their own centre (their pivot is 106,
 * 10.5). Both pivots are VERIFIED.
 */
export interface Slot extends Box {
  scaleX: number;
  scaleY: number;
  pivotX: number;
}

/**
 * The box a slot covers once its transform is applied, which is what a person
 * sees and what the test asserts against.
 */
export function renderedBox(slot: Slot): Box {
  return {
    x: slot.x + slot.width * (1 - slot.scaleX) * slot.pivotX,
    y: slot.y + (slot.height * (1 - slot.scaleY)) / 2,
    width: slot.width * slot.scaleX,
    height: slot.height * slot.scaleY,
  };
}

/**
 * Where a pane's own box sits so that scaling it about its left edge, halfway
 * down, lands on the focused pane's measured band. The focused pane scales
 * onto `Blade_Center` exactly; the rest step down the recession ramp. DERIVED
 * from the two measured boxes.
 */
const PANE_Y = FOCUSED_Y + (FOCUSED_H - PANE_H) / 2;

function paneSlot(x: number, scaleX: number, scaleY: number): Slot {
  return { x, y: PANE_Y, width: PANE_W, height: PANE_H, scaleX, scaleY, pivotX: 0 };
}

/**
 * The five pane slots: the focused box, then the recession ramp. Fixed, so a
 * move is five transform writes on boxes that were already there.
 */
export function paneSlots(): readonly [Slot, Slot, Slot, Slot, Slot] {
  return [
    paneSlot(FOCUSED_X, FOCUSED_W / PANE_W, FOCUSED_H / PANE_H),
    paneSlot(SPILL_X[0], SPILL_SCALE[0], SPILL_SCALE[0]),
    paneSlot(SPILL_X[1], SPILL_SCALE[1], SPILL_SCALE[1]),
    paneSlot(SPILL_X[2], SPILL_SCALE[2], SPILL_SCALE[2]),
    paneSlot(SPILL_X[3], SPILL_SCALE[3], SPILL_SCALE[3]),
  ];
}

export interface Pane {
  readonly id: string;
  readonly slot: Slot;
  readonly focused: boolean;
}

/** A tuple of the channel count, so the pane count cannot drift with the data. */
export type Panes = readonly [Pane, Pane, Pane, Pane, Pane];

function wrap(value: number, count: number): number {
  return count <= 0 ? 0 : ((value % count) + count) % count;
}

/**
 * Every pane, with its channel's id on it and its slot from the fixed set.
 *
 * The geometry is the same for every focus: only which channel sits in which
 * slot moves. A pane is therefore created once and transformed ever after, and
 * the row is a tuple so it cannot grow or shrink with the section list.
 */
export function placePanes(focus: number, sectionIds: readonly string[]): Panes {
  const slots = paneSlots();
  const at = (d: number): Pane => {
    const id = sectionIds[wrap(focus + d, sectionIds.length)] ?? "";
    return { id, slot: slots[d] ?? slots[0], focused: d === 0 };
  };
  return [at(0), at(1), at(2), at(3), at(4)];
}

export interface Label {
  readonly id: string;
  /** The column row the channel always sits in, whatever the focus is. */
  readonly row: number;
  readonly slot: Slot;
  readonly selected: boolean;
}

export type Labels = readonly [Label, Label, Label, Label, Label];

function labelSlot(row: number, scale: number): Slot {
  return {
    x: LABEL_X,
    y: COLUMN_Y + row * ROW_H + (ROW_H - LABEL_H) / 2,
    width: LABEL_W,
    height: LABEL_H,
    scaleX: scale,
    scaleY: scale,
    pivotX: 0.5,
  };
}

/**
 * The channel labels: one per channel, in its own row, scaled down the
 * measured ramp by distance from the selection.
 *
 * The box is always at the measured selected x and scales about its own
 * centre, which is the pivot the scene data gives every label. So a label that
 * becomes selected stops scaling and its text ends up furthest left, which is
 * what the measured pair of families does: the selected labels sit at x 152 at
 * full size and the rest recede from there.
 */
export function placeLabels(focus: number, sectionIds: readonly string[]): Labels {
  const at = (row: number): Label => {
    const count = sectionIds.length;
    const forward = wrap(row - focus, count);
    const distance = Math.min(forward, wrap(focus - row, count));
    const scale = LABEL_RAMP[Math.min(distance, LABEL_RAMP.length - 1)] ?? 1;
    return {
      id: sectionIds[row] ?? "",
      row,
      slot: labelSlot(row, scale),
      selected: distance === 0,
    };
  };
  return [at(0), at(1), at(2), at(3), at(4)];
}
