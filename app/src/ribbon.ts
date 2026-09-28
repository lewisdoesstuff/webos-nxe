/**
 * The Guide hub ribbon, as static geometry.
 *
 * Pure and framework-free: no Vue, no DOM, no globals, so the layout can be
 * tested on its own. The geometry is in 720p pixels, because NXE drew on a
 * 1280x720 canvas. Provenance for each value is in the comment on it.
 */

/** `RomeRootScene.xui`, NXE-XUI.md section 0. VERIFIED. */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;

/** `GuideMain.xui` `Blade_Center`, NXE-XUI.md section 1. VERIFIED. */
export const PANEL_W = 386;
export const PANEL_H = 235;
export const PANEL_X = 231;

/** Every blade box in NXE-XUI.md section 1 is 70x235. VERIFIED. */
export const BLADE_W = 70;
export const BLADE_H = 235;

/**
 * Every blade's pivot, NXE-XUI.md section 1: 117.5, which is 235/2, the blade's
 * own vertical centre. VERIFIED, and the reason the ramp scales about the
 * mid-height rather than about the top edge.
 */
export const BLADE_Y = 117.5;

/**
 * The delta in x from one blade to the next, in 720p pixels.
 *
 * NXE-XUI.md section 1, VERIFIED for the first three: `Blade2..5` sit at x = 575,
 * 602, 628, 652, so the deltas are 27, 26 and 24. The ramp compresses slightly
 * and the document is explicit that it is not one constant.
 *
 * These are deltas between left edges in the scene file's own absolute
 * positions, not gaps between boxes. Read literally, `Blade2` at x = 575 is 70
 * wide and `Blade3` at 602 sits inside it, so those positions overlap. They
 * cannot be a static layout, which fits the resting slots at x = 234 being placed
 * at runtime.
 *
 * Applied here each delta follows the previous blade's *scaled* right edge, so
 * the rendered ribbon does not overlap. That is a composition rather than a
 * transcription, and what the real dashboard does with these numbers is open.
 *
 * The last two entries are UNVERIFIED. The scene data stops at four blades, so
 * 22 and 21 continue the compression and nothing measures them.
 *
 * Slot 0 is the delta between blade 0 and blade 1, and blade 0 is flush with the
 * panel's right edge, so the applied deltas are slots 1 upwards and the measured
 * 27 is carried but not applied. Reading the table at `d - 1` would apply 27
 * first, but that offsets the whole ribbon from the panel by a delta the scene
 * data places between two blades, which is a different measurement.
 */
export const BLADE_STEP = [27, 26, 24, 22, 21] as const;

/**
 * The scale at each step out from the panel.
 *
 * NXE-XUI.md section 1, VERIFIED for the first four: 0.96, 0.93, 0.90, 0.87,
 * which is exactly -0.03 per step. The fifth entry is DERIVED by continuing that
 * rule, since the scene data ends at 0.87.
 */
export const BLADE_SCALE = [0.96, 0.93, 0.9, 0.87, 0.84] as const;

/**
 * Blades drawn to the right of the panel, which is the length of both ramps, so
 * the count and the tables cannot drift apart.
 *
 * UNVERIFIED: NXE-XUI.md section 1 carries eight label blades, `Blade1` to
 * `Blade8`, of which four are resting slots at x = 234 with no scale and four
 * carry the baked positions and scales of the ramp. Nothing in the scene data
 * says how many of them are on screen at once, so five is the count the two
 * tables above are written to.
 */
export const BLADE_COUNT = BLADE_STEP.length;

/**
 * The move and the per-index cascade, in milliseconds.
 *
 * DERIVED, and not from the scene data. NXE-EXISTING.md section 3.1.3 measures
 * 300 ms on an OutCubic curve with a 50 ms per-index stagger in
 * `pegasus-theme-npe`, which is a recreation rather than the dashboard. NXE-XUI.md
 * section 2.2 puts a blade slide at 359 time units, the most common value in the
 * file, and cannot say whether a unit is a millisecond, so nothing here
 * contradicts it.
 */
export const MOVE_MS = 300;
export const STAGGER_MS = 50;

export interface Blade {
  /** Step out from the panel, 0 being the blade against its right edge. */
  d: number;
  id: string;
  x: number;
  scale: number;
}

/**
 * A tuple of a ramp's length. Mapping over a type parameter is what keeps the
 * result a tuple instead of an object with a `length` of `Blade` in it.
 */
type PerSlot<T extends readonly number[]> = { readonly [K in keyof T]: Blade };

/**
 * One blade per ramp slot, and always all of them.
 *
 * The length is the length of the ramps rather than a count written out, so the
 * type and the code that fills it cannot disagree. A result that grew or shrank
 * with the focus would create a blade element mid-transition, and the compositor
 * would allocate a layer for it inside the move.
 */
export type Ribbon = PerSlot<typeof BLADE_STEP>;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A ramp read out of bounds falls back to its end, so a table cannot run dry. */
function ramp(table: readonly number[], index: number): number {
  return table[Math.min(Math.max(index, 0), table.length - 1)] ?? 0;
}

function wrap(value: number, count: number): number {
  return count <= 0 ? 0 : ((value % count) + count) % count;
}

/**
 * Every blade of the ribbon, one pass outward from the panel.
 *
 * Each blade sits at the previous one.s scaled right edge plus the gap at its own
 * slot, so the ramp is a gap and not a pitch. The gap is read at the blade.s own
 * slot, so slot 0 takes the measured 27 rather than starting one slot late. Geometry does not depend on the focus: a
 * move relabels the blades and changes nothing else, so the boxes on screen are
 * the same before and after it.
 *
 * The list is typed as the ribbon, so its length is the ramps' length and a slot
 * added to a ramp would not compile here rather than come back one short.
 */
export function placeBlades(focus: number, sectionIds: readonly string[]): Ribbon {
  let edge = PANEL_X + PANEL_W;
  const at = (d: number): Blade => {
    const scale = ramp(BLADE_SCALE, d);
    const x = d === 0 ? edge : edge + ramp(BLADE_STEP, d);
    edge = x + BLADE_W * scale;
    return { d, id: sectionIds[wrap(focus + d, sectionIds.length)] ?? "", x, scale };
  };
  return [at(0), at(1), at(2), at(3), at(4)];
}

/**
 * The box a blade occupies once its transform is applied. The ribbon transforms
 * about each blade's own top left, so the scaled width grows to the right of `x`
 * rather than about it.
 */
export function bladeBox(blade: Blade): Box {
  return { x: blade.x, y: BLADE_Y, width: BLADE_W * blade.scale, height: BLADE_H };
}

/**
 * The box of the blade at the focus, which is slot 0. The panel is what changes
 * when the focus moves, so this box does not.
 */
export function focusedBox(ribbon: Ribbon): Box {
  return bladeBox(ribbon[0]);
}

/** The label for a section id, falling back to the id so a slot is never blank. */
export function labelFor(id: string, labels: Readonly<Record<string, string>>): string {
  return labels[id] ?? id;
}
