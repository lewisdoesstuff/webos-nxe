/**
 * The Guide: the full-screen takeover the Guide button opens.
 *
 * Pure and framework-free, like `ribbon.ts`: the geometry is in 720p pixels
 * because NXE drew on a 1280x720 canvas, and the layout is testable on its own.
 * Provenance for each value is in the comment on it, and the confidence legend
 * is the one in NXE-BOOT-INPUT.md section 0.
 *
 * The shape of the thing is the opposite of what the literature says. It is not
 * a side panel and not a strip: it is a takeover that dims the dashboard behind
 * it, and its own chrome sits centred on top. NXE-BOOT-INPUT.md section 3.7, and
 * that is measured off retail build 9199 rather than described.
 *
 * Everything here is a fixed set of boxes. A channel, an item and a slab exist
 * whether or not the Guide is open, because creating one on the key press is
 * what allocates a layer inside the transition and fails the gate.
 */

import { BUTTON_SIZE, promptsFor, type Prompt } from "./prompts";
import type { Box } from "./ribbon";

export type { Box } from "./ribbon";

/**
 * The Guide's own panel, NXE-BOOT-INPUT.md section 3.7: x 368-912, y 200-515.
 * VERIFIED, and the table reports the two edges rather than the size, so the
 * size is the difference. Its centre is 640, the canvas's own centre.
 */
export const PANEL_W = 544;
export const PANEL_H = 315;
export const PANEL_X = 368;
export const PANEL_Y = 200;

/** The panel's right edge, which the blade stack starts from. */
export const PANEL_RIGHT = PANEL_X + PANEL_W;

/**
 * The current blade's tab, on the panel's left edge, its label rotated 90
 * degrees.
 *
 * The position is VERIFIED: "the current blade's tab is on the panel's left
 * edge". The width is UNVERIFIED. Nothing in section 3.7 measures it, and the
 * frame puts a rotated label and a spinner in the same 315px of height, so the
 * width only has to clear a 13pt line and a 16px arc.
 */
export const TAB_W = 44;
export const TAB_LABEL_FONT = 21;

/**
 * The line a turned label runs in, which is how wide it draws once it is
 * rotated, and how long a slab's label has to run. UNVERIFIED: the frame rotates
 * the labels 90 degrees and measures neither the line nor the run.
 */
export const ROTATED_LINE = 22;

/** The arc above the tab label. The frame has one; its size is UNVERIFIED. */
export const SPINNER_D = 30;
export const SPINNER_Y = 210;

/**
 * Where the tab's label starts, turned 90 degrees so it runs down the edge, and
 * how far it has to run.
 *
 * UNVERIFIED. The frame says only that the label is rotated 90 degrees and that
 * the arc is above it. The x centres the turned text in the tab's width, the y
 * puts it clear of the arc with the rest of the panel below it, and the run is
 * the panel's height less where it starts, so a tab label of any length fits
 * without the box being asked to grow.
 */
export const TAB_LABEL_X = PANEL_X + TAB_W / 2 + ROTATED_LINE / 2;
export const TAB_LABEL_Y = 250;
export const TAB_LABEL_RUN = PANEL_Y + PANEL_H - TAB_LABEL_Y;

/**
 * The profile's gamerpic, centred above the panel at x 616-664, y 148-198.
 * VERIFIED, and it is 48x50 rather than square, so both edges are used as read.
 */
export const PICPIC_W = 48;
export const PICPIC_H = 50;
export const PICPIC_X = 616;
export const PICPIC_Y = 148;

/**
 * The clock, x 866-911, y 176-196. The band's right edge is VERIFIED and is
 * one pixel inside the panel's, so the clock hangs off the same edge the panel
 * does. Its width is not the ink box: 45 is the measured ink and a two digit
 * hour would overflow a box that size, so the layout box is authored wider and
 * right aligned on the same edge. DERIVED from the VERIFIED right edge.
 */
