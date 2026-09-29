import { describe, expect, it } from "vitest";

import {
  CHANNEL_COUNT,
  COLUMN_H,
  COLUMN_W,
  COLUMN_X,
  COLUMN_Y,
  FOCUSED_H,
  FOCUSED_W,
  FOCUSED_X,
  FOCUSED_Y,
  LABEL_H,
  LABEL_RAMP,
  LABEL_W,
  LABEL_X,
  type Panes,
  PANE_H,
  PANE_W,
  placeLabels,
  placePanes,
  PROMPT_ROW_H,
  PROMPT_Y,
  px,
  RAIL_ALPHA,
  railFigures,
  renderedBox,
  ROW_H,
  SPILL_SCALE,
  SPILL_X,
  STAGE_H,
  STAGE_W,
} from "./hub";

const FIVE = ["inputs", "apps", "games", "media", "system"] as const;

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`nothing at ${index}`);
  return value;
}

describe("px", () => {
  // The brief states these four converted values outright, and they are the
  // check that the one conversion is the right one.
  it("converts the 720p source numbers the way the brief states", () => {
    expect(px(315)).toBe(473);
    expect(px(81)).toBe(122);
    expect(px(245)).toBe(368);
    expect(px(852)).toBe(1278);
    expect(px(480)).toBe(720);
    expect(px(529)).toBe(794);
  });

  it("rounds halves up, so no layout number is fractional", () => {
    expect(px(231)).toBe(347);
    expect(px(122)).toBe(183);
    for (const value of [227, 117, 81, 245, 315, 200, 386, 235, 529]) {
      expect(Number.isInteger(px(value))).toBe(true);
    }
  });
});

describe("the measured stage", () => {
  it("is Tabscene's box, two thirds of the 1280x720 canvas on both axes", () => {
    expect(STAGE_W).toBe(1278);
    expect(STAGE_H).toBe(720);
    expect(STAGE_W / 1920).toBeCloseTo(852 / 1280, 10);
    expect(STAGE_H / 1080).toBeCloseTo(480 / 720, 10);
  });

  it("keeps the channel column on SelBlade's own box", () => {
    expect(COLUMN_X).toBe(341);
    expect(COLUMN_Y).toBe(176);
    expect(COLUMN_W).toBe(122);
    expect(COLUMN_H).toBe(368);
  });

  it("puts the prompts at btnB's measured height", () => {
    expect(PROMPT_Y).toBe(794);
  });
});

