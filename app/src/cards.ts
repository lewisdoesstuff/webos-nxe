/**
 * The dashboard's eight card backgrounds, ripped from the retail skin
 * (`riquenunes/pegasus-theme-npe`, `contenttabs/green/backgrounds`). Each
 * carries the light from above, the chamfered top edge and a different spread
 * of bokeh; the foot is drawn over them.
 */

import card1 from "./assets/hub/card/1.jpg";
import card2 from "./assets/hub/card/2.jpg";
import card3 from "./assets/hub/card/3.jpg";
import card4 from "./assets/hub/card/4.jpg";
import card5 from "./assets/hub/card/5.jpg";
import card6 from "./assets/hub/card/6.jpg";
import card7 from "./assets/hub/card/7.jpg";
import card8 from "./assets/hub/card/8.jpg";

export const CARDS = [card1, card2, card3, card4, card5, card6, card7, card8] as const;

/** A background for an item, chosen by its id so an item keeps its card when the row moves. */
export function cardFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return CARDS[Math.abs(hash) % CARDS.length] ?? card1;
}
