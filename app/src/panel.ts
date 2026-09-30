/**
 * What a hub pane draws for its item. Pure, so the choice of art and text can
 * be tested without a DOM.
 *
 * A pane is one item, as on the 2008 dashboard: its art large on the pane's
 * face and its name bottom left (docs/REFERENCES.md).
 */

/** The row fields a pane reads. */
export interface PaneItem {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly largeIcon?: string;
  readonly extraLargeIcon?: string;
  readonly iconColor?: string;
  /** Art drawn straight on the card, without the glossy tile. */
  readonly bare?: true;
  /** A second line under the name, such as free space. */
  readonly detail?: string;
  /** The profile pane, which draws the gamercard instead of art. */
  readonly profile?: true;
  /** The profile's gamerscore. */
  readonly score?: number;
  /** The profile's recent apps, drawn small under its heading. */
  readonly recent?: readonly PaneItem[];
}

/**
 * The item's art: the largest icon it has. On the TV these sit outside the app
 * directory and are reached through the `hack` prefix; `mock-tv/` mirrors them
 * at the same paths in dev. Null when there is nothing usable, and the pane
 * draws the item's initial instead.
 */
export function paneArt(item: PaneItem): string | null {
  const path = item.extraLargeIcon || item.largeIcon || item.icon;
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  if (path.startsWith("data:")) return path;
  return path.startsWith("/") ? `hack${path}` : null;
}

/** The initial a pane without art carries. */
export function initialsFor(title: string): string {
  return title.trim().slice(0, 1).toUpperCase();
}

/**
 * The colours of a page pane's art frame, from the item's `iconColor`: a dim
 * wash of that hue over the slate, lighter at the top. Neutral when the colour
 * is missing, unparsable, white or black, since those carry no hue.
 */
export function artTint(color: string | undefined): { top: string; bottom: string } {
  const neutral = { top: "rgba(255, 255, 255, 0.12)", bottom: "rgba(255, 255, 255, 0.03)" };
  const hex = /^#([0-9a-f]{6})$/i.exec((color ?? "").trim());
  if (!hex) return neutral;
  const n = parseInt(hex[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 24) return neutral;
  return { top: `rgba(${r}, ${g}, ${b}, 0.38)`, bottom: `rgba(${r}, ${g}, ${b}, 0.1)` };
}
