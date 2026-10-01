/**
 * Everything brand-specific about the boot, in one object.
 *
 * There are two animations, picked by `animation`. `sphere` draws a sphere, a
 * mark cut into its face, the light that comes out of the mark and a field
 * behind it. `drops` draws glass droplets that merge into one sphere over a
 * dark field. Both settle on the same lockup of two textures, and neither
 * knows anything about a brand: the colours, the materials, the mark's geometry
 * and the textures all come from the active theme, so a re-theme is a second
 * object of this shape and no GLSL.
 *
 * Colours are 0..1 RGB triples.
 */

export type Rgb = readonly [number, number, number];

/** A texture and where its subject sits inside it, in texture units. */
export interface BootTexture {
  readonly url: string;
  /** Pixel size of the image, so the aspect is known before it loads. */
  readonly width: number;
  readonly height: number;
}

/** The settled orb is an ellipse cut out of a square image. */
export interface BootOrbTexture extends BootTexture {
  /** The ellipse's centre and radii, in texture pixels. */
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** Where the settled lockup sits in the 1920x1080 frame. */
export interface BootLockup {
  /** The orb's centre and vertical radius. */
  readonly orbX: number;
  readonly orbY: number;
  readonly orbRy: number;
  /** The wordmark texture's top left corner and drawn width. */
  readonly markX: number;
  readonly markY: number;
  readonly markWidth: number;
}

/** `sphere` is the cut sphere and its starburst; `drops` is droplets merging into the orb. */
export type BootAnimation = "sphere" | "drops";

export interface BootTheme {
  readonly animation: BootAnimation;
  /** The backdrop through each phase of the run. */
  readonly field: {
    /** The grey studio the sphere is lit in, bright at the top and dark below. */
    readonly greyTop: Rgb;
    readonly greyEdge: Rgb;
    /** The dark field the droplets gather in, `drops` only. */
    readonly night: Rgb;
    /** The pale wash the camera pulls back into. */
    readonly pale: Rgb;
    /** The settled field: the corners and the glow behind the lockup. */
    readonly settledEdge: Rgb;
    readonly settledMid: Rgb;
    readonly settledGlow: Rgb;
  };
  /** The sphere's shell. */
  readonly sphere: {
    readonly base: Rgb;
    readonly shadow: Rgb;
    readonly specular: Rgb;
    /** The light on the limb while it is backlit. */
    readonly rim: Rgb;
    /** Strength of the brushed grain, 0 for a smooth shell. */
    readonly grain: number;
  };
  /**
   * The mark cut into the sphere's face: two grooves on great circles through
   * the pole, at `angle` degrees either side of the vertical, each `width`
   * (the half-gap in sphere radii at one unit of opening) wide at the pole.
   */
  readonly mark: {
    readonly angle: number;
    readonly width: number;
    /** The groove's light, from its walls through its floor to its hot core. */
    readonly wall: Rgb;
    readonly floor: Rgb;
    readonly core: Rgb;
  };
  /** The accent the rings and the field's light beams are drawn in. */
  readonly accent: Rgb;
  /** The settled orb, which the sphere hands over to once it faces the camera. */
  readonly orb: BootOrbTexture;
  /** The wordmark beneath it: RGB is its colour and alpha its shape. */
  readonly wordmark: BootTexture;
  /** The flare's mask atlas: master frames 86 to 115, 6 by 5 tiles of 128x72. */
  readonly flare: BootTexture;
  readonly lockup: BootLockup;
}

export const hex = (value: number): Rgb => [
  ((value >> 16) & 255) / 255,
  ((value >> 8) & 255) / 255,
  (value & 255) / 255,
];
