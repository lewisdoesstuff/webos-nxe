/**
 * Where the camera stands to frame the avatar.
 *
 * The camera looks level, as retail's hub camera does, so the avatar's
 * framing is a distance and a height: far enough back that the model fills
 * `fill` of the canvas height, and high enough that its feet land `foot` of
 * the canvas height above the bottom edge, which leaves room for the contact
 * shadow.
 *
 * Pure: the renderer measures the model and places the camera from this.
 */

export interface AvatarView {
  /** Vertical field of view, in degrees. */
  readonly fov: number;
  /** The share of the canvas height the model fills. */
  readonly fill: number;
  /** The share of the canvas height below the feet. */
  readonly foot: number;
}

/** CHOSEN: a long lens, so the figure reads flat like the hub's, with room above for a wave. */
export const AVATAR_VIEW: AvatarView = { fov: 24, fill: 0.84, foot: 0.05 };

export interface CameraPlace {
  readonly distance: number;
  readonly height: number;
}

/** The camera for a model whose feet are at `bottom` and which is `tall` high. */
export function frameAvatar(bottom: number, tall: number, view: AvatarView): CameraPlace {
  const half = Math.tan((view.fov * Math.PI) / 360);
  const distance = tall / (view.fill * 2 * half);
  return { distance, height: bottom + (1 - 2 * view.foot) * distance * half };
}

/**
 * The canvas, in stage pixels. Retail's figure stands about 290px tall in the
 * 720p frame (t062, t122), 435px here; at `fill` that is a 520px canvas, and
 * 300px across leaves room for a wave. A 0.62MB layer.
 */
export const AVATAR_W = 300;
export const AVATAR_H = 520;