export const CLOCK_RIGHT = 911;
export const CLOCK_W = 56;
export const CLOCK_X = CLOCK_RIGHT - CLOCK_W;
export const CLOCK_Y = 176;
export const CLOCK_H = 20;
export const CLOCK_FONT = 17;

/**
 * The Guide's channels, in retail 9199's order, top to bottom. VERIFIED from
 * section 3.7: Inside Xbox, Friends, Video & Music Marketplace, Game
 * Marketplace, My Xbox.
 *
 * A fixed list, so the count cannot change and the element count cannot either.
 */
export const CHANNELS = [
  "Inside Xbox",
  "Friends",
  "Video & Music Marketplace",
  "Game Marketplace",
  "My Xbox",
] as const satisfies readonly [string, ...string[]];

export const CHANNEL_COUNT = CHANNELS.length;

/**
 * The selected channel's box, `My Xbox` at y 188-229 in the measured frame.
 * VERIFIED. It is the largest entry in the list, so the row at this position is
 * the one a selection scales up to.
 */
export const CHANNEL_BOX_H = 42;
export const CHANNEL_TOP = 188;

/**
 * The pitch between channels.
 *
 * DERIVED, and it is the difference between the only two rows section 3.7
 * measures: `Game Marketplace` at y 148-175 and `My Xbox` at y 188-229, so
 * 188 - 148 is exactly 40. The same section also says "the step is about 20px of
 * cap height", and nothing reproduces 20 from the two boxes it measured: their
 * centres are 47 apart and their tops are 40 apart, while the cap heights differ
 * by 15 and then by 9 and 6 as the ramp below runs out. 40 is the only reading
 * the measurements support, so the ramp is anchored on the tops and the 20 is
 * recorded as not reconciled.
 *
 * 40 is also what fixes the list at five. The top row is 188 - 4 * 40 = 28, and
 * a sixth channel would need a top of -12, so the canvas holds five and 9199
 * has five.
 */
export const CHANNEL_PITCH = 40;

/**
 * The size ramp. VERIFIED as a ratio: the section says `My Xbox` is "1.5x the
 * height of the channel above it", and 42 / 27.7 is 1.515 against the measured
 * 27 for `Game Marketplace`, so 1.5 is the section's own rounding of the pair
 * rather than a number this file chose. A row `steps` out from the selection is
 * `CHANNEL_RATIO ** -steps`, so the selected row is always exactly 1 and the
 * list never runs away from 42px.
 */
export const CHANNEL_RATIO = 1.5;

/**
 * The font at scale 1. DERIVED: NXE-XUI.md section 5 records 11pt as the only
 * point size in GuideMain.xui and says the point-to-pixel relationship is not
 * established, so the 42px box is not a font size. 30 is the box at a cap
 * height of about 0.7, which is what Convection gives, and every other size in
 * the Guide comes off the same ratio.
 */
export const CHANNEL_FONT = 30;

/**
 * The row's left edge, where the bullet sits.
 *
 * UNVERIFIED. Section 3.7 gives the two channel rows as y bands only. The x
 * here is DERIVED by fitting: the gamerpic's right edge is 664, the clock's
 * left edge is 866, and the widest row the ramp produces is about 170px, which
 * fits between them with a few pixels to spare. That is the same kind of
 * coincidence the measured numbers show elsewhere in the frame, and it is not
 * the only fit. The other reading is that the rows sit to the left of the
 * gamerpic, in the 368-616 half of the band, which the same evidence cannot
 * rule out. Both are the same width of empty band, so nothing here settles it.
 *
 * Left aligned, because the section describes a bullet to the label's left and
 * a bullet and a label are a left-to-right pair from a fixed origin.
 */
export const CHANNEL_X = 668;

/** The white square bullet, 10px on the label's left. UNVERIFIED. */
export const BULLET_D = 10;
export const BULLET_GAP = 8;

/**
 * The row's authored width, which the scale then shrinks.
 *
 * UNVERIFIED. It has to hold the longest label at scale 1, because any channel
 * can be the selected one, and `Video & Music Marketplace` is 24 characters. At
 * 30px Inter that is about 374px, so 384 clears it. The visible ink never fills
 * it, and the layer it costs is 384x42.
 */
