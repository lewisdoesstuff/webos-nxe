/**
 * The bumper as keyframes on the master's frame numbers.
 *
 * Framework-free and GL-free: `bootScene(frame)` turns a master frame (60 fps,
 * `dkKAW_GXXZk`) into the handful of vec4s the fragment shader draws from.
 * Every key below was read off the master frame it names, so a key is checked
 * by rendering `?boot=full&at=<frame * 1000 / 60>` beside `docs/refs/boot/`.
 *
 * Positions are in the 1920x1080 frame, y down. Angles are degrees here and
 * radians in the output.
 */

export type Vec4 = readonly [number, number, number, number];

type Key = readonly [frame: number, value: number];

/**
 * A scalar track through keys, held flat outside them. Monotone cubic, so a
 * track that is still between two equal keys stays still and an alpha never
 * overshoots past its keys.
 */
export function track(keys: readonly Key[]): (frame: number) => number {
  const n = keys.length;
  const xs = keys.map((key) => key[0]);
  const ys = keys.map((key) => key[1]);
  const x = (i: number) => xs[i] as number;
  const y = (i: number) => ys[i] as number;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((y(i + 1) - y(i)) / (x(i + 1) - x(i)));
  const tangents: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = slopes[i - 1];
    const b = slopes[i];
    if (a === undefined) tangents.push(b ?? 0);
    else if (b === undefined) tangents.push(a);
    else tangents.push(a * b <= 0 ? 0 : (2 * a * b) / (a + b));
  }
  return (frame: number): number => {
    if (n === 0) return 0;
    if (frame <= x(0)) return y(0);
    if (frame >= x(n - 1)) return y(n - 1);
    let i = 0;
    while (frame > x(i + 1)) i++;
    const h = x(i + 1) - x(i);
    const t = (frame - x(i)) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * y(i) +
      (t3 - 2 * t2 + t) * h * (tangents[i] as number) +
      (-2 * t3 + 3 * t2) * y(i + 1) +
      (t3 - t2) * h * (tangents[i + 1] as number)
    );
  };
}

/**
 * The keys, by channel, as `[frame, value]`. Sphere centre and radius are
 * circles fitted to the limb on the named frame (least squares through column
 * edges, or three points where a flare burns part of it out); the pole is where
 * the mark's centre sits on the shell, as a yaw and pitch off the camera axis;
 * the rest are read by eye and by sampled pixel values.
 */
