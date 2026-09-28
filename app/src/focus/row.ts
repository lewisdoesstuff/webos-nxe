/**
 * Moving along a row of panels.
 *
 * Pure and framework-free, like `ribbon.ts`: the navigation rules are the part
 * worth testing, and they must not touch the DOM, Vapor or the TV.
 */

/**
 * The focus after a step along the row, clamped at both ends.
 *
 * NXE rows do not wrap. Read off retail 9199: a rightward run goes 3 of 8, 5 of 8,
 * 8 of 8, and then holds at 8 of 8, never stepping to 1. The drops back to 1 are
 * channel changes, which re-home the row to its first item, and the small lists
 * behave the same way, 1 of 3 then 2 of 3. See NXE-BOOT-INPUT.md section 3.6.
 *
 * `delta` is taken as a direction, so a held key and a key repeat cannot move
 * more than one step per press.
 */
export function stepFocus(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index + Math.sign(delta), 0), count - 1);
}

/**
 * Where a row re-homes to.
 *
 * Changing channel puts the row back on its first item, which is the reason a
 * dropped position is not evidence of wrapping.
 */
export function rehome(): number {
  return 0;
}
