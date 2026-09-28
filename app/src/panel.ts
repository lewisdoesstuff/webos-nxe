/**
 * The hub plate's content, as pure functions.
 *
 * The shelf's slot count is a property of the plate's geometry, not of how many
 * rows a section happens to have. A `v-for` over the row count would create or
 * destroy a tile when the focus moves between sections, and a tile appearing
 * mid-move is a layer allocated mid-move, which is what `tools/gate.mjs` fails
 * on. So there are always four tiles and a missing row draws an empty one.
 */

/** The plate's interior is 348 wide and the tiles are 78 with 12 gaps. */
export const TILE_W = 78;
export const TILE_H = 107;
export const TILE_GAP = 12;

/** Four tiles fit exactly: 4 * 78 + 3 * 12 = 348. */
export const SHELF_SLOTS = Math.floor((348 + TILE_GAP) / (TILE_W + TILE_GAP));

/**
 * The slot indices, as a list rather than a count.
 *
 * A `v-for` over a literal range is clearer than a `v-for` over a data array of
 * the right length, and it makes the fixed count a syntactic fact: there is no
 * array for a caller to pass in something shorter.
 */
export const SHELF_SLOT_INDEX: readonly number[] = Array.from(
  { length: SHELF_SLOTS },
  (_, slot) => slot,
);

/** A row as far as the plate is concerned. */
export interface TileRow {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly largeIcon?: string;
  readonly iconColor?: string;
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

/** A tile's caption, trimmed, since it has to fit 78px on one line. */
export function tileLabel(title: string): string {
  return title.trim().slice(0, 18);
}

/**
 * The plate's counter.
 *
 * The 2008 footer read `3 of 12 | Title`, so the phrasing is the dashboard's.
 * A section that fits shows its own count rather than a redundant `4 of 4`, and
 * an empty section shows nothing at all, which is a truthful report and the state
 * Games is in on this TV.
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
