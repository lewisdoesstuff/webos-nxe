import { describe, expect, it } from "vitest";

import { rehome, stepFocus } from "./row";

describe("stepFocus", () => {
  it("moves one step in the direction pressed", () => {
    expect(stepFocus(0, 1, 8)).toBe(1);
    expect(stepFocus(3, 1, 8)).toBe(4);
    expect(stepFocus(3, -1, 8)).toBe(2);
  });

  // The behaviour that distinguishes this from a carousel: a rightward run read
  // off retail 9199 went 3 of 8, 5 of 8, 8 of 8 and then held.
  it("holds at the last item rather than wrapping to the first", () => {
    expect(stepFocus(7, 1, 8)).toBe(7);
    expect(stepFocus(7, 1, 8)).toBe(7);
    expect(stepFocus(0, 1, 8)).toBe(1);
  });

  it("holds at the first item", () => {
    expect(stepFocus(0, -1, 8)).toBe(0);
    expect(stepFocus(0, -1, 8)).toBe(0);
  });

  it("takes delta as a direction, so a repeat cannot skip", () => {
    expect(stepFocus(0, 99, 8)).toBe(1);
    expect(stepFocus(0, -99, 8)).toBe(0);
    expect(stepFocus(7, 99, 8)).toBe(7);
  });

  it("treats a zero delta as no movement", () => {
    expect(stepFocus(3, 0, 8)).toBe(3);
  });

  it("survives an empty or negative row", () => {
    expect(stepFocus(0, 1, 0)).toBe(0);
    expect(stepFocus(4, 1, -3)).toBe(0);
  });

  it("keeps every position in range for a row of any size", () => {
    for (let count = 1; count <= 12; count += 1) {
      let at = rehome();
      for (let press = 0; press < 40; press += 1) {
        at = stepFocus(at, 1, count);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(count);
      }
      for (let press = 0; press < 40; press += 1) {
        at = stepFocus(at, -1, count);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(count);
      }
    }
  });
});

describe("rehome", () => {
  it("puts the row back on its first item, which is what a channel change does", () => {
    expect(rehome()).toBe(0);
  });
});
