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
  sphereX: [[10, 1418], [20, 1333], [30, 1221], [40, 1111], [50, 1007], [60, 926], [70, 847], [80, 797], [90, 780], [100, 742], [110, 713], [120, 670], [130, 629], [150, 584], [170, 577], [190, 590], [210, 591], [220, 650], [230, 723], [240, 940], [244, 955], [250, 964], [262, 975]],
  sphereY: [[10, 4128], [20, 3760], [30, 3256], [40, 2827], [50, 2389], [60, 2021], [70, 1710], [80, 1489], [90, 1380], [100, 1256], [110, 1219], [120, 1170], [130, 1122], [150, 1112], [170, 1091], [190, 1074], [210, 1002], [220, 710], [230, 546], [240, 476], [250, 440], [262, 441]],
  sphereR: [[10, 3712], [20, 3376], [30, 2926], [40, 2544], [50, 2143], [60, 1799], [70, 1500], [80, 1289], [90, 1190], [100, 1066], [110, 1020], [120, 965], [130, 913], [150, 882], [170, 840], [190, 796], [210, 690], [220, 370], [230, 240], [240, 185], [250, 160], [262, 147]],
  sphereAlpha: [[228, 1], [236, 0.62], [244, 0.7], [249, 1], [250, 0]],
  aspect: [[150, 1], [212, 1], [222, 1.15]],
  haze: [[200, 0], [212, 0.25], [220, 0.5], [230, 0.55], [240, 0.55], [250, 0.15]],
  bokeh: [[195, 0], [210, 1], [240, 1], [260, 0.3], [280, 0]],

  yaw: [[92, 48], [120, 44], [135, 37], [200, -25], [210, -32], [220, -116], [230, -200], [236, -320], [241, -358], [244, -360], [270, -360]],
  pitch: [[110, 43.5], [160, 43], [190, 38.5], [210, 33.4], [250, 18], [280, 13]],
  roll: [[86, -13], [140, -14], [195, -4], [222, 0], [250, 0]],

  exposure: [[9, 0], [10, 0.3], [25, 1]],
  keyLight: [[10, 0], [40, 0.03], [55, 0.15], [70, 1.15], [80, 1.8], [90, 2], [100, 1.3], [120, 0.7], [130, 0.62], [210, 0.62], [225, 0.4]],
  rimLight: [[10, 0.25], [30, 0.7], [60, 0.9], [150, 0.9], [220, 0.4]],
  ambient: [[10, 0], [50, 0.01], [70, 0.04], [90, 0.3], [110, 0.3], [130, 0.34], [150, 0.36], [210, 0.36], [225, 0.6]],

  haloX: [[10, 1200], [20, 1150], [30, 780], [50, 600], [70, 700], [200, 700], [220, 650], [230, 723], [240, 845], [250, 951], [270, 960]],
  haloW: [[10, 300], [30, 380], [50, 650], [70, 800], [200, 800], [240, 500]],
  haloK: [[10, 60], [30, 150], [50, 260], [70, 300], [200, 300], [240, 280]],
  haloA: [[10, 0], [20, 0.15], [30, 0.6], [50, 0.85], [70, 0.35], [90, 0.2], [110, 0], [205, 0], [225, 0.2], [250, 0.3], [280, 0.15]],

  grey: [[45, 0], [60, 0.25], [70, 0.55], [90, 0.9], [110, 1]],
  pale: [[110, 0], [130, 0.35], [150, 0.6], [190, 0.85], [210, 1], [360, 1]],
  settled: [[250, 0], [260, 0.29], [270, 0.32], [300, 0.38], [310, 0.4], [320, 0.58], [330, 0.7], [340, 0.96], [352, 1]],
  tint: [[121, 0], [130, 0.8], [150, 0.4], [170, 0.2], [210, 0], [230, 0.25]],

  star: [[55, 0], [70, 0.3], [80, 0.45], [88, 0.8], [95, 0]],
  starLength: [[60, 0.2], [70, 0.24], [90, 0.3]],
  starWidth: [[60, 0.03], [90, 0.045]],
  glow: [[86, 0], [92, 1]],
  hot: [[86, 0], [92, 1], [104, 1], [112, 0.5], [121, 0.15], [135, 0]],
  open: [[86, 0], [92, 0.5], [97, 3], [104, 4.5], [114, 5], [130, 7], [150, 8], [170, 9], [190, 10], [206, 8], [214, 4], [222, 1], [236, 2], [240, 3.5], [244, 4.5], [248, 5], [252, 5]],
  taper: [[100, -0.2], [215, -0.2], [235, 1.54]],
  bloom: [[92, 1], [222, 1], [230, 0]],
  decal: [[236, 0], [246, 1]],
  depth: [[100, 0.07], [225, 0.07], [240, 0.08]],
  gapUR: [[100, 0.7], [150, 0.4], [206, 0.6], [222, 1]],
  gapUL: [[100, 1], [150, 0.5], [206, 0.8], [222, 1]],
  gapLL: [[100, 1], [250, 1]],
  gapLR: [[100, 0.9], [206, 0.9], [222, 1]],
  arm: [[100, 0], [110, 4], [230, 4], [236, 0], [250, 0]],
  streakX: [[125, 1200], [150, 1100], [180, 900], [210, 700]],
  streakY: [[125, 300], [150, 330], [180, 390], [210, 420]],
  streakAngle: [[125, 8], [150, 10], [180, 12], [210, 14]],
  streak: [[118, 0], [130, 0.5], [190, 0.6], [215, 0.2], [225, 0]],
  beams: [[86, 0], [90, 1.2], [100, 1], [108, 0.3], [115, 0]],
  beamLength: [[0, 900]],

  ringX: [[108, 1230], [115, 1183], [120, 1065], [125, 751], [130, 745], [135, 739], [145, 739], [260, 975]],
  ringY: [[108, 480], [115, 604], [120, 675], [125, 835], [130, 1040], [135, 1241], [145, 1241], [260, 440], [310, 450], [330, 500], [352, 548]],
  ringR: [[108, 380], [115, 555], [120, 876], [125, 1486], [130, 1900], [135, 2341], [145, 2341], [260, 250], [270, 300], [290, 445], [310, 500], [330, 765], [345, 900], [352, 955]],
  ringAspect: [[108, 0.5], [115, 0.52], [120, 0.6], [135, 0.6], [260, 0.88], [310, 0.86], [330, 0.75], [352, 0.66]],
  ringAngle: [[108, 45], [115, 37], [120, 25], [135, 25], [260, 0]],
  ringWidth: [[108, 6], [135, 8], [260, 5], [330, 10], [352, 12]],
  ringAlpha: [[108, 0], [114, 1], [137, 1], [142, 0], [262, 0], [272, 0.6], [320, 0.75], [335, 0.6], [348, 0]],
  ringSpread: [[108, 0.04], [120, 0.04], [260, 0.12], [300, 0.04]],

  orbX: [[242, -40], [246, -22], [250, -13], [252, -9], [254, -5.5], [257, 0]],
  orbY: [[242, 24.7], [246, 6.6], [249, 0.3], [252, 0]],
  orbScale: [[242, 1.24], [246, 1.165], [250, 1.111], [252, 1.071], [254, 1.045], [256, 1.026], [260, 1.006], [263, 1]],
  orbAlpha: [[247, 0], [249, 1]],
  markScale: [[280, 1.3], [300, 1.12], [320, 1.03], [335, 1]],
  markAlpha: [[275, 0], [290, 0.45], [310, 0.7], [330, 1]],
  markBlur: [[280, 4], [300, 2.5], [320, 1], [335, 0]],
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
  /** How the gap changes toward the limb, the walls' depth, the bloom, the arms' extra angle in radians. */
  readonly groove: Vec4;
  /** The gap of the upper right, upper left, lower left and lower right arms against the opening. */
  readonly gaps: Vec4;
  /** The light streak across the field: origin, angle in radians, strength. */
  readonly streak: Vec4;
  /** The star's arm length and width in radians, the beams along the arms and their length. */
  readonly star: Vec4;
  /** How far the field is through grey, pale and settled, and its green tint. */
  readonly field: Vec4;
  /** The light ring: centre x, centre y, radii. */
  readonly ring: Vec4;
  /** The ring's angle in radians, line width, opacity and the second ring's offset. */
  readonly ringB: Vec4;
  /** The sphere's horizontal stretch, its haze into the field, the bokeh, and the frame for drift. */
  readonly extra: Vec4;
  /** The settled orb against its resting place: x and y offset, scale, opacity. */
  readonly orb: Vec4;
  /** The wordmark: scale about its centre, opacity, blur as a mip bias; w unused. */
  readonly wordmark: Vec4;
  /** The settled orb laid on the turning sphere: its weight, and the arms' angle at `SETTLE_FRAME`. */
  readonly decal: Vec4;
}

