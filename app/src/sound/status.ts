/**
 * What the sound layer can currently do, as one plain object.
 *
 * Every reason the dashboard cannot be heard is carried here rather than
 * swallowed, so the settings screen can say which of "off", "waiting for a key",
 * "no file set" and "cannot play it" is the case. Pure: the object is built in
 * `index.ts` and turned into a caption here.
 */

import { MENU_SOUND_COUNT } from "./voices";

/**
 * Where the background music is.
 *
 * `off` is the default, `loading` is while `play()` is in flight, `blocked` is
 * the browser refusing to start without a gesture, and `failed` is a file that
 * could not be read.
 */
export type MusicState = "off" | "loading" | "playing" | "blocked" | "failed" | "unavailable";

export interface SoundStatus {
  /** The stored `navSound` setting, so "off" is distinguishable from "silent". */
  navSound: boolean;
  /** A running audio context, so a blip would actually be heard. */
  unlocked: boolean;
  /** How many of the six blips are rendered and playable. */
  sounds: number;
  /** Why the blips cannot be played, or null when nothing is wrong. */
  reason: string | null;
  /** Where the background music is. */
  music: MusicState;
  /** The file the user pointed at, exactly as they typed it. */
  musicPath: string;
  /** What the player was pointed at, or null when nothing is loaded. */
  musicSource: string | null;
  /** Why the music is not playing, or null when nothing is wrong. */
  musicReason: string | null;
}

function blipLine(status: SoundStatus): string {
  if (!status.navSound) return "Menu sounds off";
  if (status.reason !== null) return `Menu sounds unavailable: ${sentence(status.reason)}`;
  if (!status.unlocked) return "Menu sounds waiting for a key press";
  if (status.sounds >= MENU_SOUND_COUNT) return `All ${MENU_SOUND_COUNT} menu sounds ready`;
  return `${status.sounds} of ${MENU_SOUND_COUNT} menu sounds ready`;
}

function musicLine(status: SoundStatus): string {
  switch (status.music) {
    case "off":
      return "No music file set";
    case "loading":
      return "Music starting";
    case "playing":
      return "Music playing";
    case "blocked":
      return status.musicReason === null
        ? "Music blocked until a key is pressed"
        : sentence(status.musicReason);
    case "failed":
      return status.musicReason === null
        ? "Music file could not be played"
        : sentence(status.musicReason);
    case "unavailable":
      return status.musicReason === null
        ? "This device cannot play music"
        : sentence(status.musicReason);
  }
}

/** One line for the settings screen, covering both features. */
export function describeStatus(status: SoundStatus): string {
  return `${blipLine(status)}. ${musicLine(status)}.`;
}

/** A reason the browser wrote usually ends in a full stop already. */
function sentence(text: string): string {
  return text.replace(/\.\s*$/, "");
}
