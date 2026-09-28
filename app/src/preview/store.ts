import { defineStore } from "pinia";
import { ref } from "vue";

import { useSettingsStore } from "../stores/settings";
import { captureStill, type CaptureOutcome } from "./capture";
import { otherSlot, type PreviewSlot } from "./inputs";
import { markStill, resetStills, stillAt } from "./stills";

/**
 * Keeps the stills honest: takes one when the user goes to an input, remembers
 * that it worked, and forgets the rest.
 *
 * The store holds no bytes and no image. Those stay in a file in our own origin
 * written by the capture service, and the page only ever holds a URL.
 */
export const usePreviewStore = defineStore("previews", () => {
  /** Inputs with a capture in flight, so switching away and back quickly does
   *  not stack two settles and two shutters behind the same input. */
  const inFlight = ref<Record<string, true>>({});
  const lastOutcome = ref<CaptureOutcome | null>(null);

  /**
   * Photograph an input that has just been launched.
   *
   * Fire and forget on purpose. The user pressed Enter and the input is coming
   * up; the launcher is not on the panel for the next several seconds, and
   * nothing about the picture may sit on that key path.
   */
  async function capture(appId: string): Promise<CaptureOutcome> {
    if (!useSettingsStore().settings.previews) return { ok: false, reason: "disabled" };
    if (inFlight.value[appId]) return { ok: false, reason: "failed" };
    inFlight.value[appId] = true;

    // Into the slot the last good still is not in, so an attempt that turns out
    // to be a black frame cannot land on the picture the row is drawing.
    const held = stillAt(appId);
    const slot: PreviewSlot = held ? otherSlot(held.slot) : "a";

    let outcome: CaptureOutcome;
    try {
      outcome = await captureStill(appId, slot);
    } finally {
      delete inFlight.value[appId];
    }

    // A failure is not a reason to drop what was there. A source that is off, a
    // stall and a missing grant all mean "no new picture", and the row keeps the
    // last one it had until it goes stale on its own.
    if (outcome.ok) markStill(appId, { at: outcome.at, slot });
    lastOutcome.value = outcome;
    return outcome;
  }

  return { inFlight, lastOutcome, capture };
});

export { resetStills };