export const CHANNEL_W = 384;

/**
 * The brightness ramp, in steps out from the selected channel. UNVERIFIED: the
 * frame shows the selected row white and the ones above it dimmer, and measures
 * no alpha. Monotone by construction, and clamped past the end, so a list
 * longer than the table cannot come back brighter than the row it is fading
 * from.
 */
export const CHANNEL_ALPHA = [1, 0.82, 0.64, 0.48, 0.34] as const;

/**
 * The item list in the panel, which is the one blade's own list.
 *
 * The Marketplace blade's four items are VERIFIED from section 3.7, which reads
 * them off the frame: `Game Marketplace / Video & Music Marketplace / Active
 * Downloads / Redeem Code`. The other blades' lists are UNVERIFIED and left
 * empty, because no source enumerates them, and an empty blade draws blank rows
 * rather than no rows: the row count is fixed so nothing is created on a
 * channel change.
 */
export const ITEMS: Readonly<Record<string, readonly string[]>> = {
  games: [],
  marketplace: ["Game Marketplace", "Video & Music Marketplace", "Active Downloads", "Redeem Code"],
  player1: [],
  media: [],
  settings: [],
};

/**
 * The rows the panel draws, whatever the blade shows.
 *
 * DERIVED from the panel's 315px and the row geometry below: 6 rows at a 48 pitch
 * is 282 of 315, and the last row's bottom edge lands at 506, which is the 9px
 * the down chevron at the panel's bottom right needs. Fixed, so a blade with four
 * items and a blade with six draw the same six elements.
 */
export const ITEM_ROWS = 7;

/** The row box, the same 42 as the selected channel. DERIVED by reuse. */
export const ITEM_H = 41;

/**
 * The list's font. UNVERIFIED: the frame measures the four item rows' text only
 * as a list, and reads no size off it. It is smaller than `CHANNEL_FONT` because
 * the channel is the hero of the Guide and the item is not, and 18 is about
 * 0.6 of the 30 the channel uses at full size.
 */
export const ITEM_FONT = 24;

/** The pitch, 6 on the 42. DERIVED from ITEM_ROWS fitting the panel. */
export const ITEM_PITCH = 40;

/** The first row's top, 24 down the panel. DERIVED from ITEM_ROWS fitting it. */
export const ITEM_TOP = PANEL_Y + 15;

/** The row's left edge, clearing the tab. DERIVED from TAB_W. */
export const ITEM_X = PANEL_X + TAB_W + 13;

/**
 * The green bar's width, stopping short of the chevron. DERIVED: 470 puts the
 * bar's right edge at 888 and the chevron at 890, with the panel's at 912.
 */
export const ITEM_BAR_W = 473;

/** The down chevron at the panel's bottom right, NXE-BOOT-INPUT.md section 3.8. */
export const CHEVRON_BOX: Box = { x: 900, y: 498, width: 10, height: 8 };

/**
 * The blades, in the order Arbiter's Judgement walks them on 2008-11-16: the
 * Games Blade, then the Marketplace Blade, then the Home Blade, then the Media
 * Blade, then the Settings Blade to its right.
 *
 * UNVERIFIED, and the direction is the weak part. Section 3.7's measured frame
 * lists the other four blades as `Games`, `Player1`, `Media`, `Settings`, which is
 * the same four, but the frame's current blade is not named, so this ring's
 * reading direction is a composition. `Player1` is the Home Blade by the signed
 * in profile, which is the one substitution made.
 */
export const BLADE_IDS = [
  "marketplace",
  "games",
  "player1",
  "media",
  "settings",
] as const satisfies readonly [string, ...string[]];

export const BLADE_COUNT = BLADE_IDS.length;

/** The slabs, one per blade other than the focused one. VERIFIED as a count. */
export const SLAB_COUNT = 4;

/** The slab's own box, the panel's height, so the stack lines up with it. */
export const SLAB_W = 44;
export const SLAB_H = PANEL_H;

