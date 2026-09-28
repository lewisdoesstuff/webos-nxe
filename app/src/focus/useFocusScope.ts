import { onMounted, onUnmounted, ref, type Ref } from "vue";

import { intentForKeyCode, isLaunchRelease, moveIndex } from "./grid";

/**
 * The focus layer for the app grid (`PLAN §4`: hand-rolled and
 * framework-agnostic; the QML custom home is the behaviour spec).
 *
 * It owns only *navigation* state and the keyboard listeners. What a focused
 * tile looks like is the component's business, which is what keeps this layer
 * portable.
 *
 * In the QML, `MainView_M.patch` forces focus into the grid and resets to index
 * 0 on the first arrow press. There is no widget focus to move in the DOM, so
 * arrow keys always drive the grid and that patch has no equivalent to port.
 */
export interface FocusScope {
  /** Index of the focused tile. Read it inside `renderEffect` to stay reactive. */
  readonly index: Ref<number>;
  /** Cells per row, measured from the viewport. */
  readonly columns: Ref<number>;
  /** How many tiles there are; navigation clamps to this. */
  readonly count: Ref<number>;
  focus(index: number): void;
  onActivate(handler: (index: number) => void): () => void;
  onBack(handler: () => void): () => void;
}

export interface FocusScopeOptions {
  /** Default cells per row before the viewport has been measured. */
  initialColumns?: number;
}

export function useFocusScope(options: FocusScopeOptions = {}): FocusScope {
  const index = ref(0);
  const columns = ref(options.initialColumns ?? 9);
  const count = ref(0);

  const activateHandlers = new Set<(index: number) => void>();
  const backHandlers = new Set<() => void>();

  // An activate key launches on *release* (QML does the same) so that a long
  // press has time to mean "menu" instead of "launch" — M4's app menu.
  let activatePressedAt = 0;
  let activatePressedIndex = -1;

  function focus(target: number): void {
    index.value = Math.min(Math.max(target, 0), Math.max(count.value - 1, 0));
  }

  function onKeyDown(event: KeyboardEvent): void {
    const intent = intentForKeyCode(event.keyCode);
    if (!intent) return;

    // Claim the key: it stops the browser scrolling or acting on it.
    event.preventDefault();

    if (intent === "activate") {
      if (event.repeat) return; // auto-repeat must not restart the press clock
      activatePressedAt = performance.now();
      activatePressedIndex = index.value;
      return;
    }

    if (intent === "back") return; // handled on release, as in the QML

    index.value = moveIndex(index.value, count.value, columns.value, intent);
  }

  function onKeyUp(event: KeyboardEvent): void {
    const intent = intentForKeyCode(event.keyCode);
    if (!intent) return;
    event.preventDefault();

    if (intent === "back") {
      for (const handler of backHandlers) handler();
      return;
    }
    if (intent !== "activate") return;

    const pressed = activatePressedIndex;
    activatePressedIndex = -1;
    if (pressed < 0) return;

    const held = performance.now() - activatePressedAt;
    if (isLaunchRelease(held)) {
      for (const handler of activateHandlers) handler(pressed);
    }
    // A long press is the app menu, which arrives in M4 — deliberately a no-op
    // for now rather than a launch the user did not ask for.
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  });

  return {
    index,
    columns,
    count,
    focus,
    onActivate(handler) {
      activateHandlers.add(handler);
      return () => activateHandlers.delete(handler);
    },
    onBack(handler) {
      backHandlers.add(handler);
      return () => backHandlers.delete(handler);
    },
  };
}
