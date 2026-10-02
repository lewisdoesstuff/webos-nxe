import { describe, expect, it } from "vitest";

import { HIDDEN, paneSlot } from "./hub";
import {
  DEAL_FRAMES_MS,
  FOLD_FRAMES_MS,
  LEAVE,
  foldFrames,
  swingFrames,
  cardFrame,
  dealFrames,
  cruiseFor,
  cruiseTrack,
  mustBrake,
  rowTrack,
  trackAt,
  trackFrames,
  trackMs,
} from "./hubMotion";

describe("the row spring", () => {
  it("settles one card from rest in 12 frames, rising monotonically", () => {
    const track = rowTrack(0, 0, 1);
    expect(track.positions.length - 1).toBe(12);
    expect(trackMs(track)).toBeCloseTo(200, 0);
    for (let index = 1; index < track.positions.length; index++) {
      expect(track.positions[index]!).toBeGreaterThan(track.positions[index - 1]!);
    }
  });

  it("carries its speed into a new target, so a held stick does not restart", () => {
    const first = rowTrack(0, 0, 1);
    const midway = trackAt(first, 100);
    expect(midway.velocity).toBeGreaterThan(0);
    const fresh = rowTrack(midway.position, 0, 2);
    const carried = rowTrack(midway.position, midway.velocity, 2);
    expect(carried.positions[1]!).toBeGreaterThan(fresh.positions[1]!);
  });

  it("runs left as well as right, and ends on the rest slot", () => {
    const track = rowTrack(3, 0, 2);
    expect(track.positions.at(-1)).toBe(2);
    const frames = trackFrames(track, 2, paneSlot(0));
    expect(frames.at(-1)).toMatchObject({ x: paneSlot(0).x, y: paneSlot(0).y, scale: 1 });
    expect(frames[0]!.x).toBeCloseTo(cardFrame(-1).x, 5);
  });

  it("swells along the 3D line rather than straight between slots", () => {
    const middle = cardFrame(0.5);
    const straight = (paneSlot(0).scale + paneSlot(1).scale) / 2;
    expect(middle.scale).toBeLessThan(straight);
  });

  it("fades a card leaving to the left over one spacing", () => {
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

function gone(frames: ReturnType<typeof foldFrames>): number {
  return frames.findIndex((frame) => frame.opacity === HIDDEN);
}

describe("leaving for settings", () => {
  it("folds the spill behind the focus, far card first", () => {
    const far = foldFrames(4);
    const near = foldFrames(1);
    expect(far.at(-1)!.opacity).toBe(HIDDEN);
    expect(near.at(-1)!.x).toBeCloseTo(cardFrame(0).x, 5);
    expect(gone(far)).toBeLessThan(gone(near));
    expect(FOLD_FRAMES_MS).toBeLessThan(LEAVE.panel[0]);
  });

  it("swings the focused card edge-on and fades it as it turns", () => {
    const frames = swingFrames(cardFrame(0), 0, 90, LEAVE.panel, LEAVE.panel[1], false);
    expect(frames[0]!.transform).toContain("rotateY(0deg)");
    expect(frames.at(-1)!.transform).toContain("rotateY(90deg)");
    expect(Number(frames.at(-1)!.opacity)).toBe(HIDDEN);
  });
});

describe("a held stick", () => {
  it("cruises at the repeat rate without braking for each card", () => {
    const cruise = cruiseFor(100);
    const track = cruiseTrack(0, cruise, 3, cruise);
    const speeds = track.velocities.slice(1, -1);
    expect(Math.min(...speeds)).toBeCloseTo(cruise, 5);
    expect(Math.max(...speeds)).toBeCloseTo(cruise, 5);
    expect(track.positions.at(-1)).toBe(3);
  });

  it("says when the spring has to take over to stop on the target", () => {
    expect(mustBrake(0, 0, 1)).toBe(true);
    expect(mustBrake(0, 2, 3)).toBe(false);
    expect(mustBrake(2.9, 5, 3)).toBe(true);
  });
});