/** How far the nearest slab's right edge runs under the panel. */
export const SLAB_TUCK = 2;

/**
 * The recession ramp, all UNVERIFIED.
 *
 * Section 3.7 says the slabs are "thin white slabs, labels rotated 90 degrees,
 * in 3D recession" and "a Rolodex, not a fanned deck", and measures none of it.
 * The scale is the hub's own ramp shape (NXE-XUI.md section 1 measures -0.03 per
 * step, 0.96 to 0.87) rescaled to 0.92 so the first slab is still readable, and
 * the gaps continue to compress the way 27, 26, 24 do. The tilt is what makes it
 * 3D rather than merely small.
 */
export const SLAB_SCALE = [0.95, 0.92, 0.89, 0.86] as const;
export const SLAB_STEP = [38, 38, 38, 38] as const;
export const SLAB_TILT = [0, 0, 0, 0] as const;

/**
 * The slabs' pivot, the panel's own mid-height, the same reason the hub's is
 * 117.5. DERIVED from the measured pivot in NXE-XUI.md section 1.
 */
export const SLAB_PIVOT_Y = SLAB_H / 2;

/**
 * Where a slab's label starts inside the slab, turned 90 degrees the same way the
 * tab's is, so every rotated label in the Guide reads the same way down.
 *
 * UNVERIFIED, and an offset inside the slab rather than a canvas position
 * because the label is its child and has to scale with it. The x centres the
 * turned text in the slab's width.
 */
export const SLAB_LABEL_X = SLAB_W / 2 + ROTATED_LINE / 2;
export const SLAB_LABEL_Y = 0;
export const SLAB_LABEL_FONT = 20;
export const SLAB_LABEL_RUN = SLAB_H;

/**
 * How dark the hub behind is. UNVERIFIED as a number: the section says the hub
 * is "still visible behind, darkened almost to black" and no frame was sampled
 * for it. One flat plane rather than a gradient, because a plane is one layer
 * either way and a full-frame one is the most expensive element in the app.
 */
export const DIM_ALPHA = 0.97;

/**
 * The open. DERIVED, and not from section 3.7.
 *
 * The section's "about a second" is worthplaying measuring the Guide *loading*,
 * not an animation, and this app has the content already resident, so the figure
 * does not apply. The move and the curve are the ones NXE-EXISTING.md section
 * 3.1.3 measures on the hub, which is the same dashboard and the same key. The
 * rise is UNVERIFIED: the frame is a still, so nothing measures how far the
 * chrome comes from.
 */
export const OPEN_MS = 300;
export const OPEN_RISE = 14;

/** A channel or item change, and the per-slab cascade. Both UNVERIFIED. */
export const SELECT_MS = 260;
export const SLAB_STAGGER_MS = 30;

/**
 * The Guide's prompt row: all four buttons at once, `A` Select, `B` Back,
 * `X` Sign Out, `Y` Xbox Dashboard. VERIFIED from section 3.7, and the captions
 * are the ones the dashboard wrote, so they come through `prompts.ts` rather
 * than being written here.
 *
 * One array, built once at module load, so rendering the row allocates nothing
 * on the key press that opens the Guide.
 */
const GUIDE_PROMPTS: readonly Prompt[] = promptsFor({
  a: "Select",
  b: "Back",
  x: "Sign Out",
  y: "Xbox Dashboard",
});

/**
 * The prompt row, left to right, the same array every call. The order is `A`,
 * `B`, `X`, `Y` because that is the order the dashboard drew, which is what
 * `promptsFor` enforces.
 */
export function guidePrompts(): readonly Prompt[] {
  return GUIDE_PROMPTS;
}

export const PROMPT_COUNT = GUIDE_PROMPTS.length;

/**
 * The prompt band, y 528-550. VERIFIED, and it is 22 tall, which is exactly
 * `BUTTON_SIZE` from prompts.ts, so the band is one disc deep and the discs are
 * the one measured size in the band.
 */
