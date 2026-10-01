import { describe, expect, it } from "vitest";

import { SETTLED_FRAME } from "./boot";
import { DROP_COUNT, dropsScene } from "./bootDrops";
import { DEFAULT_THEME } from "./theme";

const lockup = DEFAULT_THEME.boot.lockup;

function drops(frame: number): { x: number; y: number; r: number }[] {
  const scene = dropsScene(frame, lockup);
  return Array.from({ length: DROP_COUNT }, (_, i) => ({
    x: scene.drops[i * 4] as number,
    y: scene.drops[i * 4 + 1] as number,
    r: scene.drops[i * 4 + 2] as number,
  }));
}

describe("dropsScene", () => {
  it("merges the droplets into a sphere the size of the settled orb", () => {
    const merged = drops(SETTLED_FRAME);
    for (const drop of merged) {
      expect(drop.x).toBeCloseTo(lockup.orbX, 6);
      expect(drop.y).toBeCloseTo(lockup.orbY, 6);
    }
    const radius = Math.sqrt(merged.reduce((sum, drop) => sum + drop.r * drop.r, 0));
    expect(radius).toBeCloseTo(lockup.orbRy, 3);
  });

  it("is still and fully merged before the orb image fades in", () => {
    const before = drops(214);
    for (const drop of before) {
      expect(drop.x).toBeCloseTo(lockup.orbX, 6);
      expect(drop.y).toBeCloseTo(lockup.orbY, 6);
    }
    expect(dropsScene(214, lockup).orb[3]).toBe(0);
  });

  it("starts the droplets apart and off the orb", () => {
    for (const drop of drops(60)) {
      expect(Math.hypot(drop.x - lockup.orbX, drop.y - lockup.orbY)).toBeGreaterThan(400);
    }
  });

  it("settles on the same lockup the flat fallback draws", () => {
    const settled = dropsScene(SETTLED_FRAME, lockup);
    expect(settled.orb).toEqual([0, 0, 1, 1]);
    expect(settled.wordmark).toEqual([1, 1, 0, 0]);
    expect(settled.light[0]).toBe(1);
    expect(settled.light[3]).toBe(1);
    expect(settled.ring[2]).toBe(0);
    expect(settled.sheen[1]).toBe(0);
  });

  it("is black on the lead-in", () => {
    expect(dropsScene(0, lockup).light[0]).toBe(0);
  });
});
