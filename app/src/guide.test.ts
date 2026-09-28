import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compileScript, compileTemplate, parse } from "@vue/compiler-sfc";
import { describe, expect, it } from "vitest";

import {
  BLADE_COUNT,
  BLADE_IDS,
  BULLET_D,
  BULLET_GAP,
  CHANNELS,
  channelBox,
  channelLabelX,
  channelRow,
  CHANNEL_ALPHA,
  CHANNEL_BOX_H,
  CHANNEL_COUNT,
  CHANNEL_PITCH,
  CHANNEL_RATIO,
  CHANNEL_TOP,
  CHANNEL_W,
  CHANNEL_X,
  CHROME,
  CHEVRON_BOX,
  CLOCK_H,
  CLOCK_RIGHT,
  CLOCK_W,
  CLOCK_X,
  CLOCK_Y,
  DIM_ALPHA,
  guidePrompts,
  highlightBox,
  inChrome,
  ITEM_BAR_W,
  ITEM_FONT,
  ITEM_H,
  ITEM_PITCH,
  ITEM_ROWS,
  ITEM_TOP,
  ITEM_X,
  ITEMS,
  OPEN_MS,
  OPEN_RISE,
  PANEL_H,
  PANEL_W,
  PANEL_X,
  PANEL_Y,
  PICPIC_H,
  PICPIC_W,
  PICPIC_X,
  PICPIC_Y,
  placeChannels,
  placeItems,
  placeSlabs,
  PROMPT_CELL_W,
  PROMPT_COUNT,
  PROMPT_H,
  PROMPT_X,
  PROMPT_Y,
  promptDisc,
  promptLabel,
  ROTATED_LINE,
  SELECT_MS,
  SLAB_COUNT,
  SLAB_H,
  SLAB_LABEL_X,
  SLAB_PIVOT_Y,
  SLAB_SCALE,
  SLAB_STEP,
  SLAB_TILT,
  SLAB_W,
  SPINNER_D,
  SPINNER_Y,
  TAB_LABEL_Y,
  TAB_W,
  type Box,
  type Channel,
  type Slab,
  type Slabs,
  slabBox,
  slabLabelBox,
  slabOrigin,
  spinnerBox,
  tabLabel,
  tabLabelBox,
  within,
} from "./guide";
import { BUTTON_SIZE } from "./prompts";
import { CANVAS_H, CANVAS_W } from "./ribbon";

