import { describe, expect, it } from "vitest";

import { buttonFor, GREEN, horizontal, vertical } from "./keys";

describe("buttonFor", () => {
  it("reads OK and green as A, and every back key as B", () => {
    expect(buttonFor(13)).toBe("a");
    expect(buttonFor(GREEN)).toBe("a");
    for (const code of [461, 403, 27, 8, 66]) expect(buttonFor(code)).toBe("b");
  });

  it("reads yellow and G as the Guide, blue and X as X", () => {
    expect(buttonFor(405)).toBe("guide");
    expect(buttonFor(71)).toBe("guide");
    expect(buttonFor(406)).toBe("x");
    expect(buttonFor(88)).toBe("x");
  });

  it("reads Channel + and - as the right and left bumpers", () => {
    expect(buttonFor(33)).toBe("pageRight");
    expect(buttonFor(34)).toBe("pageLeft");
  });

  it("reads nothing into a key it does not know", () => {
    expect(buttonFor(65)).toBeNull();
  });
});

describe("the D-pad as steps", () => {
  it("is a step along a row for left and right only", () => {
    expect(horizontal(buttonFor(37))).toBe(-1);
    expect(horizontal(buttonFor(39))).toBe(1);
    expect(horizontal(buttonFor(38))).toBeNull();
    expect(horizontal(null)).toBeNull();
  });

  it("is a step down a list for up and down only", () => {
    expect(vertical(buttonFor(38))).toBe(-1);
    expect(vertical(buttonFor(40))).toBe(1);
    expect(vertical(buttonFor(37))).toBeNull();
  });
});
