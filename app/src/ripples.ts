/**
 * The rings on the floor around the orb.
 *
 * Retail drew its rings from the console's serial number, so no two consoles
 * showed the same pattern. This draws them from the TV's: the seed is hashed
 * into a fixed number of ring groups, each a few concentric, sometimes doubled
 * rings that grow and fade on a period of their own. The periods differ, so the
 * floor never shows the same arrangement twice in a row, and the set keeps its
 * pattern across launches because the seed does not change.
 *
 * Pure: the view turns each group into one promoted layer whose texture is the
 * group's SVG and whose animation is scale and opacity. Growing a group costs
 * only its outer ring's box, which is why rings travel in groups.
 */

/** Promoted layers, fixed so the layer set never depends on the seed. */
export const RING_GROUPS = 6;

/** The orb's shadow, which every ring is centred on, in stage pixels. */
export const RING_CENTRE = { x: 1737, y: 1008 } as const;

/** Height over width of a ring lying on the floor. */
export const RING_ASPECT = 0.25;

const MIN_OUTER = 200;
const MAX_OUTER = 560;
const PAD = 4;

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

  // Outer radii run from the smallest to the largest with irregular gaps.
  const gaps = Array.from({ length: RING_GROUPS }, () => between(0.6, 1.4));
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  let reached = 0;
  const outers = gaps.map((gap) => {
    reached += gap;
    return (
      MIN_OUTER + ((MAX_OUTER - MIN_OUTER) * (reached - gap)) / (total - gaps[RING_GROUPS - 1]!)
    );
  });

  return outers.map((outer, index) => {
    const lines: RingLine[] = [];
    const rings = next() < 0.5 ? 3 : 4;
    for (let ring = 0; ring < rings; ring++) {
      const rx = ring === 0 ? outer : outer * between(0.28, 0.92);
      const alpha = between(0.55, 1);
      lines.push({ rx: round(rx, 1), width: round(between(1.2, 2.2)), alpha: round(alpha) });
      if (next() < 0.55) {
        lines.push({
          rx: round(rx - between(4, 9), 1),
          width: round(between(0.9, 1.6)),
          alpha: round(alpha * between(0.5, 0.85)),
        });
      }
    }

    const width = Math.ceil(outer * 2 + PAD * 2);
    const height = Math.ceil(outer * 2 * RING_ASPECT + PAD * 2);
    const periodMs = Math.round(between(13000, 27000));
    return {
      lines,
      left: Math.round(RING_CENTRE.x - width / 2),
      top: Math.round(RING_CENTRE.y - height / 2),
      width,
      height,
      from: round(between(0.34, 0.6)),
      peak: round(between(0.6, 0.92) * (1 - (0.3 * index) / RING_GROUPS)),
      periodMs,
      delayMs: -Math.round(next() * periodMs),
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
