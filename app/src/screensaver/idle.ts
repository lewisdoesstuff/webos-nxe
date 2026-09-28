import { ref, type Ref } from "vue";

/**
 * The idle half of the screensaver, with no DOM in it.
 *
 * The component owns the listeners and the two layers it paints; this owns when
 * the screen goes to sleep, which is the part worth being able to reason about
 * on its own.
 */

/** Marks the document while the screen is asleep, which is what the fade keys off. */
export const SLEEP_ATTRIBUTE = "data-blades-sleep";

/** The dashboard's own timings: a second and a fifth of a second. */
export const FADE_OUT_MS = 1200;
export const FADE_IN_MS = 160;

export interface Screensaver {
  readonly sleeping: Ref<boolean>;
  /**
   * Records activity. Reports whether it woke the screensaver, which is the
   * caller's cue to swallow the input that woke it: the first press after a
   * sleep only wakes.
   */
  poke(): boolean;
  /** Re-reads the delay, as a settings change needs. */
  rearm(): void;
  /** Holds the screen asleep regardless of the timer, for a preview. */
  preview(asleep: boolean): void;
  dispose(): void;
}

export interface ScreensaverOptions {
  /** Idle seconds before the screensaver, 0 for off. */
  delay?: () => number;
  /** Raised on every change, awake or asleep. */
  onSleep?: (asleep: boolean) => void;
}

export function createScreensaver(options: ScreensaverOptions = {}): Screensaver {
  const sleeping = ref(false);
  let held = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function delayMs(): number {
    const seconds = options.delay?.() ?? 0;
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  function arm(): void {
    cancel();
    // While asleep the screen stays asleep until something wakes it, and a
    // held preview does not arm at all.
    if (held || sleeping.value) return;
    const ms = delayMs();
    if (ms <= 0) return;
    timer = setTimeout(() => set(true), ms);
  }

  function set(asleep: boolean): void {
    if (sleeping.value === asleep) return;
    sleeping.value = asleep;
    options.onSleep?.(asleep);
    arm();
  }

  return {
    sleeping,
    poke() {
      if (!sleeping.value) {
        arm();
        return false;
      }
      held = false;
      set(false);
      return true;
    },
    rearm: arm,
    preview(asleep: boolean) {
      held = asleep;
      set(asleep);
    },
    dispose: cancel,
  };
}