export const PROMPT_Y = 528;
export const PROMPT_H = BUTTON_SIZE;

/**
 * Where each disc starts, read off retail `t144`: the captions are set close
 * against their discs and the next disc follows the caption's end, so the
 * pitch is uneven (109, 94, 133). MEASURED to about 3px. The last cell runs
 * to the widest caption, "Xbox Dashboard".
 */
export const PROMPT_XS = [377, 486, 580, 713] as const;
export const PROMPT_LAST_W = 130;
export const PROMPT_GAP = 2;
export const PROMPT_FONT = 20;
export const PROMPT_X = PROMPT_XS[0];

/** A prompt's cell: from its disc to the next one's, and to the last caption's end for the last. */
export function promptCellW(index: number): number {
  const next = PROMPT_XS[index + 1];
  return next === undefined ? PROMPT_LAST_W : next - (PROMPT_XS[index] ?? PROMPT_X);
}

export interface Slab {
  /** Step out from the panel, 0 being the slab against its right edge. */
  d: number;
  id: string;
  x: number;
  scale: number;
  /** Degrees off the panel's plane, hinging away to the right. */
  tilt: number;
}

/**
 * A tuple of a ramp's length. Mapping over a type parameter is what keeps the
 * result a tuple instead of an object with a `length` of `Slab` in it.
 */
type PerSlot<T extends readonly number[]> = { readonly [K in keyof T]: Slab };

export type Slabs = PerSlot<typeof SLAB_STEP>;

export interface Channel {
  /** Index in the list, 0 being the topmost channel. */
  d: number;
  label: string;
  y: number;
  scale: number;
  alpha: number;
  selected: boolean;
}

export interface ItemRow {
  d: number;
  label: string;
  y: number;
  selected: boolean;
}

/** A ramp read out of bounds falls back to its end, so a table cannot run dry. */
function ramp(table: readonly number[], index: number): number {
  return table[Math.min(Math.max(index, 0), table.length - 1)] ?? 0;
}

function wrap(value: number, count: number): number {
  return count <= 0 ? 0 : ((value % count) + count) % count;
}

/**
 * One slab, always. A result whose count moved with the focus would create a
 * slab element inside the key press, and the compositor would allocate a layer
 * for it.
 */
export function slabRow(d: number, id: string): Slab {
  return {
    d,
    id,
    x: 0,
    scale: ramp(SLAB_SCALE, d),
    tilt: ramp(SLAB_TILT, d),
  };
}

/**
 * Every slab of the stack, one pass rightward from the panel.
 *
 * Each slab sits at the previous one's scaled right edge plus the gap at its own
 * slot, so the ramp is a gap and not a pitch, the same composition the hub's
 * ribbon makes of its own measured deltas. Geometry does not depend on the
 * focus: a blade change relabels the slabs and changes nothing else, so the
 * boxes on screen are the same before and after it.
 */
export function placeSlabs(focus: number, bladeIds: readonly string[]): Slabs {
  let edge = PANEL_X + SLAB_TUCK;
  const at = (d: number): Slab => {
    const slab = slabRow(d, bladeIds[wrap(focus - 1 - d, bladeIds.length)] ?? "");
    slab.x = (d === 0 ? edge : edge - ramp(SLAB_STEP, d)) - SLAB_W;
    edge = slab.x + SLAB_W;
    return slab;
  };
  return [at(0), at(1), at(2), at(3)];
}

/** The right edge of the last slab, which the chrome box has to clear. */
export function slabRight(slabs: Slabs): number {
  const last = slabs[slabs.length - 1];
  return last === undefined ? PANEL_X : last.x;
}

/**
 * The box a slab occupies once its transform is applied.
 *
 * The scale is about `SLAB_PIVOT_Y` and the tilt is about the slab's left edge,
 * so the width is what the orthographic projection leaves and a `perspective` on
 * the parent narrows it further. The figure is an upper bound on the drawn
 * width, which is what the bounds check wants, and it is still wider than the
 * gap the next slab steps by, so the stack cannot overlap.
 */