// prettier-ignore
export const KEYS = {
  sphereX: [[10, 1418], [20, 1333], [30, 1221], [40, 1111], [50, 1007], [60, 926], [70, 847], [80, 797], [90, 780], [100, 742], [110, 713], [120, 670], [130, 629]],
  sphereY: [[10, 4128], [20, 3760], [30, 3256], [40, 2827], [50, 2389], [60, 2021], [70, 1710], [80, 1489], [90, 1380], [100, 1256], [110, 1219], [120, 1170], [130, 1122]],
  sphereR: [[10, 3712], [20, 3376], [30, 2926], [40, 2544], [50, 2143], [60, 1799], [70, 1500], [80, 1289], [90, 1190], [100, 1066], [110, 1020], [120, 965], [130, 913]],
  sphereAlpha: [[0, 1]],

  yaw: [[10, 30]],
  pitch: [[10, 40]],
  roll: [[86, 0], [110, -12]],

  exposure: [[9, 0], [10, 0.3], [25, 1]],
  keyLight: [[10, 0], [40, 0.03], [55, 0.15], [70, 1.15], [80, 1.8], [90, 2], [100, 1.3], [120, 0.95], [130, 0.9]],
  rimLight: [[10, 0.25], [30, 0.7], [60, 0.9]],
  ambient: [[10, 0], [50, 0.01], [70, 0.04], [90, 0.3], [110, 0.35], [130, 0.3]],

  haloX: [[10, 1200], [20, 1150], [30, 780], [50, 600], [70, 700]],
  haloW: [[10, 300], [30, 380], [50, 650], [70, 800]],
  haloK: [[10, 60], [30, 150], [50, 260], [70, 300]],
  haloA: [[10, 0], [20, 0.15], [30, 0.6], [50, 0.85], [70, 0.35], [90, 0.2], [110, 0]],

  grey: [[45, 0], [60, 0.25], [70, 0.55], [90, 0.9], [110, 1]],
  pale: [[110, 0], [130, 0.35]],
  settled: [[0, 0]],
  tint: [[121, 0], [130, 0.8]],

  star: [[55, 0], [70, 0.3], [80, 0.45], [88, 0.8], [95, 0]],
  starLength: [[60, 0.2], [70, 0.24], [90, 0.3]],
  starWidth: [[60, 0.03], [90, 0.045]],
  glow: [[86, 0], [92, 1]],
  hot: [[86, 0], [92, 1], [100, 1], [112, 0.4], [121, 0.15], [135, 0]],
  open: [[86, 0], [100, 3.5]],
  beams: [[86, 0], [90, 1.2], [100, 1], [108, 0.3], [115, 0]],
  beamLength: [[0, 900]],

  ringX: [[0, 1070]],
  ringY: [[0, 600]],
  ringR: [[108, 750], [121, 950], [130, 1400], [145, 2000]],
  ringAspect: [[0, 0.62]],
  ringAngle: [[0, -30]],
  ringWidth: [[0, 18]],
  ringAlpha: [[113, 0], [119, 1], [135, 1], [150, 0]],
  ringSpread: [[0, 0.04]],
} as const satisfies Record<string, readonly Key[]>;

type Channel = keyof typeof KEYS;

const TRACKS = Object.fromEntries(
  Object.entries(KEYS).map(([name, keys]) => [name, track(keys)]),
) as Record<Channel, (frame: number) => number>;

const DEG = Math.PI / 180;

/** One frame of the scene, as the shader's uniforms, each a vec4 named `u` plus the key. */
export interface BootSceneFrame {
  /** Centre x, centre y, radius, opacity. */
  readonly sphere: Vec4;
  /** Yaw, pitch and roll of the mark's pole, radians; w unused. */
  readonly pole: Vec4;
  /** Key light, rim light, ambient, exposure. */
  readonly light: Vec4;
  /** The glow behind the limb: centre x, half-width, falloff, strength. */
  readonly halo: Vec4;
  /** The star under the shell, the open groove's light, its white-hot core, how far the groove is open. */
  readonly mark: Vec4;
  /** The star's arm length and width in radians, the beams along the arms and their length. */
  readonly star: Vec4;
  /** How far the field is through grey, pale and settled, and its green tint. */
  readonly field: Vec4;
  /** The light ring: centre x, centre y, radii. */
  readonly ring: Vec4;
  /** The ring's angle in radians, line width, opacity and the second ring's offset. */
  readonly ringB: Vec4;
}

export function bootScene(frame: number): BootSceneFrame {
  const v = (name: Channel) => TRACKS[name](frame);
  const ringR = v("ringR");
  return {
    sphere: [v("sphereX"), v("sphereY"), v("sphereR"), v("sphereAlpha")],
    pole: [v("yaw") * DEG, v("pitch") * DEG, v("roll") * DEG, 0],
    light: [v("keyLight"), v("rimLight"), v("ambient"), v("exposure")],
    halo: [v("haloX"), v("haloW"), v("haloK"), v("haloA")],
    mark: [v("star"), v("glow"), v("hot"), v("open")],
    star: [v("starLength"), v("starWidth"), v("beams"), v("beamLength")],
    field: [v("grey"), v("pale"), v("settled"), v("tint")],
    ring: [v("ringX"), v("ringY"), ringR, ringR * v("ringAspect")],
    ringB: [v("ringAngle") * DEG, v("ringWidth"), v("ringAlpha"), v("ringSpread")],
  };
}
