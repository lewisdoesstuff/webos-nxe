/**
 * The dashboard's own cues, ripped from retail 9199 (`$flash_dash`,
 * `$flash_huduiskin`, `hud`), and which synthesised voice stands in for each
 * until its clip has decoded.
 *
 * Which action plays which cue was settled by matching every clip against the
 * audio of a retail capture (docs/REFERENCES.md, `LeLocNfgexM`): the hub's
 * row and a page's row play the panel pair, a channel change the channel pair,
 * a settings list `btn_InactiveFocus`, and the Guide the HUD set.
 */

import type { SoundName } from "./voices";

export const CUE_NAMES = [
  "panelLeft",
  "panelRight",
  "channelUp",
  "channelDown",
  "select",
  "back",
  "focus",
  "transition",
  "hudOpen",
  "hudClose",
  "hudFocus",
  "hudSelect",
  "blade1",
  "blade2",
  "blade3",
] as const;

export type CueName = (typeof CUE_NAMES)[number];

/** Anything `playSound` takes: a cue, or one of the synthesised voices. */
export type Sound = CueName | SoundName;

export const CUE_FALLBACK: Readonly<Record<CueName, SoundName>> = {
  panelLeft: "cursor",
  panelRight: "cursor",
  channelUp: "category",
  channelDown: "category",
  select: "decide",
  back: "cancel",
  focus: "cursor",
  transition: "option",
  hudOpen: "option",
  hudClose: "cancel",
  hudFocus: "cursor",
  hudSelect: "decide",
  blade1: "category",
  blade2: "category",
  blade3: "category",
};

/** Cues a held key repeats, which are dropped when they come closer together than a frame or two. */
export const REPEATING: ReadonlySet<Sound> = new Set<Sound>([
  "cursor",
  "panelLeft",
  "panelRight",
  "channelUp",
  "channelDown",
  "focus",
  "hudFocus",
]);

/**
 * The Guide's blade switch cycles through its three clips as 2, 1, 2, 3: every
 * other switch is the second, and the ones between alternate. Read off the
 * capture, where the order holds whichever way the blades move.
 */
export const BLADE_CYCLE: readonly CueName[] = ["blade2", "blade1", "blade2", "blade3"];

export function isCue(name: Sound): name is CueName {
  return (CUE_NAMES as readonly string[]).includes(name);
}