/** An element by a running index, which the compiler will not narrow for us. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`nothing at ${index}`);
  return value;
}

function right(box: Box): number {
  return box.x + box.width;
}

function bottom(box: Box): number {
  return box.y + box.height;
}

function inCanvas(box: Box): boolean {
  return box.x >= 0 && box.y >= 0 && right(box) <= CANVAS_W && bottom(box) <= CANVAS_H;
}

/** A label of any length, which is what a channel row has to survive. */
function labels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Channel ${i}`);
}

/**
 * The rows ordered from the selection outward, which is the axis the ramp runs
 * on. The list runs top to bottom, so that is not the order the rows come back
 * in, and the scale is a strictly monotone function of the distance, so sorting
 * by it recovers the ramp.
 */
function fromSelection(rows: readonly Channel[]): Channel[] {
  return [...rows].sort((a, b) => b.scale - a.scale);
}

/**
 * A box turned 90 degrees draws as a strip one line wide and as long as the
 * label runs, so that is the ink the layer has to cover. The element is still
 * positioned by its unrotated top left, which is what the placement returns.
 */
function turned(box: Box): Box {
  return { x: box.x, y: box.y, width: ROTATED_LINE, height: box.width };
}

/** Every box the overlay draws, for the check that the chrome covers them all. */
function drawnBoxes(): Box[] {
  const slabs = placeSlabs(0, BLADE_IDS);
  return [
    { x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H },
    { x: PANEL_X, y: PANEL_Y, width: TAB_W, height: PANEL_H },
    spinnerBox(),
    turned(tabLabelBox()),
    { x: PICPIC_X, y: PICPIC_Y, width: PICPIC_W, height: PICPIC_H },
    { x: CLOCK_X, y: CLOCK_Y, width: CLOCK_W, height: CLOCK_H },
    highlightBox(0),
    CHEVRON_BOX,
    ...slabs.map((slab) => slabOrigin(slab)),
    ...slabs.map((slab) => turned(slabLabelBox(slab))),
    ...placeChannels().map((row) => channelBox(row)),
    ...Array.from({ length: PROMPT_COUNT }, (_, i) => promptDisc(i)),
    ...Array.from({ length: PROMPT_COUNT }, (_, i) => promptLabel(i)),
  ];
}

describe("the panel", () => {
  // NXE-BOOT-INPUT.md section 3.7, read off retail build 9199: x 368-912,
  // y 200-515, 544 x 315, horizontally centred.
  it("is the box the frame measured, to the pixel", () => {
    expect({ x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H }).toEqual({
      x: 368,
      y: 200,
      width: 544,
      height: 315,
    });
  });

  it("spans 368 to 912 and 200 to 515, which is what the table says", () => {
    expect(right({ x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H })).toBe(912);
    expect(bottom({ x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H })).toBe(515);
  });

  it("is centred on the canvas, which the section calls out", () => {
    expect(PANEL_X + PANEL_W / 2).toBe(640);
    expect(PANEL_X + PANEL_W / 2).toBe(CANVAS_W / 2);
  });

  it("sits below the profile plate, which the frame centres above it", () => {
    expect(PANEL_Y - (PICPIC_Y + PICPIC_H)).toBe(2);
    expect(PICPIC_X + PICPIC_W / 2).toBe(640);
    expect(PICPIC_X).toBe(616);
    expect(PICPIC_Y).toBe(148);
    expect(PICPIC_W).toBe(48);
    expect(PICPIC_H).toBe(50);
  });

  it("leaves the prompt band below it, which the frame puts at 528-550", () => {
    expect(PROMPT_Y - (PANEL_Y + PANEL_H)).toBe(13);
    expect(PROMPT_Y).toBe(528);
    expect(PROMPT_Y + PROMPT_H).toBe(550);
  });
});

describe("the channel list", () => {
  // The order section 3.7 gives for 9199, top to bottom.
  it("is the five channels of build 9199, in the order the frame lists them", () => {
    expect([...CHANNELS]).toEqual([
      "Inside Xbox",
      "Friends",
      "Video & Music Marketplace",
      "Game Marketplace",
      "My Xbox",
    ]);
  });

  it("is a fixed list, so the row count cannot move with the data", () => {
    expect(CHANNEL_COUNT).toBe(5);
    expect(CHANNEL_ALPHA).toHaveLength(CHANNEL_COUNT);
    expect(placeChannels()).toHaveLength(CHANNEL_COUNT);
  });

  it("draws one row per channel, in list order", () => {
    expect(placeChannels().map((row) => row.label)).toEqual([...CHANNELS]);
    expect(placeChannels().map((row) => row.d)).toEqual([0, 1, 2, 3, 4]);
  });

  it("puts the selected channel on the last row, the one the frame measured", () => {
    const rows = placeChannels();
    expect(at(rows, CHANNEL_COUNT - 1).selected).toBe(true);
    expect(at(rows, CHANNEL_COUNT - 1).label).toBe("My Xbox");
    expect(rows.filter((row) => row.selected)).toHaveLength(1);
  });
});

describe("the channel ramp", () => {
  // Two rows are measured: `My Xbox` at y 188-229 and `Game Marketplace` at
  // y 148-175. Everything else follows from the pitch between them.
  it("puts My Xbox at y 188 and 42 tall, as the frame measured", () => {
    const mine = at(placeChannels(), 4);
    expect(mine.y).toBe(188);
    expect(CHANNEL_BOX_H).toBe(42);
    expect(channelBox(mine)).toMatchObject({ y: 188, height: 42 });
    expect(bottom(channelBox(mine))).toBe(230);
  });

  it("puts Game Marketplace at y 148, 40 above, as the frame measured", () => {
    const market = at(placeChannels(), 3);
    expect(market.y).toBe(148);
    expect(CHANNEL_PITCH).toBe(40);
    expect(market.y - at(placeChannels(), 4).y).toBe(-CHANNEL_PITCH);
  });

  it("is 1.5x the row above, the ratio the section states", () => {
    expect(CHANNEL_RATIO).toBe(1.5);
    const rows = placeChannels();
    const ramp = fromSelection(rows);
    for (let i = 1; i < ramp.length; i += 1) {
      expect(at(ramp, i - 1).scale / at(ramp, i).scale).toBeCloseTo(CHANNEL_RATIO, 10);
    }
    expect(channelBox(at(rows, 4)).height / channelBox(at(rows, 3)).height).toBeCloseTo(
      CHANNEL_RATIO,
      10,
    );
  });

  it("reproduces the measured 27px height of Game Marketplace to a pixel", () => {
    // The frame measured y 148-175, so 27. The ratio gives 28, which is the
    // section's own rounding of the pair rather than an error in the ramp.
    expect(channelBox(at(placeChannels(), 3)).height).toBeGreaterThanOrEqual(27);
    expect(channelBox(at(placeChannels(), 3)).height).toBeLessThanOrEqual(28);
  });

  it("runs the rows down the list, one pitch apart, from the top of the ramp", () => {
    const rows = placeChannels();
    for (let i = 1; i < CHANNEL_COUNT; i += 1) {
      expect(at(rows, i).y - at(rows, i - 1).y).toBe(CHANNEL_PITCH);
    }
    expect(at(rows, 0).y).toBe(CHANNEL_TOP - (CHANNEL_COUNT - 1) * CHANNEL_PITCH);
    expect(at(rows, CHANNEL_COUNT - 1).y).toBe(CHANNEL_TOP);
  });

  it("scales down monotonically away from the selection, at any selection", () => {
    for (let selected = 0; selected < CHANNEL_COUNT; selected += 1) {
      const ramp = fromSelection(placeChannels(CHANNELS, selected));
      expect(ramp[0]?.scale, `selected ${selected}`).toBe(1);
      for (let i = 1; i < ramp.length; i += 1) {
        expect(at(ramp, i).scale, `selected ${selected}`).toBeLessThan(at(ramp, i - 1).scale);
      }
    }
  });

  it("dims monotonically away from the selection, at any selection", () => {
    for (let selected = 0; selected < CHANNEL_COUNT; selected += 1) {
      const ramp = fromSelection(placeChannels(CHANNELS, selected));
      expect(at(ramp, 0).alpha, `selected ${selected}`).toBe(1);
      for (let i = 1; i < ramp.length; i += 1) {
        expect(at(ramp, i).alpha, `selected ${selected}`).toBeLessThan(at(ramp, i - 1).alpha);
      }
      expect(
        ramp.map((row) => row.alpha),
        `selected ${selected}`,
      ).toEqual([...CHANNEL_ALPHA]);
    }
  });

  it("never scales a row past the box the frame measured for the largest", () => {
    for (let selected = 0; selected < CHANNEL_COUNT; selected += 1) {
      for (const row of placeChannels(CHANNELS, selected)) {
        expect(row.scale).toBeLessThanOrEqual(1);
        expect(row.scale).toBeGreaterThan(0);
        expect(channelBox(row).height).toBeLessThanOrEqual(CHANNEL_BOX_H);
      }
    }
  });

  it("moves no row at all when the selection changes, only the scale and the fade", () => {
    for (let selected = 0; selected < CHANNEL_COUNT; selected += 1) {
      const rows = placeChannels(CHANNELS, selected);
      expect(
        rows.map((row) => row.y),
        `selected ${selected}`,
      ).toEqual(placeChannels().map((row) => row.y));
    }
  });

  it("leaves the row count and the labels alone when the selection changes", () => {
    for (let selected = 0; selected < CHANNEL_COUNT; selected += 1) {
      const rows = placeChannels(CHANNELS, selected);
      expect(rows, `selected ${selected}`).toHaveLength(CHANNEL_COUNT);
      expect(
        rows.map((row) => row.label),
        `selected ${selected}`,
      ).toEqual([...CHANNELS]);
    }
  });

  it("climbs 1.5x per step, whichever row the selection lands on", () => {
    for (let count = 2; count <= 6; count += 1) {
      for (let selected = 0; selected < count; selected += 1) {
        const ramp = fromSelection(placeChannels(labels(count), selected));
        for (let i = 1; i < ramp.length; i += 1) {
          expect(
            at(ramp, i - 1).scale / at(ramp, i).scale,
            `${count}:${selected}:${i}`,
          ).toBeCloseTo(CHANNEL_RATIO, 10);
        }
      }
    }
  });

  it("wraps the ramp, so a row below the selection is a step out and not a step in", () => {
    // With Inside Xbox selected, My Xbox is one step away round the ring rather
    // than four, which is what keeps every scale inside the largest box.
    const rows = placeChannels(CHANNELS, 0);
    const scale = new Map(rows.map((row) => [row.label, row.scale]));
    expect(scale.get("Inside Xbox")).toBe(1);
    expect(scale.get("Friends")).toBeCloseTo(CHANNEL_RATIO ** -4, 10);
    expect(scale.get("My Xbox")).toBeCloseTo(1 / CHANNEL_RATIO, 10);
  });
});

describe("channelRow", () => {
  it("is the row at that index, with the list running top to bottom", () => {
    const rows = CHANNELS.map((label, d) => channelRow(d, label, 4, CHANNEL_COUNT));
    expect(rows).toEqual(placeChannels());
  });

  it("measures the distance from the selection, not from the top of the list", () => {
    const chosen = channelRow(3, "Game Marketplace", 4, 5);
    expect(chosen.scale).toBeCloseTo(1 / CHANNEL_RATIO, 10);
    expect(chosen.alpha).toBe(CHANNEL_ALPHA[1]);
    expect(chosen.selected).toBe(false);
    expect(channelRow(4, "My Xbox", 4, 5).scale).toBe(1);
  });

  it("puts the selected row at CHANNEL_TOP and stacks the rest above it", () => {
    expect(channelRow(4, "My Xbox", 4, 5).y).toBe(CHANNEL_TOP);
    expect(channelRow(0, "Inside Xbox", 4, 5).y).toBe(CHANNEL_TOP - 4 * CHANNEL_PITCH);
  });

  it("keeps a row inside a lone channel's own pitch", () => {
    const only = channelRow(0, "only", 0, 1);
    expect(only).toEqual({
      d: 0,
      label: "only",
      y: CHANNEL_TOP,
      scale: 1,
      alpha: 1,
      selected: true,
    });
  });

  it("survives a count of zero, which is no channels at all", () => {
    const none = channelRow(0, "x", 0, 0);
    expect(none.scale).toBe(1);
    expect(none.y).toBe(CHANNEL_TOP);
  });
});

describe("channel rows of any length", () => {
  it("keeps a row of any width inside the canvas", () => {
    for (let count = 0; count <= 40; count += 1) {
      for (let selected = 0; selected < Math.max(count, 1); selected += 1) {
        for (const row of placeChannels(labels(count), selected)) {
          const box = channelBox(row);
          expect(box.x, `${count} channels, ${row.label}`).toBeGreaterThanOrEqual(0);
          expect(right(box), `${count} channels, ${row.label}`).toBeLessThanOrEqual(CANVAS_W);
        }
      }
    }
  });

  it("keeps a row of any width from being cut off above the frame", () => {
    // The pitch and the top are both measured, so the frame holds exactly the
    // five channels 9199 has. Anything longer would run off the top, and that is
    // the reason the list is a fixed five rather than the ramp being wrong.
    for (let count = 1; count <= CHANNEL_COUNT; count += 1) {
      for (let selected = 0; selected < count; selected += 1) {
        for (const row of placeChannels(labels(count), selected)) {
          expect(inCanvas(channelBox(row)), `${count} channels, row ${row.d}`).toBe(true);
        }
      }
    }
  });

  it("holds no more channels than the measured pitch leaves room for", () => {
    const fits = Math.floor((CHANNEL_TOP - CHANNEL_BOX_H) / CHANNEL_PITCH) + 2;
    expect(fits).toBeGreaterThanOrEqual(CHANNEL_COUNT);
    expect(CHANNEL_TOP - (CHANNEL_COUNT + 1) * CHANNEL_PITCH).toBeLessThan(0);
  });

  it("never overlaps two rows, at any length or selection", () => {
    for (let count = 0; count <= 40; count += 1) {
      for (let selected = 0; selected < Math.max(count, 1); selected += 1) {
        const rows = placeChannels(labels(count), selected);
        for (let i = 1; i < rows.length; i += 1) {
          const upper = channelBox(at(rows, i - 1));
          const lower = channelBox(at(rows, i));
          expect(lower.y, `${count} channels`).toBeGreaterThanOrEqual(upper.y);
          expect(lower.y, `${count} channels`).toBeLessThanOrEqual(upper.y + CHANNEL_PITCH);
        }
      }
    }
  });

  it("gives a row of a lone channel the whole ramp to itself", () => {
    const only = placeChannels(["only"], 0);
    expect(only).toHaveLength(1);
    expect(only[0]?.selected).toBe(true);
    expect(only[0]?.scale).toBe(1);
    expect(only[0]?.alpha).toBe(1);
  });

  it("draws nothing at all for an empty list, rather than throwing", () => {
    expect(placeChannels([], 0)).toEqual([]);
    expect(placeChannels()).toHaveLength(CHANNEL_COUNT);
  });

  it("survives a selection past the end of the list", () => {
    const rows = placeChannels(CHANNELS, 99);
    expect(rows).toHaveLength(CHANNEL_COUNT);
    expect(rows.filter((row) => row.selected)).toHaveLength(1);
  });

  it("leaves the bullet clear of the label, and both inside the row", () => {
    expect(channelLabelX()).toBe(CHANNEL_X + BULLET_D + BULLET_GAP);
    expect(BULLET_D).toBeGreaterThan(0);
    expect(channelLabelX()).toBeLessThan(CHANNEL_X + CHANNEL_W);
  });
});

describe("the blade stack", () => {
  it("draws one slab per blade other than the focused one", () => {
    expect(SLAB_COUNT).toBe(4);
    expect(placeSlabs(0, BLADE_IDS)).toHaveLength(SLAB_COUNT);
    expect(SLAB_SCALE).toHaveLength(SLAB_COUNT);
    expect(SLAB_TILT).toHaveLength(SLAB_COUNT);
  });

  it("holds four of the five blades, the ones the frame lists as slabs", () => {
    // Section 3.7 names `Games`, `Player1`, `Media` and `Settings` as the slabs.
    expect(SLAB_COUNT).toBe(BLADE_COUNT - 1);
    expect(BLADE_COUNT).toBe(5);
  });

  it("recesses monotonically: the scale falls and the tilt grows, every step", () => {
    for (let i = 1; i < SLAB_COUNT; i += 1) {
      expect(at(SLAB_SCALE, i)).toBeLessThan(at(SLAB_SCALE, i - 1));
      expect(at(SLAB_TILT, i)).toBeGreaterThan(at(SLAB_TILT, i - 1));
      expect(at(SLAB_STEP, i)).toBeLessThanOrEqual(at(SLAB_STEP, i - 1));
    }
  });

  it("puts the first slab against the panel's right edge", () => {
    expect(at(placeSlabs(0, BLADE_IDS), 0).x).toBe(PANEL_X + PANEL_W);
  });

  it("steps right without going back, and leaves a gap", () => {
    const slabs = placeSlabs(0, BLADE_IDS);
    for (let i = 1; i < SLAB_COUNT; i += 1) {
      const inner = at(slabs, i - 1);
      const outer = at(slabs, i);
      expect(outer.x).toBeGreaterThan(inner.x);
      expect(outer.x).toBeGreaterThanOrEqual(slabBox(inner).x + SLAB_W * inner.scale);
    }
  });

  it("scales about the panel's own mid-height, the way the hub scales about 117.5", () => {
    expect(SLAB_PIVOT_Y).toBe(SLAB_H / 2);
    expect(SLAB_H).toBe(PANEL_H);
    for (const slab of placeSlabs(0, BLADE_IDS)) {
      const box = slabBox(slab);
      const middle = box.y + box.height / 2;
      expect(middle).toBeCloseTo(PANEL_Y + SLAB_H / 2, 10);
    }
  });

  it("keeps every slab inside the frame and clear of the panel", () => {
    for (const slab of placeSlabs(0, BLADE_IDS)) {
      const box = slabBox(slab);
      expect(inCanvas(box)).toBe(true);
      expect(box.x).toBeGreaterThanOrEqual(PANEL_X + PANEL_W);
      expect(box.y).toBeGreaterThanOrEqual(PANEL_Y);
      expect(bottom(box)).toBeLessThanOrEqual(PANEL_Y + PANEL_H);
    }
  });

  it("moves no slab when the blade changes, only the ids on them", () => {
    const base = placeSlabs(0, BLADE_IDS);
    for (let focus = 0; focus < BLADE_COUNT; focus += 1) {
      const other = placeSlabs(focus, BLADE_IDS);
      expect(
        other.map((s) => s.x),
        `blade ${focus}`,
      ).toEqual(base.map((s) => s.x));
      expect(
        other.map((s) => s.scale),
        `blade ${focus}`,
      ).toEqual(base.map((s) => s.scale));
    }
  });

  it("labels the slabs off the same ring, so the focused blade is never on one", () => {
    for (let focus = 0; focus < BLADE_COUNT; focus += 1) {
      const slabs = placeSlabs(focus, BLADE_IDS);
      expect(
        slabs.map((s) => s.id),
        `blade ${focus}`,
      ).not.toContain(BLADE_IDS[focus]);
      expect(tabLabel(focus, BLADE_IDS)).toBe(BLADE_IDS[focus]);
    }
  });

  it("shows the Marketplace frame's four slabs when the Marketplace is focused", () => {
    // Section 3.7 lists `Games`, `Player1`, `Media` and `Settings` as the other
    // four. The ring's direction is a composition, so this asserts the set.
    const ids = placeSlabs(1, BLADE_IDS)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["games", "media", "player1", "settings"]);
  });

  it("keeps every slot filled for a short ring, and empty rather than throwing for none", () => {
    for (let count = 1; count <= BLADE_COUNT; count += 1) {
      const short = BLADE_IDS.slice(0, count);
      for (const focus of [0, count - 1, count, -1]) {
        expect(placeSlabs(focus, short), `${count} blades`).toHaveLength(SLAB_COUNT);
      }
    }
    expect(placeSlabs(0, []).map((s) => s.id)).toEqual(["", "", "", ""]);
  });

  it("writes each slab at the panel's height, so a label has a box to sit in", () => {
    for (const slab of placeSlabs(0, BLADE_IDS)) {
      expect(slabOrigin(slab)).toEqual({
        x: slab.x,
        y: PANEL_Y,
        width: SLAB_W,
        height: SLAB_H,
      });
    }
  });

  it("keeps a slab's label inside the slab's authored box", () => {
    for (const slab of placeSlabs(0, BLADE_IDS)) {
      const origin = slabOrigin(slab);
      const inner = within(origin, slabLabelBox(slab));
      expect(inner.x).toBe(SLAB_LABEL_X);
      expect(inner.y).toBeGreaterThan(0);
      expect(inner.x + ROTATED_LINE).toBeLessThanOrEqual(SLAB_W);
    }
  });

  it("keeps the tab's label and the arc inside the tab's width", () => {
    const tabLabelBoxWidth = ROTATED_LINE;
    expect(tabLabelBox().x + tabLabelBoxWidth).toBeLessThanOrEqual(PANEL_X + TAB_W);
    expect(spinnerBox().x).toBeGreaterThanOrEqual(PANEL_X);
    expect(spinnerBox().x + SPINNER_D).toBeLessThanOrEqual(PANEL_X + TAB_W);
    expect(SPINNER_Y).toBeLessThan(TAB_LABEL_Y);
  });

  it("returns a tuple, so a slab count that moved would not compile", () => {
    const slabs: Slabs = placeSlabs(2, BLADE_IDS);
    expect(slabs).toHaveLength(4);
    const slab: Slab = at(slabs, 3);
    expect(slab.scale).toBe(SLAB_SCALE[3]);
  });
});

describe("the prompt row", () => {
  it("shows all four buttons at once, which is what the frame does", () => {
    expect(guidePrompts().map((p) => p.button)).toEqual(["a", "b", "x", "y"]);
    expect(guidePrompts()).toHaveLength(4);
    expect(PROMPT_COUNT).toBe(4);
  });

  it("carries the captions the dashboard wrote, from section 3.7", () => {
    expect(guidePrompts().map((p) => p.label)).toEqual([
      "Select",
      "Back",
      "Sign Out",
      "Xbox Dashboard",
    ]);
  });

  it("has no unlabelled prompt, because all four are captioned here", () => {
    expect(guidePrompts().filter((p) => p.label === null)).toHaveLength(0);
  });

  it("answers with the same array every time, so rendering it allocates nothing", () => {
    expect(guidePrompts()).toBe(guidePrompts());
  });

  it("draws each disc one BUTTON_SIZE deep in the measured band", () => {
    for (let i = 0; i < PROMPT_COUNT; i += 1) {
      const disc = promptDisc(i);
      expect(disc.width).toBe(BUTTON_SIZE);
      expect(disc.height).toBe(BUTTON_SIZE);
      expect(disc.y).toBe(PROMPT_Y);
      expect(disc.y + disc.height).toBe(PROMPT_Y + PROMPT_H);
    }
  });

  it("runs left to right, one cell apart, and never overlaps", () => {
    for (let i = 1; i < PROMPT_COUNT; i += 1) {
      expect(promptDisc(i).x - promptDisc(i - 1).x).toBe(PROMPT_CELL_W);
      expect(promptDisc(i).x).toBeGreaterThanOrEqual(right(promptDisc(i - 1)));
    }
  });

  it("keeps each caption inside its own cell", () => {
    for (let i = 0; i < PROMPT_COUNT; i += 1) {
      const label = promptLabel(i);
      const cell = { x: promptDisc(i).x, y: PROMPT_Y, width: PROMPT_CELL_W, height: PROMPT_H };
      expect(label.x).toBeGreaterThanOrEqual(cell.x);
      expect(right(label)).toBeLessThanOrEqual(right(cell));
      expect(label.height).toBe(PROMPT_H);
      expect(label.width).toBeGreaterThan(0);
    }
  });

  it("centres the row on the canvas, like the panel and the gamerpic", () => {
    const row: Box = {
      x: PROMPT_X,
      y: PROMPT_Y,
      width: PROMPT_CELL_W * PROMPT_COUNT,
      height: PROMPT_H,
    };
    expect(PROMPT_X + row.width / 2).toBe(640);
    expect(row).toEqual({ x: 376, y: 528, width: 528, height: 22 });
  });

  it("sits inside the panel's own width, which is the alignment the clock shows", () => {
    const row: Box = {
      x: PROMPT_X,
      y: PROMPT_Y,
      width: PROMPT_CELL_W * PROMPT_COUNT,
      height: PROMPT_H,
    };
    expect(row.x).toBeGreaterThanOrEqual(PANEL_X);
    expect(right(row)).toBeLessThanOrEqual(PANEL_X + PANEL_W);
  });

  it("puts the clock on the panel's right edge, as the frame measured", () => {
    expect(CLOCK_X + CLOCK_W).toBe(CLOCK_RIGHT);
    expect(CLOCK_RIGHT).toBe(911);
    expect(CLOCK_Y).toBe(176);
    expect(CLOCK_H).toBe(20);
  });
});

describe("the item list", () => {
  it("carries the Marketplace blade's four items, which the frame reads off", () => {
    expect(ITEMS.marketplace).toEqual([
      "Game Marketplace",
      "Video & Music Marketplace",
      "Active Downloads",
      "Redeem Code",
    ]);
  });

  it("draws the same rows whatever the blade shows, so nothing is created", () => {
    for (const shown of [[], ITEMS.marketplace ?? [], ["one", "two"]]) {
      for (let selected = -1; selected <= ITEM_ROWS + 1; selected += 1) {
        expect(placeItems(shown, selected), `${shown.length} items`).toHaveLength(ITEM_ROWS);
      }
    }
  });

  it("leaves a row blank rather than dropping it", () => {
    const rows = placeItems(["only"], 0);
    expect(at(rows, 0).label).toBe("only");
    expect(at(rows, ITEM_ROWS - 1).label).toBe("");
    expect(at(rows, ITEM_ROWS - 1).y).toBe(ITEM_TOP + (ITEM_ROWS - 1) * ITEM_PITCH);
  });

  it("keeps every row and the bar inside the panel", () => {
    const panel: Box = { x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H };
    for (const row of placeItems(ITEMS.marketplace ?? [], 3)) {
      const box = { x: ITEM_X, y: row.y, width: ITEM_BAR_W, height: ITEM_H };
      expect(box.x).toBeGreaterThanOrEqual(panel.x);
      expect(right(box)).toBeLessThanOrEqual(right(panel));
      expect(box.y).toBeGreaterThanOrEqual(panel.y);
      expect(bottom(box)).toBeLessThanOrEqual(bottom(panel));
    }
  });

  it("leaves the down chevron its own space at the panel's bottom right", () => {
    const last = highlightBox(ITEM_ROWS - 1);
    expect(last.x + last.width).toBeLessThan(CHEVRON_BOX.x);
    expect(right(CHEVRON_BOX)).toBeLessThanOrEqual(PANEL_X + PANEL_W);
    expect(bottom(CHEVRON_BOX)).toBeLessThanOrEqual(PANEL_Y + PANEL_H);
  });

  it("moves the bar a whole pitch at a time, so it always lands on a row", () => {
    for (let selected = 0; selected < ITEM_ROWS; selected += 1) {
      const bar = highlightBox(selected);
      expect((bar.y - ITEM_TOP) % ITEM_PITCH).toBe(0);
      expect(bar).toEqual({
        x: ITEM_X,
        y: ITEM_TOP + selected * ITEM_PITCH,
        width: ITEM_BAR_W,
        height: ITEM_H,
      });
    }
  });

  it("does not change the bar's size when the selection moves", () => {
    const first = highlightBox(0);
    for (let selected = 0; selected < ITEM_ROWS; selected += 1) {
      const bar = highlightBox(selected);
      expect(bar.width).toBe(first.width);
      expect(bar.height).toBe(first.height);
      expect(bar.x).toBe(first.x);
    }
  });

  it("always marks exactly one row, moving a bad index to an end", () => {
    for (const selected of [-1, 0, 3, ITEM_ROWS, 99]) {
      const rows = placeItems(ITEMS.marketplace ?? [], selected);
      expect(
        rows.filter((row) => row.selected),
        `item ${selected}`,
      ).toHaveLength(1);
      expect(at(rows, 0).selected, `item ${selected}`).toBe(selected <= 0);
    }
  });

  it("sizes the list text below the channel's, which is the hero of the Guide", () => {
    expect(ITEM_FONT).toBeLessThan(30);
    expect(ITEM_H).toBe(CHANNEL_BOX_H);
  });
});

describe("the chrome", () => {
  // One promoted box has to cover everything the Guide draws, or the compositor
  // clips the part that falls outside the layer.
  it("covers every box the overlay draws", () => {
    for (const box of drawnBoxes()) {
      expect(box.x, JSON.stringify(box)).toBeGreaterThanOrEqual(CHROME.x);
      expect(box.y, JSON.stringify(box)).toBeGreaterThanOrEqual(CHROME.y);
      expect(right(box), JSON.stringify(box)).toBeLessThanOrEqual(right(CHROME));
      expect(bottom(box), JSON.stringify(box)).toBeLessThanOrEqual(bottom(CHROME));
    }
  });

  it("is one box, under half the frame", () => {
    expect(CHROME.width * CHROME.height).toBeLessThan(CANVAS_W * CANVAS_H * 0.5);
  });

  // Every child of the chrome is placed by subtracting the chrome's own origin,
  // and the chrome is itself placed at that origin. If the two ever disagreed
  // the whole Guide would draw off by the difference, silently.
  it("is placed at the origin its own coordinate space assumes", () => {
    expect(inChrome({ x: CHROME.x, y: CHROME.y, width: 1, height: 1 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    // A box comes back out where it went in, and the chrome's own size is what
    // the layer the overlay hands the compositor, so it has to be a real box.
    for (const box of drawnBoxes()) {
      expect(inChrome(box), JSON.stringify(box)).toMatchObject({
        width: box.width,
        height: box.height,
      });
      expect(inChrome(box).x).toBe(box.x - CHROME.x);
      expect(inChrome(box).y).toBe(box.y - CHROME.y);
    }
    expect(CHROME.width).toBeGreaterThan(0);
    expect(CHROME.height).toBeGreaterThan(0);
  });

  it("moves a canvas box into the chrome's own coordinates", () => {
    expect(inChrome({ x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H })).toEqual({
      x: PANEL_X - CHROME.x,
      y: PANEL_Y - CHROME.y,
      width: PANEL_W,
      height: PANEL_H,
    });
    expect(inChrome({ x: CHROME.x, y: CHROME.y, width: 3, height: 4 })).toEqual({
      x: 0,
      y: 0,
      width: 3,
      height: 4,
    });
  });

  it("expresses a child inside its parent, keeping the size", () => {
    const parent: Box = { x: 10, y: 20, width: 30, height: 40 };
    expect(within(parent, { x: 15, y: 25, width: 5, height: 6 })).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 6,
    });
  });

  it("dims the frame to nearly black, and says so in one number", () => {
    expect(DIM_ALPHA).toBeGreaterThan(0.7);
    expect(DIM_ALPHA).toBeLessThanOrEqual(1);
  });
});

describe("the open", () => {
  it("is a rise and a fade, both of them transform and opacity", () => {
    expect(OPEN_RISE).toBeGreaterThan(0);
    expect(OPEN_MS).toBeGreaterThan(0);
    expect(SELECT_MS).toBeGreaterThan(0);
    expect(SELECT_MS).toBeLessThanOrEqual(OPEN_MS);
  });
});

/**
 * The overlay's compiled Vapor render, because "the Guide is always mounted" is
 * the whole of the allocation story and it is a claim about the template rather
 * than about the geometry. Compiling it here is the only way to check it without
 * a compositor, and the compiler is the thing that decides what gets created.
 */
const OVERLAY = (() => {
  const file = resolve(import.meta.dirname, "components/GuideOverlay.vue");
  const { descriptor, errors } = parse(readFileSync(file, "utf8"), { filename: file });
  expect(errors).toEqual([]);
  const source = descriptor.template;
  if (source === null) throw new Error("GuideOverlay.vue has no template");
  const script = compileScript(descriptor, { id: "guide", vapor: true });
  if (script.bindings === undefined) throw new Error("no bindings to compile the template against");
  const template = compileTemplate({
    source: source.content,
    filename: file,
    id: "guide",
    vapor: true,
    compilerOptions: { bindingMetadata: script.bindings },
  });
  expect(template.errors).toEqual([]);
  return template.code;
})();

/** The balanced contents of the parentheses that open at `from`. */
function balanced(code: string, from: number, open: string, close: string): string {
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    if (code[i] === open) depth += 1;
    else if (code[i] === close && (depth -= 1) === 0) return code.slice(from + 1, i);
  }
  return "";
}

/**
 * The body of every call to `call(` in the generated render.
 *
 * The effects nest, and some of them are a braceless arrow, so the arguments are
 * matched on their own parentheses and the braces are then read inside them.
 * A split on either delimiter alone would run past the end of the next one.
 */
function bodies(code: string, call: string): string[] {
  const found: string[] = [];
  for (let from = code.indexOf(call); from !== -1; from = code.indexOf(call, from + 1)) {
    const args = balanced(code, from + call.length - 1, "(", ")");
    found.push(balanced(args, args.indexOf("{"), "{", "}") || args);
  }
  return found;
}

/** The overlay's stylesheet, which the last few rules read. */
const OVERLAY_STYLE =
  readFileSync(resolve(import.meta.dirname, "components/GuideOverlay.vue"), "utf8").split(
    "<style scoped>",
  )[1] ?? "";

describe("the overlay's render", () => {
  it("compiles in vapor mode at all", () => {
    expect(OVERLAY).toContain("export function render");
    expect(OVERLAY).toContain("_template");
  });

  // A `v-if`, a `v-show` or a `Transition` is the only thing in a template that
  // can create or destroy an element on a key press, and each would be a layer
  // appearing mid-transition, which is what tools/gate.mjs fails on.
  it("has no way to create or destroy an element", () => {
    for (const primitive of ["createIf", "vShow", "v-if", "Transition", "KeepAlive", "vHtml"]) {
      expect(OVERLAY, primitive).not.toContain(primitive);
    }
  });

  // Everything the render builds is either a hoisted template or a list over one
  // of the four fixed arrays. No other creating primitive is in there at all, so
  // there is no path by which an element comes into being after the first frame.
  it("creates elements with nothing but a hoisted template and a list", () => {
    expect([...new Set(OVERLAY.match(/_create[A-Z]\w*/g))].sort()).toEqual(["_createFor"]);
  });

  it("reacts by setting an attribute, a style or text, and nothing else", () => {
    // `_setInsertionState` is a static-ordering hint the compiler emits at
    // mount, not a reaction, so it is the one `_set*` that is not one of the
    // three the render is allowed to use inside an effect.
    const setting = new Set(OVERLAY.match(/_set[A-Z]\w*/g));
    setting.delete("_setInsertionState");
    expect([...setting].sort()).toEqual(["_setAttr", "_setStyle", "_setText"]);
  });

  it("calls the insertion-state hint only at mount, never inside an effect", () => {
    const effects = bodies(OVERLAY, "_renderEffect(");
    // Eight effects: the root, the static geometry, the green bar, the chevron,
    // and one inside each of the four lists. If the matcher stopped early this
    // count would fall and the check below would pass on nothing.
    expect(effects).toHaveLength(8);
    expect(effects.filter((body) => body.includes("_setStyle"))).toHaveLength(8);
    for (const body of effects) {
      expect(body, body.slice(0, 80)).not.toContain("_setInsertionState");
    }
  });

  it("renders four lists, which is one per fixed-length array", () => {
    expect(OVERLAY.match(/_createFor\(/g)).toHaveLength(4);
    for (const source of ["_ctx.channels", "_ctx.slabs", "_ctx.rows", "_ctx.prompts"]) {
      expect(OVERLAY, source).toContain(source);
    }
  });

  it("keys the lists on the index, so a selection re-labels rather than rebuilds", () => {
    expect(OVERLAY).toContain("(row) => (row.d)");
    expect(OVERLAY).toContain("(slab) => (slab.d)");
    expect(OVERLAY).toContain("(prompt, i) => (prompt.button)");
  });

  it("takes the open state as one attribute on the root and nothing else", () => {
    expect(OVERLAY).toContain('_setAttr(n29, "data-open", $props.open || undefined)');
  });

  it("hoists one template per element shape, so a shape is built once", () => {
    expect(OVERLAY.match(/const t\d = _template/g)).toHaveLength(5);
  });

  it("transitions only transform and opacity, on every rule that transitions", () => {
    const animated = new Set<string>();
    for (const [, value] of OVERLAY_STYLE.matchAll(/transition:\s*([^;]+);/g)) {
      // Drop the timing functions first, or their commas read as property
      // separators. What is left is one property per comma-separated part.
      for (const part of String(value)
        .replace(/\([^)]*\)/g, "")
        .split(",")) {
        const property = part.trim().split(/\s+/)[0] ?? "";
        if (property !== "" && property !== "none") animated.add(property);
      }
    }
    expect([...animated].sort()).toEqual(["opacity", "transform"]);
  });

  it("keeps the one shadow in the Guide static, on the bar's pseudo-element", () => {
    expect(OVERLAY_STYLE).toContain(".bar::after");
    // The bar itself carries a transform and no shadow, so moving it is free and
    // nothing has to repaint its glow.
    expect(OVERLAY_STYLE).not.toMatch(/\.bar \{[^}]*box-shadow/);
    expect(OVERLAY_STYLE).toMatch(/\.bar \{[^}]*will-change: transform/);
  });

  it("does not use colour-mix or @property, which Chromium 108 does not have", () => {
    expect(OVERLAY_STYLE).not.toContain("color-mix");
    expect(OVERLAY_STYLE).not.toContain("@property");
  });
});
