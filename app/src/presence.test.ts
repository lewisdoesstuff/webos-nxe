import { describe, expect, it } from "vitest";

import { SLEEP_GAP_MS, sleptThrough } from "./presence";

describe("sleptThrough", () => {
  it("is true for a long gap on a visible page", () =>
    expect(sleptThrough(0, SLEEP_GAP_MS, true)).toBe(true));
  it("is false for a normal beat", () => expect(sleptThrough(0, 5200, true)).toBe(false));
  it("is false when the page was in the background", () =>
    expect(sleptThrough(0, SLEEP_GAP_MS * 100, false)).toBe(false));
});
