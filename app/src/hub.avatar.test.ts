import { describe, expect, it } from "vitest";

import { avatarPlace, paneSlot, px } from "./hub";

const CANVAS = { centre: 210, feet: 732 };

function figure(offset: number) {
  const place = avatarPlace(paneSlot(offset), offset, CANVAS);
  return {
    centre: (place.x + place.scale * CANVAS.centre) / 1.5,
    feet: (place.y + place.scale * CANVAS.feet) / 1.5,
    scale: place.scale,
  };
}

describe("avatarPlace", () => {
  it("stands full size before the focused pane's right half, feet on the floor (t122)", () => {
    const at = figure(0);
    expect(at.scale).toBe(1);
    expect(at.centre).toBeCloseTo(395, 0);
    expect(at.feet).toBeCloseTo(640, 0);
  });

  it("stands at the first spill pane's right edge, smaller than the pane (t062)", () => {
    const at = figure(1);
    expect(at.centre).toBeCloseTo(790, 0);
    expect(at.feet).toBeCloseTo(548, 0);
    expect(at.scale).toBeCloseTo(0.648, 2);
  });

  it("follows the pane further into the spill", () => {
    expect(figure(2).scale).toBeLessThan(figure(1).scale);
    expect(figure(2).centre).toBeGreaterThan(figure(1).centre);
    expect(px(1)).toBe(2);
  });
});
