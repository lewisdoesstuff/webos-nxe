import { describe, expect, it } from "vitest";

import {
  advancePins,
  counterText,
  FIRST_OFFSET,
  HIDDEN,
  labelSlot,
  LAST_OFFSET,
  PANE_H,
  PANE_W,
  PANE_X,
  PANE_Y,
  paneSlot,
  placePool,
  POOL_SIZE,
  px,
  stepHub,
  type HubState,
} from "./hub";

describe("px", () => {
  it("converts 720p to 1080p once", () => {
    expect(px(420)).toBe(630);
    expect(px(97)).toBe(146);
  });
});

describe("paneSlot", () => {
  it("puts the focused pane on the measured box at full size", () => {
    const slot = paneSlot(0);
    expect(slot).toMatchObject({ x: PANE_X, y: PANE_Y, scale: 1, opacity: 1 });
    expect([PANE_W, PANE_H]).toEqual([630, 480]);
  });

  it("recedes to the right, smaller, rising toward the horizon", () => {
    const spill = [1, 2, 3, 4].map(paneSlot);
    for (let index = 1; index < spill.length; index++) {
      const near = spill[index - 1]!;
      const far = spill[index]!;
      expect(far.scale).toBeLessThan(near.scale);
      expect(far.x).toBeGreaterThan(near.x);
      expect(far.z).toBeLessThan(near.z);
    }
    expect(paneSlot(1).x + PANE_W * paneSlot(1).scale).toBeCloseTo(px(827), -1);
  });

  it("parks panes beyond either end invisibly", () => {
    expect(paneSlot(FIRST_OFFSET).opacity).toBe(HIDDEN);
    expect(paneSlot(LAST_OFFSET).opacity).toBe(HIDDEN);
    expect(paneSlot(FIRST_OFFSET).x).toBeLessThan(0);
  });
});

describe("placePool", () => {
  it("is always the same size, whatever the row", () => {
    for (const count of [0, 1, 3, 25]) {
      for (let focus = 0; focus < Math.max(count, 1); focus++) {
        expect(placePool(focus, count)).toHaveLength(POOL_SIZE);
      }
    }
  });

  it("keeps each element on items congruent to it", () => {
    for (let focus = 0; focus < 20; focus++) {
      for (const pane of placePool(focus, 25)) {
        if (pane.item !== null) expect(pane.item % POOL_SIZE).toBe(pane.element);
      }
    }
  });

  it("changes the content of at most one element per move, and only an invisible one", () => {
    for (let focus = 0; focus < 20; focus++) {
      const before = placePool(focus, 25);
      const after = placePool(focus + 1, 25);
      const changed = after.filter((pane, index) => pane.item !== before[index]!.item);
      expect(changed.length).toBeLessThanOrEqual(1);
      for (const pane of changed) {
        expect(pane.slot.opacity).toBe(HIDDEN);
        expect(before[pane.element]!.slot.opacity).toBe(HIDDEN);
      }
    }
  });

  it("shows the focused item in front and hides items past the row's ends", () => {
    const pool = placePool(0, 3);
    expect(pool.find((pane) => pane.offset === 0)?.item).toBe(0);
    expect(pool.filter((pane) => pane.item !== null)).toHaveLength(3);
    for (const pane of pool) if (pane.item === null) expect(pane.slot.opacity).toBe(HIDDEN);
  });
});

function at(channel: number, item: number): HubState {
  return { channel, item };
}

function elementOf(pool: ReturnType<typeof placePool>, item: number): number | undefined {
  return pool.find((pane) => pane.item === item)?.element;
}

describe("stepHub", () => {
  const counts = [4, 0, 8, 2, 12];

  it("moves along the row and clamps at both ends", () => {
    expect(stepHub(at(4, 0), "right", counts)).toEqual(at(4, 1));
    expect(stepHub(at(4, 0), "left", counts)).toEqual(at(4, 0));
    expect(stepHub(at(4, 11), "right", counts)).toEqual(at(4, 11));
  });

  it("changes channel, clamps, and re-homes the row", () => {
    expect(stepHub(at(4, 7), "up", counts)).toEqual(at(3, 0));
    expect(stepHub(at(0, 2), "up", counts)).toEqual(at(0, 2));
    expect(stepHub(at(4, 3), "down", counts)).toEqual(at(4, 3));
  });

  it("pages with the bumpers, clamped", () => {
    expect(stepHub(at(4, 0), "pageRight", counts)).toEqual(at(4, 5));
    expect(stepHub(at(4, 9), "pageRight", counts)).toEqual(at(4, 11));
    expect(stepHub(at(4, 3), "pageLeft", counts)).toEqual(at(4, 0));
  });

  it("does nothing along an empty row", () => {
    expect(stepHub(at(1, 0), "right", counts)).toEqual(at(1, 0));
  });
});

describe("labelSlot", () => {
  it("is largest and opaque at the selection and fades upward", () => {
    expect(labelSlot(0)).toMatchObject({ scale: 1, opacity: 1 });
    for (let above = 1; above < 5; above++) {
      expect(labelSlot(above).scale).toBeLessThan(labelSlot(above - 1).scale);
      expect(labelSlot(above).opacity).toBeLessThan(labelSlot(above - 1).opacity);
      expect(labelSlot(above).y).toBeLessThan(labelSlot(above - 1).y);
    }
  });

  it("hides channels below the selection", () => {
    expect(labelSlot(-1).opacity).toBe(HIDDEN);
  });
});

describe("counterText", () => {
  it("reads n of m", () => {
    expect(counterText(2, 8)).toBe("3 of 8");
    expect(counterText(0, 0)).toBe("");
  });
});

describe("pinned pool", () => {
  it("keeps a moved item on its element and slides like the modulo rule otherwise", () => {
    const base = placePool(3, 20);
    const pins = new Map<number, number>();
    for (const pane of base) if (pane.item !== null) pins.set(pane.item, pane.element);
    const swapped = new Map(pins).set(3, pins.get(4)!).set(4, pins.get(3)!);
    const moved = placePool(4, 20, undefined, undefined, swapped);
    expect(elementOf(moved, 4)).toBe(elementOf(base, 3));
    expect(elementOf(moved, 3)).toBe(elementOf(base, 4));
    expect(new Set(moved.map((pane) => pane.element)).size).toBe(moved.length);
    const slid = advancePins(swapped, 3, 4);
    expect(new Set(slid.values()).size).toBe(slid.size);
    expect(placePool(5, 20, undefined, undefined, advancePins(new Map(), 4, 5))).toEqual(
      placePool(5, 20),
    );
  });
});
