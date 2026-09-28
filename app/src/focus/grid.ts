/**
 * The grid focus model, ported from the custom home's QML (`CustomGrid.qml`),
 * which is the behaviour spec (PLAN §4).
 *
 * Deliberately pure and framework-free: the navigation rules are the part worth
 * testing, and they must not depend on Vapor, the DOM, or the TV.
 */

export type Direction = "left" | "right" | "up" | "down";

/**
 * Everything a key can ask for.
 *
 * `prev-blade` and `next-blade` walk the blade stack exactly as `left` and
 * `right` do. They are intents of their own so that a shoulder or channel key
 * can step the stack while the arrows stay where the QML puts them, and so that
 * nothing has to be told the two apart by the key that produced them.
 *
 * `options` and `settings` are the two face buttons the hint bar draws. What
 * they open is not this layer's business: it knows the press happened.
 */
export type Intent =
  | Direction
  | "prev-blade"
  | "next-blade"
  | "activate"
  | "back"
  | "options"
  | "settings";

/**
 * Key codes as they arrive in a DOM `keydown` on the TV's Chromium 108.
 *
 * The QML spec activates on `Key_Return | Key_Enter | Key_Space | Key_Select`;
 * in the DOM those collapse to Enter and Space (the remote's OK button arrives
 * as Enter). Back is webOS's own 461, with Escape as the desktop equivalent —
 * `CustomGrid.qml` accepts Back, Escape and Cancel.
 */
export const KEY_CODE = {
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  enter: 13,
  space: 32,
  back: 461,
  escape: 27,
  /** The two face buttons a desktop keyboard has, standing in for Y and X. */
  y: 89,
  x: 88,
  /** The blade stack, a page at a time, without borrowing the arrows. */
  pageUp: 33,
  pageDown: 34,
  /** The same step from the home row, for the keys beside the arrow cluster. */
  q: 81,
  e: 69,
} as const;

/**
 * The coloured buttons of a webOS TV remote.
 *
 * UNVERIFIED on this device: nothing has been seen sending these, and the
 * webOS 3 Magic Remote has no coloured buttons at all, so a user holding one
 * of those cannot reach the X or Y intents by any key. The keyboard codes are
 * the only route known to work.
 *
 * Each is matched to the face button whose own disc carries that colour
 * (SPEC 6.2), which is the only rule here with anything behind it: red is the
 * `B` disc at `#DA2229` and so is Back, green the `A` disc at `#5EAE4C` and so
 * is activate, yellow the `Y` disc at `#E8C22C` and so is the options panel,
 * blue the `X` disc at `#1E6FBF` and so is the settings screen.
 */
export const REMOTE_KEY_CODE = {
  red: 403,
  green: 404,
  yellow: 405,
  blue: 406,
} as const;

/** Press-and-hold on OK opens the app menu (`CustomGrid.qml`: 650 ms). */
export const LONG_PRESS_MS = 650;

export function intentForKeyCode(code: number): Intent | null {
  switch (code) {
    case KEY_CODE.left:
      return "left";
    case KEY_CODE.up:
      return "up";
    case KEY_CODE.right:
      return "right";
    case KEY_CODE.down:
      return "down";
    case KEY_CODE.enter:
    case KEY_CODE.space:
    case REMOTE_KEY_CODE.green:
      return "activate";
    case KEY_CODE.back:
    case KEY_CODE.escape:
    case REMOTE_KEY_CODE.red:
      return "back";
    case KEY_CODE.y:
    case REMOTE_KEY_CODE.yellow:
      return "options";
    case KEY_CODE.x:
    case REMOTE_KEY_CODE.blue:
      return "settings";
    case KEY_CODE.pageUp:
    case KEY_CODE.q:
      return "prev-blade";
    case KEY_CODE.pageDown:
    case KEY_CODE.e:
      return "next-blade";
    default:
      return null;
  }
}

/** Intents that are one press, so a key held down must not ask for them again. */
const ONCE_PER_PRESS: ReadonlySet<Intent> = new Set(["activate", "back", "options", "settings"]);

/**
 * Whether auto-repeat may ask for the intent again. A press is one thing the
 * user did, so the four above refuse a held key; movement may repeat, as the
 * QML arrows do, and so may the blade steps, which is what makes a held
 * PageDown or D-pad right walk the whole stack.
 */
export function repeatsWhileHeld(intent: Intent): boolean {
  return !ONCE_PER_PRESS.has(intent);
}

/**
 * Where focus moves to, matching QML `GridView`'s default key navigation
 * (`keyNavigationWraps` is false in `CustomGrid.qml`, so edges clamp rather than
 * wrap).
 *
 * Left/right follow *flow order*, so they cross a row boundary — that is what
 * `GridView` does, and it is what makes a partially-filled last row reachable.
 * Up/down move a whole row and clamp at both ends.
 *
 * An intent that names no direction leaves the cursor where it is, so a layer
 * that hands over whatever a key asked for needs no narrowing of its own.
 */
export function moveIndex(index: number, count: number, columns: number, intent: Intent): number {
  if (count <= 0) return 0;

  const current = Math.min(Math.max(index, 0), count - 1);
  const step = Math.max(1, columns);

  switch (intent) {
    case "left":
      return Math.max(current - 1, 0);
    case "right":
      return Math.min(current + 1, count - 1);
    case "up": {
      const next = current - step;
      return next >= 0 ? next : current;
    }
    case "down": {
      const next = current + step;
      return next <= count - 1 ? next : current;
    }
    default:
      return current;
  }
}

/**
 * Whether a `keyup` on the activate key should launch: a short press launches,
 * a long press opened the menu instead (`CustomGrid.qml`'s `pressTimer`).
 */
export function isLaunchRelease(heldMs: number, longPressMs = LONG_PRESS_MS): boolean {
  return heldMs < longPressMs;
}
