import { describe, expect, it } from "vitest";

import {
  BLADE_COUNT,
  BLADE_H,
  BLADE_SCALE,
  BLADE_STEP,
  BLADE_W,
  BLADE_Y,
  bladeBox,
  CANVAS_W,
  type Box,
  focusedBox,
  labelFor,
  PANEL_W,
  PANEL_X,
  placeBlades,
  type Ribbon,
} from "./ribbon";

/** The shell's own section list, which the ribbon only ever reads ids from. */
const SEVEN = ["games", "media", "music", "live", "store", "library", "settings"] as const;

const RIBBON = placeBlades(0, SEVEN);

/** An element by a running index, which the compiler will not narrow for us. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`nothing at ${index}`);
  return value;
}

/** The gap between a blade and the one after it, which is what the ramp gives. */
function gaps(ribbon: Ribbon): number[] {
  return ribbon.slice(1).map((blade, i) => blade.x - boxRight(at(ribbon, i)));
}

function boxRight(blade: Ribbon[number]): number {
  return blade.x + BLADE_W * blade.scale;
}

function xs(ribbon: Ribbon): number[] {
  return ribbon.map((blade) => blade.x);
}

function scales(ribbon: Ribbon): number[] {
  return ribbon.map((blade) => blade.scale);
}

function ids(ribbon: Ribbon): string[] {
  return ribbon.map((blade) => blade.id);
}

function boxes(ribbon: Ribbon): Box[] {
  return ribbon.map(bladeBox);
}

describe("placeBlades", () => {
  it("returns one blade per ramp slot, whatever the focus is", () => {
    expect(BLADE_COUNT).toBe(5);
    expect(BLADE_COUNT).toBe(BLADE_STEP.length);
    expect(BLADE_COUNT).toBe(BLADE_SCALE.length);
    for (let focus = -3; focus <= 10; focus += 1) {
      expect(placeBlades(focus, SEVEN), `focus ${focus}`).toHaveLength(BLADE_COUNT);
    }
  });

  it("returns the same count at both ends of the section list", () => {
    expect(placeBlades(0, SEVEN)).toHaveLength(BLADE_COUNT);
    expect(placeBlades(SEVEN.length - 1, SEVEN)).toHaveLength(BLADE_COUNT);
    expect(placeBlades(SEVEN.length, SEVEN)).toHaveLength(BLADE_COUNT);
  });

  it("returns the same count for any section list, however short", () => {
    for (let count = 1; count <= SEVEN.length; count += 1) {
      const short = SEVEN.slice(0, count);
      for (const focus of [0, count - 1, count, -1]) {
        expect(placeBlades(focus, short), `${count} sections, focus ${focus}`).toHaveLength(
          BLADE_COUNT,
        );
      }
    }
  });

  // The result is a tuple, so the next test only compiles while its length is
  // fixed. A blade count that moved with the focus would create a blade element
  // mid-transition, and tools/gate.mjs fails on a layer that appears during a
  // move.
  it("has a length the type fixes, not one it discovers at runtime", () => {
    const ribbon: Ribbon = placeBlades(2, SEVEN);
    expect(ribbon.length).toBe(5);
    expect(ribbon[4].scale).toBe(BLADE_SCALE[4]);
  });

  it("holds the ramp the scene data measured: gaps 27, 26, 24", () => {
    expect(BLADE_STEP[0]).toBe(27);
    expect(BLADE_STEP[1]).toBe(26);
    expect(BLADE_STEP[2]).toBe(24);
  });

  it("holds the scale ramp the scene data measured: 0.96, 0.93, 0.90", () => {
    expect(BLADE_SCALE[0]).toBe(0.96);
    expect(BLADE_SCALE[1]).toBe(0.93);
    expect(BLADE_SCALE[2]).toBe(0.9);
  });

  it("puts the first blade against the panel's right edge, at the first scale", () => {
    expect(RIBBON[0].x).toBe(PANEL_X + PANEL_W);
    expect(RIBBON[0].x).toBe(617);
    expect(RIBBON[0].scale).toBe(0.96);
    expect(RIBBON[0].d).toBe(0);
  });

  // These are deltas between left edges, and each blade is 70 wide, so a delta of
  // 26 leaves consecutive blades overlapping. That is the scene data, not a slip.
  it("applies the deltas from slot 1, because slot 0 sits between two blades", () => {
    for (const delta of gaps(RIBBON)) {
      expect(BLADE_STEP).toContain(delta);
    }
    expect(gaps(RIBBON)).toEqual([26, 24, 22, 21]);
  });

  // The scene file's own absolute positions overlap, because they are deltas
  // between left edges of 70-wide boxes placed at runtime. Each delta here
  // follows the previous blade's scaled right edge, so the rendered ribbon
  // leaves a gap instead, which is a composition rather than a transcription.
  it("leaves a gap between consecutive blades, following the scaled right edge", () => {
    for (let i = 1; i < BLADE_COUNT; i += 1) {
      const left = RIBBON[i - 1];
      const right = RIBBON[i];
      expect(right).toBeDefined();
      expect(left).toBeDefined();
      if (!left || !right) continue;
      expect(right.x).toBe(left.x + BLADE_W * left.scale + (BLADE_STEP[i] ?? 0));
    }
  });

  it("steps the scale down by 0.03 for as far as the table reaches", () => {
    for (let i = 1; i < BLADE_COUNT; i += 1) {
      expect(at(BLADE_SCALE, i - 1) - at(BLADE_SCALE, i)).toBeCloseTo(0.03, 10);
    }
  });

  it("steps right along the ribbon without going back", () => {
    const left = xs(RIBBON);
    for (let i = 1; i < BLADE_COUNT; i += 1) {
      expect(at(left, i)).toBeGreaterThan(at(left, i - 1));
      expect(at(left, i)).toBeGreaterThanOrEqual(boxRight(at(RIBBON, i - 1)));
    }
  });

  it("keeps the whole ribbon inside the canvas", () => {
    expect(boxRight(at(RIBBON, BLADE_COUNT - 1))).toBeLessThanOrEqual(CANVAS_W);
  });

  it("moves no blade at all when the focus changes, only the ids on them", () => {
    for (let focus = 0; focus < SEVEN.length; focus += 1) {
      const other = placeBlades(focus, SEVEN);
      expect(xs(other), `focus ${focus}`).toEqual(xs(RIBBON));
      expect(scales(other), `focus ${focus}`).toEqual(scales(RIBBON));
    }
  });

  it("puts the focused section on the blade against the panel", () => {
    for (let focus = 0; focus < SEVEN.length; focus += 1) {
      const ribbon = placeBlades(focus, SEVEN);
      expect(ribbon[0].id, `focus ${focus}`).toBe(SEVEN[focus]);
      expect(ids(ribbon), `focus ${focus}`).toEqual(
        SEVEN.slice(focus).concat(SEVEN.slice(0, focus)).slice(0, BLADE_COUNT),
      );
    }
  });

  it("wraps the section list at the far end", () => {
    const last = placeBlades(SEVEN.length - 1, SEVEN);
    expect(ids(last)).toEqual(["settings", "games", "media", "music", "live"]);
    expect(ids(placeBlades(SEVEN.length, SEVEN))).toEqual(ids(RIBBON));
  });

  it("wraps the section list backwards off the start", () => {
    expect(ids(placeBlades(-1, SEVEN))).toEqual(["settings", "games", "media", "music", "live"]);
  });

  it("keeps every slot filled when there is only one section", () => {
    const only = placeBlades(0, ["only"]);
    expect(only).toHaveLength(BLADE_COUNT);
    expect(ids(only)).toEqual(["only", "only", "only", "only", "only"]);
    expect(xs(only)).toEqual(xs(RIBBON));
  });

  it("fills every slot with a different section when there are more than slots", () => {
    const eight = [...SEVEN, "downloads", "xbox"];
    const ribbon = placeBlades(5, eight);
    expect(ribbon).toHaveLength(BLADE_COUNT);
    expect(ids(ribbon)).toEqual(["library", "settings", "downloads", "xbox", "games"]);
    expect(new Set(ids(ribbon)).size).toBe(BLADE_COUNT);
  });

  it("leaves a slot empty rather than throwing when there are no sections", () => {
    const none = placeBlades(0, []);
    expect(none).toHaveLength(BLADE_COUNT);
    expect(ids(none)).toEqual(["", "", "", "", ""]);
    expect(xs(none)).toEqual(xs(RIBBON));
  });
});

