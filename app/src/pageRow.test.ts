import { describe, expect, it } from "vitest";

import { HIDDEN, placePool } from "./hub";
import {
  PAGE_PANE_H,
  PAGE_PANE_W,
  PAGE_PANE_X,
  PAGE_PANE_Y,
  PAGE_POOL_SIZE,
  pageSlot,
} from "./pageRow";
import { push, stepAlong, stepAlongBy, top, type ListPage } from "./pages";

describe("pageSlot", () => {
  it("puts the focused pane on the measured box", () => {
    expect(pageSlot(0)).toMatchObject({ x: PAGE_PANE_X, y: PAGE_PANE_Y, scale: 1, opacity: 1 });
    expect([PAGE_PANE_W, PAGE_PANE_H]).toEqual([687, 740]);
  });

  it("recedes right, smaller and behind, like the hub row", () => {
    const spill = [1, 2, 3].map(pageSlot);
    for (let index = 1; index < spill.length; index++) {
      expect(spill[index]!.scale).toBeLessThan(spill[index - 1]!.scale);
      expect(spill[index]!.x).toBeGreaterThan(spill[index - 1]!.x);
      expect(spill[index]!.z).toBeLessThan(spill[index - 1]!.z);
    }
    expect(pageSlot(1).x + PAGE_PANE_W * pageSlot(1).scale).toBeCloseTo(1401, -1);
  });

  it("parks panes beyond either end invisibly", () => {
    expect(pageSlot(-1).opacity).toBe(HIDDEN);
    expect(pageSlot(4).opacity).toBe(HIDDEN);
  });
});

describe("the page pool", () => {
  it("is a fixed size whatever the list", () => {
    for (const count of [1, 3, 30]) {
      expect(placePool(0, count, pageSlot, PAGE_POOL_SIZE)).toHaveLength(PAGE_POOL_SIZE);
    }
  });

  it("moves one element's content at most per step", () => {
    const before = placePool(3, 12, pageSlot, PAGE_POOL_SIZE);
    const after = placePool(4, 12, pageSlot, PAGE_POOL_SIZE);
    const changed = before.filter((pane, index) => pane.item !== after[index]!.item);
    expect(changed).toHaveLength(1);
  });

  it("hides slots with no item", () => {
    const pool = placePool(0, 2, pageSlot, PAGE_POOL_SIZE);
    expect(pool.filter((pane) => pane.item !== null)).toHaveLength(2);
    expect(
      pool.filter((pane) => pane.item === null).every((pane) => pane.slot.opacity === HIDDEN),
    ).toBe(true);
  });
});

describe("stepping along a page row", () => {
  const page: ListPage = {
    kind: "list",
    id: "p",
    title: "P",
    groups: [
      {
        id: "g",
        title: "G",
        items: Array.from({ length: 8 }, (_, index) => ({ id: `${index}`, label: `${index}` })),
      },
    ],
  };
  const stack = push([], page);

  it("steps one item and clamps at both ends", () => {
    expect(top(stepAlong(stack, 1))?.focus.item).toBe(1);
    expect(stepAlong(stack, -1)).toBe(stack);
    const end = stepAlongBy(stack, 99);
    expect(top(end)?.focus.item).toBe(7);
    expect(stepAlong(end, 1)).toBe(end);
  });

  it("pages by a run of items", () => {
    expect(top(stepAlongBy(stack, 5))?.focus.item).toBe(5);
  });
});
