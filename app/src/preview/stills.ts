import { reactive } from "vue";

import { readJson, writeJson } from "../storage";
import type { PreviewSlot } from "./inputs";

/**
 * Which inputs have a still, which file it is in, and whether it is recent
 * enough to show.
 *
 * A still is a photograph of whatever was plugged into an input at some past
 * moment, so it is only worth drawing while it is roughly about now. A picture
 * of last month's content is worse than no picture, so a week is the line: long
 * enough that someone who watches one input weekly keeps seeing it, short
 * enough that a swapped cable or a different console stops being believed.
 */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const KEY = "blades.previews";

export interface Still {
  at: number;
  slot: PreviewSlot;
}

/** A reactive record rather than a ref, so a row can read one entry and have
 *  exactly that row recompute when a capture lands behind the launcher. */
const captured = reactive<Record<string, Still>>({});

/** The still for an input, or undefined if there is none or the one there is
 *  too old to mean anything. */
export function stillAt(appId: string, now: number = Date.now()): Still | undefined {
  const still = captured[appId];
  if (still === undefined) return undefined;
  return now - still.at > STALE_AFTER_MS ? undefined : still;
}

export function markStill(appId: string, still: Still): void {
  captured[appId] = still;
  persist();
}

export function forgetStill(appId: string): void {
  delete captured[appId];
  persist();
}

/**
 * Read the persisted stills back, dropping anything already too old. The bytes
 * stay on the TV; this is only what we know about them, so a still the app has
 * no record of is treated as absent and the row draws its glyph.
 */
export function loadStills(now: number = Date.now()): void {
  const stored = readJson(KEY);
  if (typeof stored !== "object" || stored === null) return;

  for (const [appId, entry] of Object.entries(stored)) {
    if (isStill(entry) && now - entry.at <= STALE_AFTER_MS) {
      captured[appId] = entry;
    }
  }
}

/** Test seam: the registry is module state, so tests need it back to empty. */
export function resetStills(): void {
  for (const appId of Object.keys(captured)) delete captured[appId];
}

function isStill(entry: unknown): entry is Still {
  if (typeof entry !== "object" || entry === null) return false;
  const { at, slot } = entry as Partial<Still>;
  return typeof at === "number" && Number.isFinite(at) && (slot === "a" || slot === "b");
}

function persist(): void {
  writeJson(KEY, { ...captured });
}
