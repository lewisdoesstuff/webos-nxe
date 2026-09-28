import type { Screensaver } from "./idle";

/**
 * The one screensaver the shell mounted, so a settings screen can hold the
 * screen asleep to show what it will look like without waiting out the delay.
 *
 * A preview ends on the next input, which wakes the screen and is swallowed, so
 * a preview never leaves the dashboard asleep behind the user's back.
 */
let mounted: Screensaver | null = null;

export function adoptScreensaver(screensaver: Screensaver | null): void {
  mounted = screensaver;
}

/** Holds the screen at whatever the delay would have done to it. */
export function previewScreensaver(asleep: boolean): void {
  mounted?.preview(asleep);
}

/** Whether the screen is asleep now, preview included. */
export function screensaverAsleep(): boolean {
  return mounted?.sleeping.value ?? false;
}