describe("bladeBox", () => {
  it("puts the box at the blade's own corner, since the transform origin is 0 0", () => {
    expect(bladeBox(RIBBON[0])).toEqual({ x: 617, y: 117.5, width: 67.2, height: 235 });
  });

  it("is the scaled box, not the unscaled one the blade is authored at", () => {
    for (const blade of RIBBON) {
      const box = bladeBox(blade);
      expect(box.x).toBe(blade.x);
      expect(box.width).toBe(BLADE_W * blade.scale);
      expect(box.width).toBeLessThan(BLADE_W);
      expect(box.height).toBe(BLADE_H);
    }
  });

  it("hangs every blade off the pivot the scene data gives, its own mid-height", () => {
    for (const box of boxes(RIBBON)) {
      expect(box.y).toBe(BLADE_Y);
      expect(box.y).toBe(BLADE_H / 2);
    }
  });

  it("leaves the boxes apart, so no two blades touch", () => {
    const list = boxes(RIBBON);
    for (let i = 1; i < BLADE_COUNT; i += 1) {
      const box = at(list, i);
      const before = at(list, i - 1);
      expect(box.x).toBeGreaterThanOrEqual(before.x + before.width);
    }
  });
});

describe("focusedBox", () => {
  it("is the first slot, the blade against the panel", () => {
    expect(focusedBox(RIBBON)).toEqual(bladeBox(RIBBON[0]));
    expect(focusedBox(RIBBON).x).toBe(PANEL_X + PANEL_W);
  });

  it("does not move when the focus does, because the panel does not", () => {
    for (let focus = 0; focus < SEVEN.length; focus += 1) {
      expect(focusedBox(placeBlades(focus, SEVEN)), `focus ${focus}`).toEqual(focusedBox(RIBBON));
    }
  });
});

describe("labelFor", () => {
  it("maps an id to the label it was given", () => {
    const labels = { games: "Games", media: "Movies", live: "Live TV" };
    expect(labelFor("games", labels)).toBe("Games");
    expect(labelFor("media", labels)).toBe("Movies");
    expect(labelFor("live", labels)).toBe("Live TV");
  });

  it("falls back to the id, so an unknown section still has something to draw", () => {
    expect(labelFor("store", { games: "Games" })).toBe("store");
    expect(labelFor("games", {})).toBe("games");
  });

  it("answers the same every time for the same input", () => {
    const labels = { games: "Games" };
    expect(labelFor("games", labels)).toBe(labelFor("games", labels));
  });
});