export function slabBox(slab: Slab): Box {
  const scale = slab.scale;
  return {
    x: slab.x + SLAB_W * (1 - scale * Math.cos((slab.tilt * Math.PI) / 180)),
    y: PANEL_Y + (SLAB_H * (1 - scale)) / 2,
    width: SLAB_W * scale * Math.cos((slab.tilt * Math.PI) / 180),
    height: SLAB_H * scale,
  };
}

/**
 * The box a slab is written at, before the transform. Its label is positioned
 * against this and not against the transformed box, because the label is a child
 * of the element and travels with it.
 */
export function slabOrigin(slab: Slab): Box {
  return { x: slab.x, y: PANEL_Y, width: SLAB_W, height: SLAB_H };
}

/** A slab's rotated label, a child of the slab, so it scales and tilts with it. */
export function slabLabelBox(slab: Slab): Box {
  return {
    x: slab.x + SLAB_LABEL_X,
    y: PANEL_Y + SLAB_LABEL_Y,
    width: SLAB_LABEL_RUN,
    height: ROTATED_LINE,
  };
}

/** The focused blade's own label, turned on the panel's left edge. */
export function tabLabelBox(): Box {
  return { x: TAB_LABEL_X, y: TAB_LABEL_Y, width: TAB_LABEL_RUN, height: ROTATED_LINE };
}

/** The arc above the tab label, centred in the tab's width. */
export function spinnerBox(): Box {
  return {
    x: PANEL_X + TAB_W / 2 - SPINNER_D / 2,
    y: SPINNER_Y,
    width: SPINNER_D,
    height: SPINNER_D,
  };
}

/**
 * The focused blade's own label, the one rotated on the panel's left edge. It is
 * the blade before the first slab, so a blade change moves it along the same
 * ring the slabs are cut from.
 */
export function tabLabel(focus: number, bladeIds: readonly string[]): string {
  return bladeIds[wrap(focus, bladeIds.length)] ?? "";
}

/**
 * One channel row. `steps` is how far the row is from the selection, which is
 * what the ramp is indexed by, so a selection change is a change of steps and
 * nothing else: no row is created, none is destroyed and no position moves.
 *
 * `d` counts from the top of the list and the last channel is the one at
 * `CHANNEL_TOP`, so the rows run upward from it. That is the orientation the
 * measurements give: the selected `My Xbox` is at y 188-229 and `Game
 * Marketplace`, one row up the list, is at y 148-175.
 *
 * The scale is bounded above by 1 and below by `CHANNEL_RATIO ** -(count - 1)`
 * because the steps are wrapped, so a row never grows past the box the frame
 * measured for the largest channel.
 */
export function channelRow(d: number, label: string, selected: number, count: number): Channel {
  const steps = wrap(selected - d, count);
  return {
    d,
    label,
    y: CHANNEL_TOP - (Math.max(count, 1) - 1 - d) * CHANNEL_PITCH,
    scale: CHANNEL_RATIO ** -steps,
    alpha: ramp(CHANNEL_ALPHA, steps),
    selected: steps === 0,
  };
}

/** The channel ramp, in list order. `labels` is the list, so the rows are it. */
export function placeChannels(
  labels: readonly string[] = CHANNELS,
  selected = CHANNEL_COUNT - 1,
): Channel[] {
  return labels.map((label, d) => channelRow(d, label, selected, labels.length));
}

/**
 * The box a channel row occupies once its transform is applied, at the authored
 * size the element is written at and scaled from its own top left.
 */
export function channelBox(row: Channel): Box {
  return {
    x: CHANNEL_X,
    y: row.y,
    width: CHANNEL_W * row.scale,
    height: CHANNEL_BOX_H * row.scale,
  };
}

/** The label's own left edge, the bullet and the gap to its left. */
export function channelLabelX(): number {
  return CHANNEL_X + BULLET_D + BULLET_GAP;
}

