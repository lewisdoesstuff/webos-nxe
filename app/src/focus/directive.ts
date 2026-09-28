import { renderEffect } from "@vue/runtime-vapor";

import type { FocusScope } from "./useFocusScope";

/**
 * `v-focusable="index"` — marks a tile as a navigation target and keeps its
 * `data-focused` attribute in step with the scope.
 *
 * Vapor directives are plain functions of `(el, valueGetter, arg, modifiers)`,
 * and the getter has to be read *inside* `renderEffect` or the binding is not
 * reactive (PLAN §8b, decision #8): calling `valueGetter()` once at setup would
 * freeze the tile at whatever index it had at creation.
 *
 * Appearance lives in CSS (`[data-focused="true"]`), so this stays a thin
 * binding and the visual language is the stylesheet's business.
 */
export function createFocusableDirective(scope: FocusScope) {
  return function vFocusable(el: Element, valueGetter: () => number): void {
    const element = el as HTMLElement;
    // Only touch the DOM when something actually changed. Every tile's effect
    // re-runs whenever the focused index moves (they all read it), so writing
    // unconditionally made one keypress cause 44 attribute mutations across 22
    // tiles — measured — each invalidating style for that element. Tracking the
    // last written value keeps it to the two tiles that really changed.
    let lastIndex: number | null = null;
    let lastFocused: boolean | null = null;

    // No returned cleanup: renderEffect(noLifecycle=false) is bound to the
    // component's lifecycle and stopped for us when the tile is destroyed.
    renderEffect(() => {
      const index = valueGetter();

      if (index !== lastIndex) {
        element.dataset["index"] = String(index);
        lastIndex = index;
      }

      // Reading the ref here is what subscribes this effect to focus changes.
      const focused = scope.index.value === index;
      if (focused !== lastFocused) {
        element.dataset["focused"] = String(focused);
        lastFocused = focused;
      }
    });
  };
}
