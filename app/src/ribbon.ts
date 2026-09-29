/**
 * The 720p stage, for the parts of the app that are authored in it.
 *
 * The Guide (`guide.ts`, `GuideOverlay.vue`) and the page drill (`pages.ts`) are
 * measured in the scene data's own 1280x720 pixels and are laid out in them,
 * so those pixels are what this module holds. The hub itself is authored at
 * 1920x1080 in `hub.ts`, which converts every scene number once; this file
 * deliberately converts nothing.
 *
 * The hub's own geometry used to live here, as a blade ribbon read off the
 * `Blade2..5` ramp. That reading is superseded by NXE-XUI.md section 1a: the
 * ramp is a pane row's recession, not a section list. What remains is the
 * stage and the plate the Guide and the drill measure against.
 */

/** `RomeRootScene.xui`, NXE-XUI.md section 0. VERIFIED. */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;

/**
 * `Blade_Center` is 386x235 at 231,122: the focused pane's box. The page drill
 * rests a closed page surface on it, so it is kept here in the drill's own
 * units. NXE-XUI.md section 1a. VERIFIED.
 */
export const PANEL_W = 386;
export const PANEL_H = 235;
export const PANEL_X = 231;

/**
 * How many blades the hub shows: five, one per channel. `Tab1` to `Tab5` and
 * five label pairs in `GuideMain.xui`. VERIFIED.
 */
export const BLADE_COUNT = 5;

/** A rectangle in 720p stage pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