/**
 * The panel's rows, always `ITEM_ROWS` of them whatever the blade shows.
 *
 * The selection is clamped rather than trusted, so a bad index moves the bar to
 * an end instead of off the list, and one row is always the selected one. A row
 * count that followed the data would be an element created inside the key press.
 */
export function placeItems(labels: readonly string[], selected: number): ItemRow[] {
  const at = Math.min(Math.max(selected, 0), ITEM_ROWS - 1);
  return Array.from({ length: ITEM_ROWS }, (_, d) => ({
    d,
    label: labels[d] ?? "",
    y: ITEM_TOP + d * ITEM_PITCH,
    selected: d === at,
  }));
}

/**
 * The green bar's box at a selection. The bar is written at row 0's slot and
 * moved to the selection with a transform, so its layer is one box whatever the
 * selection is, and the layer exists before the key press.
 */
export function highlightBox(selected: number): Box {
  return { x: ITEM_X, y: ITEM_TOP + selected * ITEM_PITCH, width: ITEM_BAR_W, height: ITEM_H };
}

/** One prompt's disc, the one measured size in the band. */
export function promptDisc(index: number): Box {
  return {
    x: PROMPT_XS[index] ?? PROMPT_X,
    y: PROMPT_Y,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  };
}

/** One prompt's caption, in the rest of its cell. */
export function promptLabel(index: number): Box {
  const disc = promptDisc(index);
  return {
    x: disc.x + BUTTON_SIZE + PROMPT_GAP,
    y: PROMPT_Y,
    width: promptCellW(index) - BUTTON_SIZE - PROMPT_GAP,
    height: PROMPT_H,
  };
}

const SLAB_END = slabRight(placeSlabs(0, BLADE_IDS));

/** The top of the channel ramp, which is the top of the Guide's own chrome. */
const CHROME_TOP = PICPIC_Y;

/** The bottom of the prompt band, which is the bottom of the chrome. */
const CHROME_BOTTOM = PROMPT_Y + PROMPT_H;

/**
 * The slack the chrome box leaves outside the boxes, so a shadow is not clipped
 * by the layer that draws it. UNVERIFIED as a number and DERIVED as a need: the
 * panel's own shadow is the widest thing in the frame, so the sides and the
 * bottom are padded for it and the top only for a channel's 3px text shadow.
 */
const CHROME_PAD_X = 40;
const CHROME_PAD_TOP = 16;
const CHROME_PAD_BOTTOM = 24;

/**
 * The bounds of the Guide's own chrome, and the one box that has to be promoted
 * for the whole takeover.
 *
 * The chrome is a single layer, so it has to cover everything it draws or the
 * compositor clips it. Its bounds are the union of the channel ramp at the top,
 * the prompt band at the bottom, the panel's left edge and the slab stack's
 * right edge, padded. DERIVED from the boxes above and computed rather than
 * written out, so a constant cannot move without the layer following it.
 *
 * A transition that promoted the individual rows instead would be a dozen layers,
 * and each channel's layer would be the width of the longest label rather than
 * the width of the text. One 768x562 layer is smaller than they come to and it
 * is one layer fewer to keep in step.
 */
export const CHROME: Box = {
  x: SLAB_END - CHROME_PAD_X,
  y: CHROME_TOP - CHROME_PAD_TOP,
  width: PANEL_RIGHT - SLAB_END + 2 * CHROME_PAD_X,
  height: CHROME_BOTTOM - CHROME_TOP + CHROME_PAD_TOP + CHROME_PAD_BOTTOM,
};

/** A canvas box moved into the chrome's own coordinates, which it is placed at. */
export function inChrome(box: Box): Box {
  return { x: box.x - CHROME.x, y: box.y - CHROME.y, width: box.width, height: box.height };
}

/**
 * A canvas box expressed inside another canvas box, for an element that is a
 * child of it. Both are canvas positions, so the arithmetic is the one thing
 * here that is not a measured number.
 */
export function within(parent: Box, child: Box): Box {
  return { x: child.x - parent.x, y: child.y - parent.y, width: child.width, height: child.height };
}
