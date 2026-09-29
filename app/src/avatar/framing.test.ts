import { describe, expect, it } from "vitest";

import { AVATAR_VIEW, frameAvatar } from "./framing";

/** Where world height `y` lands on the canvas, 0 at the bottom edge and 1 at the top. */
function onCanvas(y: number, bottom: number, tall: number): number {
  const place = frameAvatar(bottom, tall, AVATAR_VIEW);
  const half = Math.tan((AVATAR_VIEW.fov * Math.PI) / 360) * place.distance;
  return ((y - place.height) / half + 1) / 2;
}

describe("frameAvatar", () => {
  it("puts the feet at the foot margin", () => {
    expect(onCanvas(0, 0, 1.8)).toBeCloseTo(AVATAR_VIEW.foot);
  });

  it("fills the chosen share of the height", () => {
    expect(onCanvas(1.8, 0, 1.8) - onCanvas(0, 0, 1.8)).toBeCloseTo(AVATAR_VIEW.fill);
  });

  it("does not care where the model stands or how tall it is", () => {
    expect(onCanvas(-2, -2, 0.9)).toBeCloseTo(AVATAR_VIEW.foot);
    expect(onCanvas(-1.1, -2, 0.9)).toBeCloseTo(AVATAR_VIEW.foot + AVATAR_VIEW.fill);
  });
});
