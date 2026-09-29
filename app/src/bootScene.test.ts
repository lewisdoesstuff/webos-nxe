import { describe, expect, it } from "vitest";

import { bootMasterFrame, bootTiming, FRAME_MS, SETTLED_FRAME } from "./boot";
import { bootScene, KEYS, track } from "./bootScene";

describe("the master frame a clock reading draws", () => {
  it("is the clock over the frame time at full rate", () => {
    const full = bootTiming("full");
    expect(bootMasterFrame(0, full)).toBe(0);
    expect(bootMasterFrame(120 * FRAME_MS, full)).toBeCloseTo(120);
    expect(bootMasterFrame(2000, full)).toBeCloseTo(120);
  });

  it("keeps the lead-in at the master's rate and compresses the rest in the short mode", () => {
    const short = bootTiming("short");
    expect(bootMasterFrame(5 * FRAME_MS, short)).toBeCloseTo(5);
    expect(bootMasterFrame(10 * FRAME_MS + 10 * FRAME_MS, short)).toBeCloseTo(50);
  });

  it("holds the settled frame through the hold and the handover", () => {
    expect(bootMasterFrame(60_000, bootTiming("full"))).toBe(SETTLED_FRAME);
  });
});

describe("a track", () => {
  it("passes through its keys and holds flat outside them", () => {
    const t = track([
      [10, 0],
      [20, 1],
      [30, 1],
    ]);
    expect(t(0)).toBe(0);
    expect(t(10)).toBe(0);
    expect(t(20)).toBe(1);
    expect(t(25)).toBe(1);
    expect(t(99)).toBe(1);
  });

  it("never overshoots between keys", () => {
    const t = track([
      [0, 0],
      [10, 1],
      [11, 1],
      [30, 0],
    ]);
    for (let f = 0; f <= 30; f += 0.25) {
      expect(t(f)).toBeGreaterThanOrEqual(-1e-9);
      expect(t(f)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("the scene", () => {
  it("has keys in frame order on every channel", () => {
    for (const keys of Object.values(KEYS)) {
      for (let i = 1; i < keys.length; i++) {
        expect((keys[i] as readonly number[])[0]).toBeGreaterThan(
          (keys[i - 1] as readonly number[])[0] as number,
        );
      }
    }
  });

  it("is black before first light and finite everywhere", () => {
    expect(bootScene(0).light[3]).toBe(0);
    for (let f = 0; f <= 400; f += 5) {
      for (const value of Object.values(bootScene(f)).flat())
        expect(Number.isFinite(value)).toBe(true);
    }
  });
});
