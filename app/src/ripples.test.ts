import { describe, expect, it } from "vitest";

import {
  FALLBACK_SEED,
  hashSeed,
  RING_CENTRE,
  RING_GROUPS,
  ringBytes,
  ringImage,
  ringSvg,
  ripplePattern,
} from "./ripples";

const SERIALS = ["301TXNE0A1B2", "412MAPZ3K001", "MOCK00XNE2008", "A", ""];

describe("hashSeed", () => {
  it("is stable", () => {
    expect(hashSeed("xne")).toBe(hashSeed("xne"));
    expect(hashSeed("")).toBe(0x811c9dc5);
  });

  it("separates close serials", () => {
    expect(hashSeed("412MAPZ3K001")).not.toBe(hashSeed("412MAPZ3K002"));
  });
});

describe("ripplePattern", () => {
  it("draws the same pattern for the same set", () => {
    expect(ripplePattern("301TXNE0A1B2")).toEqual(ripplePattern("301TXNE0A1B2"));
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
      expect(group.from).toBeGreaterThan(0.3);
      expect(group.from).toBeLessThan(0.65);
      expect(group.peak).toBeGreaterThan(0);
      expect(group.peak).toBeLessThanOrEqual(0.92);
      expect(group.delayMs).toBeLessThanOrEqual(0);
      expect(-group.delayMs).toBeLessThanOrEqual(group.periodMs);
    }
  });

  it.each(SERIALS)("keeps every ring inside its layer for %j", (serial) => {
    for (const group of ripplePattern(serial)) {
      expect(group.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of group.lines) {
        expect(line.rx * 2 + line.width).toBeLessThanOrEqual(group.width);
        expect(line.alpha).toBeGreaterThan(0);
        expect(line.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(SERIALS)("runs from small to large groups for %j", (serial) => {
    const widths = ripplePattern(serial).map((group) => group.width);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });

  it.each(SERIALS)("stays within the ring texture budget for %j", (serial) => {
    expect(ringBytes(ripplePattern(serial))).toBeLessThan(5_300_000);
  });

  it("gives the groups different periods", () => {
    const periods = new Set(ripplePattern("301TXNE0A1B2").map((group) => group.periodMs));
    expect(periods.size).toBe(RING_GROUPS);
  });
});

describe("ringSvg", () => {
  it("draws one ellipse per line at the layer's centre", () => {
    const [group] = ripplePattern("xne");
    const svg = ringSvg(group!);
    expect(svg.match(/<ellipse/g)).toHaveLength(group!.lines.length);
    expect(svg).toContain(`cx="${group!.width / 2}"`);
  });

  it("encodes as a CSS url", () => {
    const [group] = ripplePattern("xne");
    expect(ringImage(group!)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });
});
