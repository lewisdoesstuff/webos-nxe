/**
 * The dashboard's eight card backgrounds, from the active theme. Each carries
 * the light from above, the chamfered top edge and a different spread of
 * bokeh; the foot is drawn over them.
 */

import { theme } from "./theme";

export const CARDS: readonly string[] = theme().cards;

/** A background for an item, chosen by its id so an item keeps its card when the row moves. */
export function cardFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return CARDS[Math.abs(hash) % CARDS.length] ?? CARDS[0] ?? "";
}
