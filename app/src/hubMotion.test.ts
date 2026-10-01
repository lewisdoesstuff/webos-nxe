import { describe, expect, it } from "vitest";

import { HIDDEN, paneSlot } from "./hub";
import {
  DEAL_FRAMES_MS,
  MOVE_FRAMES_MS,
  MOVE_TRACK,
  cardFrame,
  dealFrames,
  moveAt,
  moveFrames,
} from "./hubMotion";

describe("the move spring", () => {
  it("settles one card in 12 frames, rising monotonically", () => {
    expect(MOVE_TRACK.length - 1).toBe(12);
    expect(MOVE_FRAMES_MS).toBeCloseTo(200, 0);
    for (let index = 1; index < MOVE_TRACK.length; index++) {
      expect(MOVE_TRACK[index]!).toBeGreaterThan(MOVE_TRACK[index - 1]!);
    }
  });

  it("reports where an interrupted move stands", () => {
    expect(moveAt(1, 0, 0)).toBe(1);
    expect(moveAt(1, 0, 1000)).toBe(0);
    const half = moveAt(1, 0, MOVE_FRAMES_MS / 2);
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
  });
});

describe("move frames", () => {
  it("run from where the card stood to its rest slot", () => {
    const frames = moveFrames(1, 0, paneSlot(0));
    const first = cardFrame(1);
    expect(frames[0]!.x).toBeCloseTo(first.x, 5);
    expect(frames.at(-1)).toMatchObject({ x: paneSlot(0).x, y: paneSlot(0).y, scale: 1 });
  });

  it("swell along the 3D line rather than straight between slots", () => {
    const middle = cardFrame(0.5);
    const straight = (paneSlot(0).scale + paneSlot(1).scale) / 2;
    expect(middle.scale).toBeLessThan(straight);
  });

  it("fade a card leaving to the left over one spacing", () => {
    expect(cardFrame(-0.5).opacity).toBeLessThan(1);
    expect(cardFrame(-0.5).opacity).toBeGreaterThan(0.5);
    expect(cardFrame(-1).opacity).toBe(HIDDEN);
  });
});

function moved(offset: number): number {
  return dealFrames(offset, paneSlot(offset)).findIndex((frame) => frame.opacity > HIDDEN);
}

describe("the deal", () => {
  it("starts every spill card folded behind the focus, hidden", () => {
    for (const offset of [1, 2, 3]) {
      const first = dealFrames(offset, paneSlot(offset))[0]!;
      expect(first.opacity).toBe(HIDDEN);
      expect(first.x).toBeCloseTo(cardFrame(0).x, 5);
    }
  });

  it("deals the cards out in turn, about 100ms apart", () => {
    expect(moved(1)).toBeLessThan(moved(2));
    expect((moved(3) - moved(2)) * (1000 / 60)).toBeCloseTo(100, -1);
  });

  it("ends on each card's rest slot", () => {
    const frames = dealFrames(2, paneSlot(2));
    expect(frames.at(-1)).toMatchObject({ x: paneSlot(2).x, scale: paneSlot(2).scale });
    expect(DEAL_FRAMES_MS).toBeGreaterThan(600);
  });
});