/**
 * The frame the sphere hands over to the settled orb. The orb image is laid on
 * the sphere as it turns in, projected from the pose the sphere holds here, so
 * at this frame the two are the same picture and the handover shows nothing.
 */
export const SETTLE_FRAME = 249;

export function bootScene(frame: number): BootSceneFrame {
  const v = (name: Channel) => TRACKS[name](frame);
  const ringR = v("ringR");
  return {
    sphere: [v("sphereX"), v("sphereY"), v("sphereR"), v("sphereAlpha")],
    pole: [v("yaw") * DEG, v("pitch") * DEG, v("roll") * DEG, 0],
    light: [v("keyLight"), v("rimLight"), v("ambient"), v("exposure")],
    halo: [v("haloX"), v("haloW"), v("haloK"), v("haloA")],
    mark: [v("star"), v("glow"), v("hot"), v("open")],
    groove: [v("taper"), v("depth"), v("bloom"), v("arm") * DEG],
    gaps: [v("gapUR"), v("gapUL"), v("gapLL"), v("gapLR")],
    streak: [v("streakX"), v("streakY"), v("streakAngle") * DEG, v("streak")],
    star: [v("starLength"), v("starWidth"), v("beams"), v("beamLength")],
    field: [v("grey"), v("pale"), v("settled"), v("tint")],
    ring: [v("ringX"), v("ringY"), ringR, ringR * v("ringAspect")],
    ringB: [v("ringAngle") * DEG, v("ringWidth"), v("ringAlpha"), v("ringSpread")],
    extra: [v("aspect"), v("haze"), v("bokeh"), frame],
    orb: [v("orbX"), v("orbY"), v("orbScale"), v("orbAlpha")],
    wordmark: [v("markScale"), v("markAlpha"), v("markBlur"), 0],
    decal: [v("decal"), TRACKS.arm(SETTLE_FRAME) * DEG, 0, 0],
  };
}
