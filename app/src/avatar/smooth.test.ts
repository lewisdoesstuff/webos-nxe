import { describe, expect, it } from "vitest";

import { smoothValues } from "./smooth";

describe("smoothValues", () => {
  const times = [0, 0.05, 0.1, 0.15, 0.2];

  it("passes through the original keys and triples the rate", () => {
    const out = smoothValues(times, [0, 1, 4, 9, 16], 1, 60);
    expect(out.times).toHaveLength(13);
    expect(out.values[0]).toBeCloseTo(0);
    expect(out.values[3]).toBeCloseTo(1, 5);
    expect(out.values[12]).toBeCloseTo(16);
  });

  it("keeps quaternions unit length and across the sign flip", () => {
    const q = [0, 0, 0, 1, 0, 0, 0.2, 0.98, 0, 0, -0.4, -0.92, 0, 0, 0.6, 0.8];
    const out = smoothValues([0, 0.05, 0.1, 0.15], q, 4, 60);
    for (let i = 0; i < out.times.length; i++) {
      const len = Math.hypot(...out.values.slice(i * 4, i * 4 + 4));
      expect(len).toBeCloseTo(1, 4);
    }
  });
});