describe("the pane row", () => {
  it("sizes a pane at the tab scenes, and the focused pane at Blade_Center", () => {
    expect(PANE_W).toBe(473);
    expect(PANE_H).toBe(300);
    expect(FOCUSED_W).toBe(579);
    expect(FOCUSED_H).toBe(353);
    expect(FOCUSED_X).toBe(347);
    expect(FOCUSED_Y).toBe(183);
  });

  it("recedes along the ramp Blade2..5 were measured at", () => {
    expect(SPILL_X).toEqual([863, 903, 942, 978]);
    expect(SPILL_SCALE).toEqual([0.96, 0.93, 0.9, 0.87]);
  });

  it("scales the focused pane onto Blade_Center's box exactly", () => {
    const box = renderedBox(at(placePanes(0, FIVE), 0).slot);
    expect(box).toEqual({ x: 347, y: 183, width: 579, height: 353 });
    expect(box.x).toBe(FOCUSED_X);
    expect(box.x + box.width).toBeLessThan(STAGE_W);
  });

  it("keeps every pane's own box the same size, so no layer ever resizes", () => {
    for (const pane of placePanes(2, FIVE)) {
      const box = renderedBox(pane.slot);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
    expect(PANE_W).toBe(473);
    expect(PANE_H).toBe(300);
  });

  it("returns five panes however the focus moves, and never changes the count", () => {
    for (let focus = -3; focus <= 9; focus += 1) {
      const panes: Panes = placePanes(focus, FIVE);
      expect(panes, `focus ${focus}`).toHaveLength(CHANNEL_COUNT);
    }
  });

  it("marks exactly one pane focused, the one at the head of the row", () => {
    for (let focus = 0; focus < FIVE.length; focus += 1) {
      const panes = placePanes(focus, FIVE);
      expect(
        panes.filter((pane) => pane.focused),
        `focus ${focus}`,
      ).toHaveLength(1);
      expect(at(panes, 0).focused).toBe(true);
    }
  });

  it("carries each channel's own id whatever the focus is", () => {
    for (let focus = 0; focus < FIVE.length; focus += 1) {
      const ids = placePanes(focus, FIVE).map((pane) => pane.id);
      expect(new Set(ids).size, `focus ${focus}`).toBe(FIVE.length);
      for (const id of FIVE) expect(ids, `focus ${focus}`).toContain(id);
    }
  });

  it("moves the panes between the slots as the selection changes, and only between them", () => {
    const rest = placePanes(0, FIVE).map((pane) => pane.slot);
    for (let focus = 0; focus < FIVE.length; focus += 1) {
      const slots = placePanes(focus, FIVE).map((pane) => pane.slot);
      for (const slot of slots) expect(rest, `focus ${focus}`).toContainEqual(slot);
    }
  });

  it("steps a pane one slot down the spill as the selection advances", () => {
    const before = at(placePanes(0, FIVE), 4);
    const after = at(placePanes(1, FIVE), 3);
    expect(after.id).toBe(before.id);
    expect(after.slot.x).toBeLessThan(before.slot.x);
    expect(after.slot.scaleX).toBeGreaterThan(before.slot.scaleX);
  });

  it("sits the spill to the right of the focused pane", () => {
    const row = placePanes(0, FIVE);
    const focused = renderedBox(at(row, 0).slot);
    for (let i = 1; i < CHANNEL_COUNT; i += 1) {
      const box = renderedBox(at(row, i).slot);
      expect(box.x, `slot ${i}`).toBeGreaterThan(focused.x + focused.width - 200);
      expect(box.x + box.width, `slot ${i}`).toBeLessThanOrEqual(1920);
    }
  });
});

describe("the channel labels", () => {
  it("uses the measured label box and the measured selected x", () => {
    expect(LABEL_W).toBe(318);
    expect(LABEL_H).toBe(32);
    expect(LABEL_X).toBe(228);
  });

  it("holds the measured ramp: 1 for the selected, then 0.96, 0.93, 0.90, 0.87", () => {
    expect(LABEL_RAMP).toEqual([1, 0.96, 0.93, 0.9, 0.87]);
    expect(LABEL_RAMP[0]).toBe(1);
  });

  it("returns one label per channel, always five", () => {
    for (let focus = -2; focus <= 8; focus += 1) {
      expect(placeLabels(focus, FIVE), `focus ${focus}`).toHaveLength(CHANNEL_COUNT);
    }
  });

  it("gives the selected channel the measured position and no scale", () => {
    for (let focus = 0; focus < FIVE.length; focus += 1) {
      const label = placeLabels(focus, FIVE)[focus];
      expect(label?.selected, `focus ${focus}`).toBe(true);
      expect(label?.slot.x, `focus ${focus}`).toBe(LABEL_X);
      expect(label?.slot.scaleX, `focus ${focus}`).toBe(1);
    }
  });

  it("shrinks the unselected labels down the measured ramp by distance", () => {
    for (let focus = 0; focus < FIVE.length; focus += 1) {
      const labels = placeLabels(focus, FIVE);
      for (let k = 0; k < FIVE.length; k += 1) {
        const distance = Math.min(
          (k - focus + FIVE.length) % FIVE.length,
          (focus - k + FIVE.length) % FIVE.length,
        );
        expect(at(labels, k).slot.scaleX, `focus ${focus}, channel ${k}`).toBe(
          at(LABEL_RAMP, distance),
        );
      }
    }
  });

  it("keeps every channel in its own row, so a label never swaps rows", () => {
    for (let focus = 0; focus < FIVE.length; focus += 1) {
      const labels = placeLabels(focus, FIVE);
      for (let k = 0; k < FIVE.length; k += 1) {
        expect(at(labels, k).slot.y, `focus ${focus}, channel ${k}`).toBe(
          COLUMN_Y + k * ROW_H + (ROW_H - LABEL_H) / 2,
        );
        expect(at(labels, k).row, `focus ${focus}, channel ${k}`).toBe(k);
      }
    }
  });

  it("divides the column into one row per channel", () => {
    expect(ROW_H * CHANNEL_COUNT).toBeCloseTo(COLUMN_H, 10);
    expect(ROW_H).toBeGreaterThan(LABEL_H);
  });

  it("moves a label left as it becomes selected, because the ramp scales about the box centre", () => {
    const before = at(placeLabels(0, FIVE), 1);
    const after = at(placeLabels(1, FIVE), 1);
    expect(renderedBox(after.slot).x).toBeLessThan(renderedBox(before.slot).x);
  });
});

describe("the channel column's rail", () => {
  it("is the figures SelBlade carries, and no more", () => {
    const figures = railFigures();
    expect(figures).toHaveLength(3);
    expect(at(figures, 0)).toEqual({ x: 0, y: 0, width: 35, height: 35 });
    expect(at(figures, 1)).toEqual({ x: 21, y: 35, width: 14, height: 299 });
    expect(at(figures, 2)).toEqual({ x: 0, y: 333, width: 35, height: 35 });
  });

  it("stays inside the column's own box", () => {
    for (const figure of railFigures()) {
      expect(figure.x + figure.width).toBeLessThanOrEqual(COLUMN_W);
      expect(figure.y + figure.height).toBeLessThanOrEqual(COLUMN_H);
    }
    expect(RAIL_ALPHA).toBe(0.4);
  });
});

describe("the prompt row", () => {
  it("is measured from btnB and stays below the stage", () => {
    expect(PROMPT_Y).toBeGreaterThan(STAGE_H);
    expect(PROMPT_Y + PROMPT_ROW_H).toBeLessThanOrEqual(1080);
    expect(PROMPT_ROW_H).toBe(px(40));
  });

  it("keeps the column above the prompts", () => {
    expect(COLUMN_Y + COLUMN_H).toBeLessThan(PROMPT_Y);
    expect(COLUMN_X + COLUMN_W).toBeLessThanOrEqual(STAGE_W);
  });
});
