export type Rgb = readonly [number, number, number];

/** What an icon's edge says about the card it should sit on. */
export interface EdgeColor {
  rgb: Rgb;
}

const RING = 4;
const MIN_OPAQUE = 0.75;
const MAX_SPREAD = 26;

/**
 * The flat colour an icon is drawn on, read from its outer ring of pixels, or
 * null when the icon is transparent or its edge is not one colour.
 */
export function edgeColor(data: Uint8ClampedArray, size: number): EdgeColor | null {
  let count = 0;
  let opaque = 0;
  const sum = [0, 0, 0];
  const squares = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x >= RING && x < size - RING && y >= RING && y < size - RING) {
        x = size - RING - 1;
        continue;
      }
      const at = (y * size + x) * 4;
      count++;
      if (data[at + 3]! < 250) continue;
      opaque++;
      for (let channel = 0; channel < 3; channel++) {
        const value = data[at + channel]!;
        sum[channel]! += value;
        squares[channel]! += value * value;
      }
    }
  }
  if (count === 0 || opaque / count < MIN_OPAQUE) return null;
  const mean = sum.map((total) => total / opaque);
  const spread = Math.max(
    ...squares.map((total, channel) =>
      Math.sqrt(Math.max(0, total / opaque - mean[channel]! ** 2)),
    ),
  );
  if (spread > MAX_SPREAD) return null;
  return { rgb: [Math.round(mean[0]!), Math.round(mean[1]!), Math.round(mean[2]!)] };
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ];
}

export function css(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** The card's vertical gradient for a base colour, shaped like the lime one: a lit top, the colour held flat behind the logo, a dark foot. */
export function faceStops(base: Rgb): [number, string][] {
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  return [
    [0, css(mix(base, white, 0.14))],
    [0.1, css(base)],
    [0.58, css(base)],
    [0.72, css(mix(base, black, 0.35))],
    [0.85, css(mix(base, black, 0.68))],
    [0.97, css(mix(base, black, 0.9))],
    [1, css(mix(base, black, 0.94))],
  ];
}
