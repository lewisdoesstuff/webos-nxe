/**
 * Everything brand-specific about the boot, in one object.
 *
 * The shader draws a sphere, a mark cut into its face, the light that comes
 * out of the mark, a field behind it and a settled lockup of two textures. It
 * knows nothing about Xbox: the colours, the sphere's material, the mark's
 * geometry and the two textures all come from here, so a re-theme is a second
 * object of this shape and no GLSL.
 *
 * Colours are linear 0..1 RGB triples, sampled off the timing master
 * (`dkKAW_GXXZk`) where a frame shows them clean.
 */

import flareUrl from "./assets/boot/flare.png?inline";
import markUrl from "./assets/boot/mark.png?inline";
import orbUrl from "./assets/boot/orb.png?inline";

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

export interface BootTheme {
  /** The backdrop through each phase of the run. */
  readonly field: {
    /** The grey studio the sphere is lit in, bright at the top and dark below. */
    readonly greyTop: Rgb;
    readonly greyEdge: Rgb;
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

const hex = (value: number): Rgb => [
  ((value >> 16) & 255) / 255,
  ((value >> 8) & 255) / 255,
  (value & 255) / 255,
];

export const XBOX_THEME: BootTheme = {
  field: {
    greyTop: hex(0xa4a4a4),
    greyEdge: hex(0x3a3a3a),
    pale: hex(0xe2e6e1),
    settledEdge: hex(0x8fa680),
    settledMid: hex(0xa3bd8a),
    settledGlow: hex(0xd8f4a8),
  },
  sphere: {
    base: hex(0x9aa198),
    shadow: hex(0x1c201c),
    specular: hex(0xf4fff0),
    rim: hex(0xc8e8b8),
    grain: 0.05,
  },
  mark: {
    angle: 45,
    width: 0.026,
    wall: hex(0x2fa313),
    floor: hex(0x8cff46),
    core: hex(0xf6ffc8),
  },
  accent: hex(0x8ef070),
  orb: { url: orbUrl, width: 480, height: 480, cx: 247.5, cy: 252.5, rx: 214, ry: 189 },
  wordmark: { url: markUrl, width: 1192, height: 252 },
  flare: { url: flareUrl, width: 768, height: 360 },
  lockup: { orbX: 977.5, orbY: 441.5, orbRy: 144, markX: 536, markY: 595, markWidth: 882 },
};
