/**
 * The remote and a desktop keyboard, read as the controller. Pure.
 *
 * OK and green are A, Back and red are B, the arrows are the D-pad and
 * Channel +/- are the bumpers. Yellow is Y, blue is X and the remote's Guide
 * key opens the Guide. On a desktop keyboard Enter is A, Escape, Backspace and `B`
 * are B, `X` hides, `Y` picks a pane up, `G` opens the Guide and `R` replays
 * the boot. Each colour key is the button of its own colour, so the hints match.
 */
export type Button =
  | "a"
  | "b"
  | "x"
  | "y"
  | "guide"
  | "replay"
  | "up"
  | "down"
  | "left"
  | "right"
  | "pageLeft"
  | "pageRight";

/** The remote's green key, which is A. */
export const GREEN = 404;

const BUTTONS: Readonly<Record<number, Button>> = {
  13: "a",
  [GREEN]: "a",
  461: "b",
  403: "b",
  27: "b",
  8: "b",
  66: "b",
  88: "x",
  // UNVERIFIED on the TV.
  406: "x",
  89: "y",
  405: "y",
  71: "guide",
  // The remote's Guide key, UNVERIFIED on the TV.
  458: "guide",
  82: "replay",
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  34: "pageLeft",
  33: "pageRight",
};

export function buttonFor(keyCode: number): Button | null {
  return BUTTONS[keyCode] ?? null;
}

/** Left or right as a step along a row, or null for any other button. */
export function horizontal(button: Button | null): -1 | 1 | null {
  if (button === "left") return -1;
  return button === "right" ? 1 : null;
}

/** Up or down as a step down a list, or null for any other button. */
export function vertical(button: Button | null): -1 | 1 | null {
  if (button === "up") return -1;
  return button === "down" ? 1 : null;
}
