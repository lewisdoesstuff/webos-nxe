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
