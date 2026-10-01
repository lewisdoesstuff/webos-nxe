/**
 * The default theme's boot, "drops", as keyframes on the same 60 fps frame
 * numbers `boot.ts` runs the clock on, so the stages, the warm rate, the skip
 * and the handover are shared with the sphere bumper.
 *
 * Six glass droplets spiral in out of a dark field and melt together into one
 * sphere at the lockup's orb. The merge sends a ripple across the frame that
 * leaves the settled field behind it, the sphere takes on the orb image, and
 * the wordmark focuses in under it and catches a sheen.
 *
 * The droplets are metaballs, so the merged sphere's radius is the root of
 * the sum of their squared radii: six of `orbRy / sqrt(6)` make the orb.
 *
 * Framework-free and GL-free, like `bootScene.ts`.
 */

import { track, type Vec4 } from "./bootScene";
import type { BootLockup } from "./bootTheme";

export const DROP_COUNT = 6;

/** The frame the droplets meet at the orb's centre. */
export const MERGE_FRAME = 186;

const DEG = Math.PI / 180;

// prettier-ignore
const KEYS = {
  exposure: [[10, 0], [40, 1]],
  reach: [[16, 1250], [60, 880], [100, 560], [140, 270], [170, 70], [MERGE_FRAME, 0]],
  spin: [[16, 0], [100, 170], [MERGE_FRAME, 300]],
  grow: [[16, 0.36], [120, 0.62], [MERGE_FRAME, 1]],
  glow: [[16, 0.6], [150, 1], [MERGE_FRAME, 1.4], [230, 0.5], [260, 0]],
  flash: [[178, 0], [MERGE_FRAME, 0.75], [196, 0.12], [214, 0]],
  ringR: [[MERGE_FRAME - 2, 140], [200, 420], [230, 900], [266, 1500]],
  ringW: [[MERGE_FRAME - 2, 8], [266, 90]],
  ringA: [[MERGE_FRAME - 2, 0], [MERGE_FRAME + 2, 1], [236, 0.55], [266, 0]],
  settled: [[MERGE_FRAME, 0], [266, 1]],
  orbAlpha: [[214, 0], [244, 1]],
  markScale: [[250, 1.08], [330, 1]],
  markAlpha: [[250, 0], [325, 1]],
  markBlur: [[250, 3.5], [330, 0]],
  sheen: [[300, -0.25], [352, 1.25]],
  sheenA: [[300, 0], [312, 1], [344, 1], [356, 0]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

type Channel = keyof typeof KEYS;

const TRACKS = Object.fromEntries(
  Object.entries(KEYS).map(([name, keys]) => [name, track(keys)]),
) as Record<Channel, (frame: number) => number>;

/** Each droplet's lag behind the spiral in frames, and its reach as a share of the spiral's. */
const LAG = [0, 7, 3, 10, 5, 12] as const;
const REACH = [1, 0.86, 1.12, 0.94, 1.06, 0.9] as const;

/** The damped wobble the merged drop settles through, in frame pixels along each droplet's line. */
function wobble(frame: number): number {
  const t = frame - MERGE_FRAME;
  if (t <= 0 || t >= 28) return 0;
  const decay = 1 - t / 28;
  return 16 * Math.sin(t * 0.5) * decay * decay;
}

export interface DropsFrame {
  /** Each droplet as centre x, centre y, radius, 0; `DROP_COUNT` of them. */
  readonly drops: Float32Array;
  /** Exposure, the droplets' glow, the merge flash, how far the field has settled overall. */
  readonly light: Vec4;
  /** The ripple: radius, line width, opacity, and 1 once it has left the merge, when it starts revealing the settled field. */
  readonly ring: Vec4;
  /** The settled orb against its resting place: x and y offset, scale, opacity. */
  readonly orb: Vec4;
  /** The wordmark: scale about its centre, opacity, blur as a mip bias; w unused. */
  readonly wordmark: Vec4;
  /** The sheen across the wordmark: position as a share of its width, opacity. */
  readonly sheen: Vec4;
}

export function dropsScene(frame: number, lockup: BootLockup): DropsFrame {
  const v = (name: Channel) => TRACKS[name](frame);
  const radius = (lockup.orbRy / Math.sqrt(DROP_COUNT)) * v("grow");
  const shake = wobble(frame);
  const drops = new Float32Array(DROP_COUNT * 4);
  for (let i = 0; i < DROP_COUNT; i++) {
    const lagged = frame - (LAG[i] as number);
    const angle = (TRACKS.spin(lagged) + i * (360 / DROP_COUNT)) * DEG;
    const reach = TRACKS.reach(lagged) * (REACH[i] as number) + shake * (i % 2 === 0 ? 1 : -1);
    drops[i * 4] = lockup.orbX + Math.cos(angle) * reach;
    drops[i * 4 + 1] = lockup.orbY + Math.sin(angle) * reach * 0.82;
    drops[i * 4 + 2] = radius;
  }
  return {
    drops,
    light: [v("exposure"), v("glow"), v("flash"), v("settled")],
    ring: [v("ringR"), v("ringW"), v("ringA"), frame >= MERGE_FRAME - 2 ? 1 : 0],
    orb: [0, 0, 1, v("orbAlpha")],
    wordmark: [v("markScale"), v("markAlpha"), v("markBlur"), 0],
    sheen: [v("sheen"), v("sheenA"), 0, 0],
  };
}
