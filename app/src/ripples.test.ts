import { describe, expect, it } from "vitest";

import {
  FALLBACK_SEED,
  hashSeed,
  RING_CENTRE,
  RING_FROM,
  RING_GROUPS,
  RING_OUTER,
  RING_PERIOD_MS,
  ringBytes,
  ringImage,
  ringSvg,
  ripplePattern,
} from "./ripples";

const SERIALS = ["301TNXE0A1B2", "412MAPZ3K001", "MOCK00NXE2008", "A", ""];

describe("hashSeed", () => {
  it("is stable", () => {
    expect(hashSeed("nxe")).toBe(hashSeed("nxe"));
    expect(hashSeed("")).toBe(0x811c9dc5);
  });

  it("separates close serials", () => {
    expect(hashSeed("412MAPZ3K001")).not.toBe(hashSeed("412MAPZ3K002"));
  });
});

describe("ripplePattern", () => {
  it("draws the same pattern for the same set", () => {
    expect(ripplePattern("301TNXE0A1B2")).toEqual(ripplePattern("301TNXE0A1B2"));
  });

  it("draws a different pattern for another set", () => {
    expect(ripplePattern("412MAPZ3K001")).not.toEqual(ripplePattern("412MAPZ3K002"));
  });

  it("falls back when the seed is empty", () => {
    expect(ripplePattern("")).toEqual(ripplePattern(FALLBACK_SEED));
  });

  it.each(SERIALS)("keeps a fixed layer set for %j", (serial) => {
    const groups = ripplePattern(serial);
    expect(groups).toHaveLength(RING_GROUPS);
    for (const group of groups) {
      expect(group.left + group.width / 2).toBeCloseTo(RING_CENTRE.x, -1);
      expect(group.top + group.height / 2).toBeCloseTo(RING_CENTRE.y, -1);
      expect(group.peak).toBeGreaterThan(0);
      expect(group.peak).toBeLessThanOrEqual(0.5);
      expect(group.delayMs).toBeLessThanOrEqual(0);
      expect(-group.delayMs).toBeLessThanOrEqual(group.periodMs);
    }
  });

  it.each(SERIALS)("keeps every ring inside its layer for %j", (serial) => {
    for (const group of ripplePattern(serial)) {
      expect(group.lines.length).toBeGreaterThanOrEqual(2);
      for (const line of group.lines) {
        expect(line.rx * 2 + line.width).toBeLessThanOrEqual(group.width);
        expect(line.alpha).toBeGreaterThan(0);
        expect(line.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(SERIALS)("moves every ring at retail's speed for %j", (serial) => {
    for (const group of ripplePattern(serial)) {
      expect(group.from).toBe(RING_FROM);
      expect(group.periodMs).toBe(RING_PERIOD_MS);
    }
    const outward = (RING_OUTER * (1 - RING_FROM)) / (RING_PERIOD_MS / 1000);
    expect(outward).toBeGreaterThan(75);
    expect(outward).toBeLessThan(95);
  });

  it.each(SERIALS)("spreads the groups around the cycle for %j", (serial) => {
    const phases = ripplePattern(serial)
      .map((group) => -group.delayMs)
      .sort((a, b) => a - b);
    const gaps = phases.map((phase, index) =>
      index === 0 ? phases[0]! + RING_PERIOD_MS - phases.at(-1)! : phase - phases[index - 1]!,
    );
    expect(Math.max(...gaps)).toBeLessThan((RING_PERIOD_MS / RING_GROUPS) * 1.8);
  });

  it.each(SERIALS)("stays within the ring texture budget for %j", (serial) => {
    expect(ringBytes(ripplePattern(serial))).toBeLessThan(6_500_000);
  });
});

describe("ringSvg", () => {
  it("draws one ellipse per line at the layer's centre", () => {
    const [group] = ripplePattern("nxe");
    const svg = ringSvg(group!);
    expect(svg.match(/<ellipse/g)).toHaveLength(group!.lines.length);
    expect(svg).toContain(`cx="${group!.width / 2}"`);
  });

  it("encodes as a CSS url", () => {
    const [group] = ripplePattern("nxe");
    expect(ringImage(group!)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });
});
