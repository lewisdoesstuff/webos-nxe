import { describe, expect, it } from "vitest";

import { CHANNEL_COUNT } from "./hub";
import { BLADE_COUNT, CANVAS_H, CANVAS_W, type Box, PANEL_H, PANEL_W, PANEL_X } from "./ribbon";

/**
 * These are the numbers the Guide and the page drill lay themselves out in,
 * so the tests are about what they measure rather than about how they are
 * written: the stage is the scene data's own canvas and the plate is
 * `Blade_Center`'s own box, unconverted.
 */
describe("the 720p stage", () => {
  it("is the 1280x720 canvas the scene data draws on", () => {
    expect(CANVAS_W).toBe(1280);
    expect(CANVAS_H).toBe(720);
    expect(CANVAS_W / CANVAS_H).toBeCloseTo(16 / 9, 10);
  });

  it("carries no conversion of its own, so nothing here is scaled twice", () => {
    expect(CANVAS_W * 1.5).toBe(1920);
    expect(CANVAS_H * 1.5).toBe(1080);
    expect(PANEL_W * 1.5).toBe(579);
  });
});

describe("the plate", () => {
  it("is Blade_Center: 386x235 at x 231", () => {
    expect(PANEL_W).toBe(386);
    expect(PANEL_H).toBe(235);
    expect(PANEL_X).toBe(231);
  });

  it("sits left of centre, so the ribbon the first build made up was not on it", () => {
    expect(PANEL_X + PANEL_W / 2).toBeLessThan(CANVAS_W / 2);
    expect(PANEL_X + PANEL_W).toBeLessThan(CANVAS_W);
    expect(PANEL_H).toBeLessThan(CANVAS_H / 2);
  });
});

describe("BLADE_COUNT", () => {
  it("is one blade per Guide channel, and the hub adds Home to them", () => {
    expect(BLADE_COUNT).toBe(5);
    expect(BLADE_COUNT + 1).toBe(CHANNEL_COUNT);
  });
});

describe("Box", () => {
  it("is four numbers, and a box of them is round-trippable", () => {
    const box: Box = { x: PANEL_X, y: 122, width: PANEL_W, height: PANEL_H };
    expect(box).toEqual({ x: 231, y: 122, width: 386, height: 235 });
    expect(box.x + box.width).toBe(617);
    expect(box.y + box.height).toBe(357);
  });
});
