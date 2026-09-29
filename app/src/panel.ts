/**
 * What a pane draws inside its own box: a shelf of the section's first rows and
 * the 2008 panel's copy block.
 *
 * Pure and framework-free, like `hub.ts`. The composition is
 * [`DESIGN-PANEL.md`](../../docs/DESIGN-PANEL.md) section 5.1's measured table,
 * in the plate's own 386x235 box, carried across at one scale factor. Nothing
 * here invents a number: the shelf, the scrim, the copy and the counter are the
 * measured layout, and the conversion is arithmetic on two verified widths.
 *
 * The shelf's slot count is a property of the composition, never of how many
 * rows a section has. A `v-for` over the row count would create a tile when the
 * focus moves between sections, and a tile appearing mid-move is a layer
 * allocated mid-move, which is what `tools/gate.mjs` fails on. So there are
 * always four tiles and a missing row draws an empty one.
 */

import { PANE_W } from "./hub";
import { PANEL_W } from "./ribbon";

/**
 * One factor, from the measured plate's width to the pane's own width. The
 * plate is `Blade_Center` at 386 (720p) and a pane is a tab scene at 315x200,
 * which is 473 wide at 1080p. DERIVED from two verified widths.
 */
export const FIT = PANE_W / PANEL_W;

/** 78x107 with 12 gaps: 4 x 78 + 3 x 12 = 348, the plate's interior. VERIFIED in DESIGN-PANEL.md 5.2. */
export const TILE_W = 78 * FIT;
export const TILE_H = 107 * FIT;
export const TILE_GAP = 12 * FIT;

/** Four tiles fit the shelf exactly. DERIVED. */
export const SHELF_SLOTS = 4;

/**
 * The slot indices, as a list rather than a count. A `v-for` over a literal
 * range makes the fixed count a syntactic fact: there is no array for a caller
 * to pass in something shorter.
 */
export const SHELF_SLOT_INDEX: readonly number[] = Array.from(
  { length: SHELF_SLOTS },
  (_, slot) => slot,
);

/** The tiles' left edges: 19, 109, 199, 289 in the plate's box. VERIFIED in DESIGN-PANEL.md 5.2. */
export const TILE_X: readonly number[] = SHELF_SLOT_INDEX.map((slot) => (19 + slot * 90) * FIT);

/** A row as far as a pane is concerned. */
export interface TileRow {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly largeIcon?: string;
  readonly iconColor?: string;
}

/** A zone of the composition, for the tests to check the whole of it at once. */
export interface Zone {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The shelf of tiles. VERIFIED in DESIGN-PANEL.md 5.1, y 18, 348x107. */
export const SHELF_BOX: Zone = {
  name: "shelf",
  x: 19 * FIT,
  y: 18 * FIT,
  width: 348 * FIT,
  height: 107 * FIT,
};

/** The names under the tiles. VERIFIED in DESIGN-PANEL.md 5.1, y 129, 348x14. */
export const NAMES_BOX: Zone = {
  name: "names",
  x: 19 * FIT,
  y: 129 * FIT,
  width: 348 * FIT,
  height: 14 * FIT,
};

/** The scrim under the copy block: 64% of the plate's height. VERIFIED in DESIGN-PANEL.md 4.3. */
export const SCRIM_BOX: Zone = {
  name: "scrim",
  x: 0,
  y: 150 * FIT,
  width: 386 * FIT,
  height: 85 * FIT,
};

/** The one line of copy. VERIFIED in DESIGN-PANEL.md 5.1, y 157, 348x20. */
export const BLURB_BOX: Zone = {
  name: "blurb",
  x: 19 * FIT,
  y: 157 * FIT,
  width: 348 * FIT,
  height: 20 * FIT,
};

/** The section's name. VERIFIED in DESIGN-PANEL.md 5.1, y 191, up to 240x30. */
export const TITLE_BOX: Zone = {
  name: "title",
  x: 19 * FIT,
  y: 191 * FIT,
  width: 240 * FIT,
  height: 30 * FIT,
};

/** The counter's band, right-aligned to x 367 in the plate's box. VERIFIED in DESIGN-PANEL.md 5.1. */
export const COUNTER_BOX: Zone = {
  name: "counter",
  x: 19 * FIT,
  y: 207 * FIT,
  width: 348 * FIT,
  height: 14 * FIT,
};

/** The whole composition, so one test can hold all of it inside the pane. */
export function paneZones(): readonly Zone[] {
  return [SHELF_BOX, NAMES_BOX, SCRIM_BOX, BLURB_BOX, TITLE_BOX, COUNTER_BOX];
}

/**
 * The artwork for a tile, or null when it has none.
 *
 * `largeIcon` first, then `icon`. Both are absolute paths outside the app's own
 * directory, so they are only usable through the `hack` prefix, and the paths
 * arrive from `listApps` via the apps store. A caller that cannot resolve them
 * gets null and draws the empty tile.
 */
export function tileArt(row: TileRow): string | null {
  const path = row.largeIcon || row.icon;
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  if (path.startsWith("data:")) return path;
  return path.startsWith("/") ? `hack${path}` : null;
}

/** A tile's caption, trimmed, since it has to fit one tile's width on one line. */
export function tileLabel(title: string): string {
  return title.trim().slice(0, 18);
}

/**
 * The pane's counter.
 *
 * The 2008 footer read `3 of 12 | Title`, so the phrasing is the dashboard's.
 * A section that fits shows its own count rather than a redundant `4 of 4`, and
 * an empty section shows nothing at all, which is a truthful report and the
 * state Games is in on this TV.
 */
export function counterFor(rowCount: number): string {
  if (rowCount <= 0) return "";
  const shown = Math.min(SHELF_SLOTS, rowCount);
  return rowCount > SHELF_SLOTS ? `${shown} of ${rowCount}` : `${rowCount}`;
}

/** The initials an empty tile carries in place of artwork. */
export function initialsFor(title: string): string {
  return title.trim().slice(0, 1).toUpperCase();
}
