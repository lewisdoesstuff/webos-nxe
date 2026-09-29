/**
 * The rings on the floor around the orb.
 *
 * Retail streams rings out of the orb's shadow: each leaves at the same steady
 * speed, about 85 stage pixels a second across the floor, and fades out near
 * 460px, while the gaps between them are irregular. The gaps came from the
 * console's serial number; here they come from the TV's. The seed is hashed into
 * a fixed number of ring groups, each a few rings in the outer half of one
 * layer, and the groups are spaced around one shared cycle with jitter.
 *
 * Pure: the view turns each group into one promoted layer whose texture is the
 * group's SVG and whose animation is a linear scale and an opacity. Every group
 * grows at the same rate, so every ring keeps retail's speed, and growing a
 * group costs only its outer ring's box, which is why rings travel in groups.
 */

/** Promoted layers, fixed so the layer set never depends on the seed. */
export const RING_GROUPS = 6;

/** The orb's shadow, which every ring is centred on, in stage pixels. */
export const RING_CENTRE = { x: 1737, y: 1008 } as const;

/** Height over width of a ring lying on the floor. */
export const RING_ASPECT = 0.3;

/** Every group's full horizontal radius, where its outer ring fades out. */
export const RING_OUTER = 460;

/** The scale a group is born at, just outside the orb's shadow. */
export const RING_FROM = 0.12;

/** One cycle, set by retail's speed across the floor. */
export const RING_PERIOD_MS = 4800;

const PAD = 3;

/** Used when the TV will not say who it is, and in tests. */
export const FALLBACK_SEED = "xne";

export interface RingLine {
  /** Horizontal radius at full size, in stage pixels. */
  readonly rx: number;
  readonly width: number;
  readonly alpha: number;
}

export interface RingGroup {
  readonly lines: readonly RingLine[];
  /** The layer's box, in stage pixels, at full size. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The scale a cycle starts from; it ends at 1. */
  readonly from: number;
  /** Opacity at the height of a cycle. */
  readonly peak: number;
  readonly periodMs: number;
  /** Negative, so every group is already mid-cycle on the first frame. */
  readonly delayMs: number;
}

/** FNV-1a, 32 bits. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast and good enough to scatter rings. */
function random(state: number): () => number {
  let next = state;
  return () => {
    next = (next + 0x6d2b79f5) >>> 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number, places = 2) => Number(value.toFixed(places));

export function ripplePattern(seed: string): RingGroup[] {
  const next = random(hashSeed(seed || FALLBACK_SEED));
  const between = (low: number, high: number) => low + next() * (high - low);
  const width = Math.ceil(RING_OUTER * 2 + PAD * 2);
  const height = Math.ceil(RING_OUTER * 2 * RING_ASPECT + PAD * 2);
  const slot = RING_PERIOD_MS / RING_GROUPS;

  return Array.from({ length: RING_GROUPS }, (_, index) => {
    const lines: RingLine[] = [];
    const rings = 2 + Math.floor(next() * 3);
    for (let ring = 0; ring < rings; ring++) {
      const rx = RING_OUTER * (ring === 0 ? between(0.9, 1) : between(0.55, 0.9));
      const alpha = between(0.5, 1);
      lines.push({ rx: round(rx, 1), width: round(between(1.2, 2)), alpha: round(alpha) });
      if (next() < 0.45) {
        lines.push({
          rx: round(rx - between(4, 8), 1),
          width: round(between(0.9, 1.5)),
          alpha: round(alpha * between(0.5, 0.85)),
        });
      }
    }

    const phase = (index + between(-0.35, 0.35)) * slot;
    return {
      lines,
      left: Math.round(RING_CENTRE.x - width / 2),
      top: Math.round(RING_CENTRE.y - height / 2),
      width,
      height,
      from: RING_FROM,
      peak: round(between(0.3, 0.46)),
      periodMs: RING_PERIOD_MS,
      delayMs: -Math.round((phase + RING_PERIOD_MS) % RING_PERIOD_MS),
    };
  });
}

/**
 * One group's texture. The stroke fades toward both ends of the ring, further
 * on the left, where retail's rings run out across the floor.
 */
export function ringSvg(group: RingGroup): string {
  const cx = group.width / 2;
  const cy = group.height / 2;
  const ellipses = group.lines
    .map(
      (line) =>
        `<ellipse cx="${cx}" cy="${cy}" rx="${line.rx}" ry="${round(line.rx * RING_ASPECT, 1)}" stroke-width="${line.width}" stroke-opacity="${line.alpha}"/>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${group.width}" height="${group.height}">` +
    `<defs><linearGradient id="f"><stop offset="0" stop-color="#dbe4ea" stop-opacity="0.15"/>` +
    `<stop offset="0.45" stop-color="#dbe4ea"/><stop offset="0.8" stop-color="#dbe4ea"/>` +
    `<stop offset="1" stop-color="#dbe4ea" stop-opacity="0.55"/></linearGradient></defs>` +
    `<g fill="none" stroke="url(#f)">${ellipses}</g></svg>`
  );
}

/** The group's texture as a CSS `url()`. */
export function ringImage(group: RingGroup): string {
  return `url("data:image/svg+xml,${encodeURIComponent(ringSvg(group))}")`;
}

/** Texture bytes for all groups: each layer is `w * h * 4` in CSS pixels. */
export function ringBytes(groups: readonly RingGroup[]): number {
  return groups.reduce((sum, group) => sum + group.width * group.height * 4, 0);
}
