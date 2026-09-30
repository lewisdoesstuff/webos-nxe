import { describe, expect, it } from "vitest";

import { edgeColor, faceStops } from "./tileColor";

function icon(
  size: number,
  edge: [number, number, number, number],
  middle: [number, number, number, number],
) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = x >= 8 && x < size - 8 && y >= 8 && y < size - 8;
      data.set(inside ? middle : edge, (y * size + x) * 4);
    }
  }
  return data;
}

describe("edgeColor", () => {
  it("reads the flat colour an icon sits on", () => {
    const found = edgeColor(icon(64, [200, 20, 30, 255], [255, 255, 255, 255]), 64);
    expect(found?.rgb).toEqual([200, 20, 30]);
  });

  it("has no colour for a transparent icon", () => {
    expect(edgeColor(icon(64, [0, 0, 0, 0], [255, 255, 255, 255]), 64)).toBeNull();
  });

  it("has no colour when the edge is not one colour", () => {
    const data = icon(64, [255, 0, 0, 255], [0, 0, 0, 255]);
    for (let y = 0; y < 64; y++) data.set([0, 0, 255, 255], (y * 64 + 63) * 4);
    for (let y = 0; y < 64; y++) data.set([0, 255, 0, 255], y * 64 * 4);
    for (let x = 0; x < 64; x++) data.set([0, 0, 255, 255], x * 4);
    expect(edgeColor(data, 64)).toBeNull();
  });
});

describe("faceStops", () => {
  it("runs from a lit top to a near-black foot through the colour", () => {
    const stops = faceStops([200, 20, 30]);
    expect(stops[0]![0]).toBe(0);
    expect(stops.at(-1)![0]).toBe(1);
    expect(stops.find(([at]) => at === 0.58)![1]).toBe("rgb(200, 20, 30)");
  });
});
