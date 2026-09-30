import { describe, expect, it } from "vitest";

import { channelPage } from "./hubRows";
import {
  type DialogPage,
  hasMoreBelow,
  type ListPage,
  type Page,
  type PageFocus,
  type PageFrame,
  type PageStack,
  pageBox,
  pagePrompts,
  pageRest,
  shellPrompts,
  type PageItem,
  pop,
  push,
  restBox,
  ROOT_FOCUS,
  ROW_H,
  ROW_SLOTS,
  rows,
  scrollTop,
  stepHorizontal,
  stepVertical,
  stepVerticalBy,
  textureMb,
  trackOffset,
  CLIPPED_ROW,
  DRILL_EASE_IN,
  DRILL_EASE_OUT,
  FOOT_H,
  HUB_PANEL_BOX,
  HUB_PANEL_Y,
  HEADER_H,
  LIST_H,
  PAGE_H,
  PAGE_W,
  PAGE_X,
  PAGE_Y,
  TRACK_H,
  WHOLE_ROWS,
  counterText,
  groupTitle,
  maxScroll,
  rowCount,
  type Row,
} from "./pages";
import { BACK, SELECT } from "./prompts";
import { PANEL_H as HUB_PANEL_H, PANEL_W as HUB_PANEL_W, PANEL_X as HUB_PANEL_X } from "./ribbon";

/** An element by a running index, which the compiler will not narrow for us. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`nothing at ${index}`);
  return value;
}

function entry(id: string, label = id): PageItem {
  return { id, label };
}

function entries(...ids: string[]): PageItem[] {
  return ids.map((id) => entry(id));
}

/** A long list, so the window has something to scroll and clip. */
function many(count: number): PageItem[] {
  return Array.from({ length: count }, (_, i) => entry(`item-${i}`, `Item ${i}`));
}

const THREE_GROUPS: ListPage = {
  kind: "list",
  id: "themes",
  title: "Select Theme",
  x: "Theme",
  y: "Marketplace",
  groups: [
    { id: "basic", title: "Basic", items: entries("plain", "mono", "dark") },
    { id: "arcade", title: "Arcade", items: many(40) },
    { id: "solo", title: "Solo", items: entries("only") },
  ],
};

const FITS: ListPage = {
  kind: "list",
  id: "short",
  title: "Short",
  groups: [{ id: "one", title: "One", items: entries("a", "b", "c") }],
};

const EXIT: DialogPage = {
  kind: "dialog",
  id: "exit",
  title: "Would you like to exit and return to the dashboard?",
  y: "Marketplace",
  options: [
    { id: "yes", label: "Yes, don't ask" },
    { id: "no", label: "No, take it back" },
  ],
  back: "no",
};

const NO_BACK: DialogPage = {
  kind: "dialog",
  id: "network",
  title: "No Network Connection",
  options: [
    { id: "settings", label: "Change Network Settings" },
    { id: "back", label: "Back" },
  ],
  back: "back",
};

const LIST_PAGES: readonly Page[] = [THREE_GROUPS, FITS];
const ALL_PAGES: readonly Page[] = [...LIST_PAGES, EXIT, NO_BACK];

/** The prompt row as [button, caption] pairs, which is how the assertions read. */
function labels(stack: PageStack): [string, string][] {
  return pagePrompts(stack).map((prompt) => [prompt.button, prompt.label ?? ""]);
}

/** The shell's row the same way, so its assertions read the same way. */
function shellLabels(guideOpen: boolean, stack: PageStack, canHide = false): [string, string][] {
  return shellPrompts(guideOpen, stack, canHide).map((prompt) => [
    prompt.button,
    prompt.label ?? "",
  ]);
}

function focus(group: number, row: number): PageFocus {
  return { group, item: row };
}

/** A stack with one page open, optionally already part-way through it. */
function open(page: Page, start: PageFocus = ROOT_FOCUS): PageStack {
  return start === ROOT_FOCUS ? push([], page) : [{ page, focus: start }];
}

/** The frame on top of the stack, which is the one the user is looking at. */
function frame(stack: PageStack): PageFrame {
  return at(stack, stack.length - 1);
}

/**
 * How much of a row is inside the window, which is what "clipped" means. The
 * window is 211 tall, the track is nudged by `trackOffset`, and a row that
 * starts below the window shows nothing at all.
 */
function visible(row: Row, page: Page, where: PageFocus): number {
  const top = row.y - trackOffset(page, where);
  return Math.max(0, Math.min(top + ROW_H, LIST_H) - Math.max(top, 0));
}

describe("the page's box", () => {
  it("is the panel the Guide measured, not the frame", () => {
    expect(PAGE_W).toBe(544);
    expect(PAGE_H).toBe(315);
    expect(PAGE_X).toBe(368);
    expect(PAGE_Y).toBe(200);
  });

  it("is horizontally centred on the canvas", () => {
    expect(PAGE_X * 2 + PAGE_W).toBe(1280);
  });

  it("is nowhere near the frame, which is the whole point of the drill", () => {
    const box = pageBox();
    expect(textureMb(box, 2)).toBeLessThan(textureMb({ x: 0, y: 0, width: 1920, height: 1080 }, 2));
  });

  it("costs 2.61MiB on a dpr 2 panel and 0.65MiB at the canvas", () => {
    const box = pageBox();
    expect(textureMb(box)).toBeCloseTo(0.65, 2);
    expect(textureMb(box, 2)).toBeCloseTo(2.61, 2);
  });

  it("spends 2.61MiB of a 311MB frame where a cross-fade of two full frames spends 63.3MiB", () => {
    const one = textureMb(pageBox(), 2);
    const full = textureMb({ x: 0, y: 0, width: 1920, height: 1080 }, 2);
    expect(full).toBeCloseTo(31.64, 2);
    expect(one / full).toBeCloseTo(0.0826, 3);
    expect((2 * one) / 311).toBeLessThan(0.02);
  });
});

describe("the page's bands", () => {
  it("fills the panel with two measured heights and the remainder", () => {
    expect(HEADER_H + LIST_H + FOOT_H).toBe(PAGE_H);
    expect(FOOT_H).toBe(39);
  });

  // NXE-BOOT-INPUT.md section 3.5: the window ends on a partially clipped item
  // rather than snapping to a whole one. That is a window height which is not a
  // whole number of rows, and nothing more.
  it("clips its last visible row, which is the detail worth copying", () => {
    expect(LIST_H % ROW_H).not.toBe(0);
    expect(WHOLE_ROWS * ROW_H + CLIPPED_ROW).toBe(LIST_H);
    expect(WHOLE_ROWS).toBe(5);
    expect(CLIPPED_ROW).toBe(11);
  });

  it("draws a whole number of slots whatever the list holds", () => {
    expect(ROW_SLOTS).toBe(Math.ceil(LIST_H / ROW_H) + 1);
    expect(ROW_SLOTS).toBe(7);
    expect(TRACK_H).toBe(ROW_SLOTS * ROW_H);
  });
});

describe("pageRest and restBox", () => {
  it("puts a closed surface on the hub panel", () => {
    const box = restBox();
    expect(box.x).toBeCloseTo(HUB_PANEL_BOX.x, 3);
    expect(box.y).toBeCloseTo(HUB_PANEL_BOX.y, 3);
    expect(box.width).toBeCloseTo(HUB_PANEL_BOX.width, 3);
    expect(box.height).toBeCloseTo(HUB_PANEL_BOX.height, 3);
  });

  it("scales the surface by the hub panel's own size", () => {
    const rest = pageRest();
    expect(rest.scaleX).toBeCloseTo(HUB_PANEL_W / PAGE_W, 3);
    expect(rest.scaleY).toBeCloseTo(HUB_PANEL_H / PAGE_H, 3);
    expect(PAGE_W * rest.scaleX).toBeCloseTo(HUB_PANEL_W, 3);
    expect(PAGE_H * rest.scaleY).toBeCloseTo(HUB_PANEL_H, 3);
  });

  // The surface's bounds are unaffected by a transform, which is what makes the
  // drill free, so the scale must reach the resting box and the translate the
  // rest of it.
  it("lands the surface's corner on the hub panel's corner", () => {
    const rest = pageRest();
    expect(PAGE_X + rest.originX * (1 - rest.scaleX) + rest.dx).toBeCloseTo(HUB_PANEL_X, 3);
    expect(PAGE_Y + rest.originY * (1 - rest.scaleY) + rest.dy).toBeCloseTo(HUB_PANEL_Y, 3);
  });

  it("pivots on the hub panel's own centre, so the surface grows out of it", () => {
    const rest = pageRest();
    expect(rest.originX).toBeCloseTo(HUB_PANEL_X + HUB_PANEL_W / 2 - PAGE_X, 6);
    expect(rest.originY).toBeCloseTo(HUB_PANEL_Y + HUB_PANEL_H / 2 - PAGE_Y, 6);
  });

  it("rests on any box it is given, not only the hub panel's", () => {
    const hub = { x: 10, y: 20, width: 300, height: 200 };
    const box = restBox(hub);
    expect(box.x).toBeCloseTo(10, 3);
    expect(box.y).toBeCloseTo(20, 3);
    expect(box.width).toBeCloseTo(300, 3);
    expect(box.height).toBeCloseTo(200, 3);
  });
});

describe("the drill's easing", () => {
  it("is the two families the scene file holds, mirrored", () => {
    expect(DRILL_EASE_IN).toBe("cubic-bezier(0.215, 0.61, 0.355, 1)");
    expect(DRILL_EASE_OUT).toBe("cubic-bezier(0, 0.645, 0.39, 0.785)");
  });
});

describe("push and pop", () => {
  it("opens a page with the focus at the first group and the first row", () => {
    const stack = push([], THREE_GROUPS);
    expect(stack).toHaveLength(1);
    expect(frame(stack).focus).toEqual(ROOT_FOCUS);
  });

  it("nests, and pops one level at a time", () => {
    let stack = open(THREE_GROUPS);
    stack = push(stack, FITS);
    expect(stack).toHaveLength(2);
    stack = pop(stack);
    expect(stack).toHaveLength(1);
    expect(frame(stack).page).toBe(THREE_GROUPS);
  });

  // NXE-BOOT-INPUT.md section 3.3. B backs out one level. One reviewer reported
  // the shipped build jumping to the root instead, which the same section calls
  // a bug and says not to build.
  it("backs out one level rather than to the root", () => {
    const stack = push(push(push([], THREE_GROUPS), FITS), EXIT);
    expect(stack).toHaveLength(3);
    expect(pop(stack)).toHaveLength(2);
    expect(frame(pop(stack)).page).toBe(FITS);
  });

  it("keeps each page's own focus, so returning does not lose the place", () => {
    let stack = open(THREE_GROUPS, focus(1, 12));
    stack = push(stack, FITS);
    stack = pop(stack);
    expect(frame(stack).focus).toEqual(focus(1, 12));
  });

  it("closes the last page to an empty stack, which is the hub", () => {
    expect(pop(open(FITS))).toEqual([]);
  });

  it("returns the same stack when there is nothing left to close", () => {
    const empty: PageStack = [];
    expect(pop(empty)).toBe(empty);
  });
});

describe("up and down within a page", () => {
  it("moves along the page's own list", () => {
    const stack = open(FITS);
    expect(frame(stepVertical(stack, 1)).focus.item).toBe(1);
    expect(frame(stepVertical(stepVertical(stack, 1), 1)).focus.item).toBe(2);
  });

  // Section 3.6: a rightward run read off retail 9199 held at the end, and a
  // clamping list is a corollary of there being an end to end on.
  it("clamps at the last row rather than wrapping to the first", () => {
    let stack = open(FITS, focus(0, 2));
    for (let press = 0; press < 5; press += 1) stack = stepVertical(stack, 1);
    expect(frame(stack).focus.item).toBe(2);
  });

  it("clamps at the first row", () => {
    let stack = open(FITS);
    for (let press = 0; press < 5; press += 1) stack = stepVertical(stack, -1);
    expect(frame(stack).focus.item).toBe(0);
  });

  // A clamped step returns the same stack reference, so the parent's ref never
  // moves and the surface never repaints for a press that went nowhere.
  it("returns the same stack at the ends, so nothing repaints", () => {
    const first = open(FITS);
    expect(stepVertical(first, -1)).toBe(first);

    const last = open(FITS, focus(0, 2));
    expect(stepVertical(last, 1)).toBe(last);
    expect(stepHorizontal(last, 1)).toBe(last);
  });

  it("returns a new stack when it does move", () => {
    const stack = open(FITS);
    expect(stepVertical(stack, 1)).not.toBe(stack);
  });

  it("does not move the group, because up and down are within a list", () => {
    const stack = open(THREE_GROUPS, focus(2, 0));
    expect(frame(stepVertical(stack, 1)).focus.group).toBe(2);
  });

  it("clamps to the rows the focused group actually has", () => {
    const stack = open(THREE_GROUPS, focus(2, 0));
    expect(frame(stepVertical(stack, 1)).focus.item).toBe(0);
  });

  // Channel +/- pages by a window, which is a multi-row vertical step and
  // clamps the same way a single step does. `stepFocus` reads its delta as a
  // direction, so paging has its own step.
  it("pages by a window and clamps at the ends", () => {
    const stack = open(THREE_GROUPS, focus(1, 0));
    expect(frame(stepVerticalBy(stack, WHOLE_ROWS)).focus.item).toBe(WHOLE_ROWS);
    expect(frame(stepVerticalBy(stack, -WHOLE_ROWS)).focus.item).toBe(0);
    const short = open(FITS, focus(0, 0));
    expect(frame(stepVerticalBy(short, WHOLE_ROWS)).focus.item).toBe(2);
    const end = open(FITS, focus(0, 2));
    expect(stepVerticalBy(end, WHOLE_ROWS)).toBe(end);
    const start = open(FITS);
    expect(stepVerticalBy(start, -WHOLE_ROWS)).toBe(start);
  });

  it("survives a group with no rows at all", () => {
    const empty: ListPage = {
      kind: "list",
      id: "empty",
      title: "Empty",
      groups: [{ id: "none", title: "None", items: [] }],
    };
    const stack = open(empty);
    expect(frame(stepVertical(stack, 1)).focus.item).toBe(0);
    expect(frame(stepVertical(stack, -1)).focus.item).toBe(0);
  });

  it("leaves an empty stack alone", () => {
    expect(stepVertical([], 1)).toEqual([]);
  });
});

describe("left and right between groups", () => {
  it("pages to the next group", () => {
    const stack = open(THREE_GROUPS);
    expect(frame(stepHorizontal(stack, 1)).focus.group).toBe(1);
    expect(frame(stepHorizontal(stepHorizontal(stack, 1), 1)).focus.group).toBe(2);
  });

  it("clamps at the last group rather than wrapping", () => {
    let stack = open(THREE_GROUPS, focus(2, 0));
    for (let press = 0; press < 4; press += 1) stack = stepHorizontal(stack, 1);
    expect(frame(stack).focus.group).toBe(2);
  });

  it("clamps at the first group", () => {
    let stack = open(THREE_GROUPS);
    for (let press = 0; press < 4; press += 1) stack = stepHorizontal(stack, -1);
    expect(frame(stack).focus.group).toBe(0);
  });

  it("re-homes the row, because a new group has its own list", () => {
    const stack = open(THREE_GROUPS, focus(0, 2));
    expect(frame(stepHorizontal(stack, 1)).focus.item).toBe(0);
  });

  it("holds the counter that reads position in the focused group's rows", () => {
    expect(counterText(THREE_GROUPS, focus(0, 0))).toBe("1 of 3");
    expect(counterText(THREE_GROUPS, focus(0, 2))).toBe("3 of 3");
    expect(counterText(THREE_GROUPS, focus(1, 0))).toBe("1 of 40");
    expect(counterText(THREE_GROUPS, focus(2, 0))).toBe("1 of 1");
  });

  it("counts the rows rather than the groups, so a one-group page still counts", () => {
    const one = channelPage("apps", [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ]);
    expect(one.groups).toHaveLength(1);
    expect(counterText(one, focus(0, 0))).toBe("1 of 3");
    expect(counterText(one, focus(0, 2))).toBe("3 of 3");
  });

  it("survives a focus outside the page", () => {
    expect(counterText(THREE_GROUPS, focus(0, 9))).toBe("3 of 3");
    expect(counterText(THREE_GROUPS, focus(2, -4))).toBe("1 of 1");
  });

  it("names the focused group, and nothing at all on a dialog", () => {
    expect(groupTitle(THREE_GROUPS, focus(0, 0))).toBe("Basic");
    expect(groupTitle(THREE_GROUPS, focus(1, 0))).toBe("Arcade");
    expect(groupTitle(THREE_GROUPS, focus(9, 0))).toBe("Solo");
    expect(groupTitle(EXIT, focus(0, 0))).toBe("");
  });
});

describe("the fixed-height list", () => {
  it("stands five rows whole and cuts the sixth", () => {
    const page = THREE_GROUPS;
    const at0 = focus(0, 0);
    const list = rows(page, at0);
    for (let slot = 0; slot < WHOLE_ROWS; slot += 1) {
      expect(visible(at(list, slot), page, at0), `slot ${slot}`).toBe(ROW_H);
    }
    expect(visible(at(list, WHOLE_ROWS), page, at0)).toBe(CLIPPED_ROW);
    expect(visible(at(list, WHOLE_ROWS), page, at0)).toBeLessThan(ROW_H);
  });

  it("fills the window exactly, so there is no gap under the clip", () => {
    const page = THREE_GROUPS;
    const at0 = focus(0, 0);
    const shown = rows(page, at0).reduce((sum, row) => sum + visible(row, page, at0), 0);
    expect(shown).toBe(LIST_H);
  });

  it("is the same height for a list of 3 and a list of 40", () => {
    for (const page of LIST_PAGES) {
      if (page.kind !== "list") continue;
      for (let group = 0; group < page.groups.length; group += 1) {
        const at0 = focus(group, 0);
        const shown = rows(page, at0).reduce((sum, row) => sum + visible(row, page, at0), 0);
        expect(shown, `${page.id} group ${group}`).toBe(LIST_H);
      }
    }
  });

  // A v-for over the list would change the element count and allocate inside a
  // move, which is how the ribbon lost a blade mid-transition.
  it("draws the same number of rows whatever the list holds", () => {
    for (const page of ALL_PAGES) {
      for (const at0 of [focus(0, 0), focus(1, 20), focus(2, 39), focus(0, 5)]) {
        expect(rows(page, at0), `${page.id} at ${at0.group}/${at0.item}`).toHaveLength(ROW_SLOTS);
      }
    }
  });

  it("draws the surplus slots blank rather than absent", () => {
    const list = rows(FITS, focus(0, 0));
    expect(list[3]?.label).toBe("");
    expect(list[ROW_SLOTS - 1]?.label).toBe("");
    expect(list[0]?.label).toBe("a");
  });

  it("steps the whole list a row at a time", () => {
    expect(scrollTop(THREE_GROUPS, focus(1, 0))).toBe(0);
    expect(scrollTop(THREE_GROUPS, focus(1, 1))).toBe(ROW_H);
    expect(scrollTop(THREE_GROUPS, focus(1, 5))).toBe(200);
  });

  it("stops at the bottom of the list", () => {
    const bottom = maxScroll(THREE_GROUPS, focus(1, 0));
    expect(bottom).toBe(40 * 40 - LIST_H);
    expect(scrollTop(THREE_GROUPS, focus(1, 39))).toBe(bottom);
  });

  // A clamped group step must not re-home the row either, or a press at the
  // last group would throw away the user's place for nothing.
  it("does not re-home the row when the group cannot move", () => {
    const only = open(FITS, focus(0, 2));
    expect(stepHorizontal(only, 1)).toBe(only);
    expect(stepHorizontal(only, -1)).toBe(only);
  });

  it("keeps the focused row inside the window at every position", () => {
    for (const page of ALL_PAGES) {
      for (const at0 of [ROOT_FOCUS, focus(1, 0), focus(2, 0)]) {
        for (let item0 = 0; item0 < rowCount(page, at0); item0 += 1) {
          const at1 = { group: at0.group, item: item0 };
          const row = rows(page, at1).find((r) => r.focused);
          expect(row, `${page.id} ${at0.group}/${item0}`).toBeDefined();
          if (row === undefined) continue;
          const shown = visible(row, page, at1);
          expect(shown, `${page.id} row ${item0}`).toBeGreaterThan(0);
          expect(shown, `${page.id} row ${item0}`).toBeLessThanOrEqual(ROW_H);
        }
      }
    }
  });

  it("shows a stale focus as an ordinary list rather than throwing", () => {
    const past = focus(0, 99);
    expect(rows(THREE_GROUPS, past)).toHaveLength(ROW_SLOTS);
    expect(scrollTop(THREE_GROUPS, past)).toBe(maxScroll(THREE_GROUPS, past));
  });

  it("nudges the track by less than a row, so the track never resizes", () => {
    for (const page of ALL_PAGES) {
      for (let item0 = 0; item0 < 40; item0 += 1) {
        const offset = trackOffset(page, focus(0, item0));
        expect(offset, `${page.id} ${item0}`).toBeGreaterThanOrEqual(0);
        expect(offset, `${page.id} ${item0}`).toBeLessThan(ROW_H);
      }
    }
  });

  it("puts the next item into slot 0 as the list steps", () => {
    expect(rows(THREE_GROUPS, focus(1, 3))[0]?.label).toBe("Item 3");
    expect(rows(THREE_GROUPS, focus(1, 4))[0]?.label).toBe("Item 4");
  });

  it("does not scroll a list that fits", () => {
    expect(maxScroll(FITS, focus(0, 0))).toBe(0);
    expect(scrollTop(FITS, focus(0, 2))).toBe(0);
    expect(trackOffset(FITS, focus(0, 2))).toBe(0);
  });
});

describe("the chevron", () => {
  it("shows while there is more below, which is the measured condition", () => {
    expect(hasMoreBelow(THREE_GROUPS, focus(1, 0))).toBe(true);
    expect(hasMoreBelow(THREE_GROUPS, focus(1, 10))).toBe(true);
  });

  it("goes when there is nothing more below", () => {
    expect(hasMoreBelow(THREE_GROUPS, focus(1, 39))).toBe(false);
  });

  it("never shows for a list that fits", () => {
    expect(hasMoreBelow(FITS, focus(0, 0))).toBe(false);
    expect(hasMoreBelow(FITS, focus(0, 2))).toBe(false);
  });
});

describe("a dialog", () => {
  it("has no list, so it does not scroll", () => {
    expect(maxScroll(EXIT, focus(0, 1))).toBe(0);
    expect(scrollTop(EXIT, focus(0, 1))).toBe(0);
    expect(trackOffset(EXIT, focus(0, 1))).toBe(0);
  });

  it("has no groups, so left and right do nothing", () => {
    const stack = open(EXIT);
    expect(stepHorizontal(stack, 1)).toBe(stack);
    expect(stepHorizontal(stack, -1)).toBe(stack);
  });

  it("has no counter, because there is nothing to page between", () => {
    expect(counterText(EXIT, focus(0, 0))).toBe("");
  });

  it("never shows the chevron", () => {
    expect(hasMoreBelow(EXIT, focus(0, 0))).toBe(false);
  });

  it("moves up and down between its options and clamps", () => {
    let stack = open(EXIT);
    stack = stepVertical(stack, 1);
    expect(frame(stack).focus.item).toBe(1);
    stack = stepVertical(stack, 1);
    expect(frame(stack).focus.item).toBe(1);
    expect(frame(stepVertical(open(EXIT), -1)).focus.item).toBe(0);
  });

  it("draws its options in the same slots a list would use", () => {
    const list = rows(EXIT, focus(0, 0));
    expect(list[0]?.label).toBe("Yes, don't ask");
    expect(list[0]?.focused).toBe(true);
    expect(list[1]?.label).toBe("No, take it back");
    expect(list[1]?.focused).toBe(false);
    expect(list[2]?.label).toBe("");
  });
});

describe("the prompt row", () => {
  it("is Select and Back on a list page, in A then B order", () => {
    expect(labels(open(THREE_GROUPS))).toEqual([
      ["a", "Select"],
      ["b", "Back"],
      ["x", "Theme"],
      ["y", "Marketplace"],
    ]);
    expect(SELECT.label).toBe("Select");
    expect(BACK.label).toBe("Back");
  });

  it("leaves out an X or Y the page authored no caption for", () => {
    expect(labels(open(FITS))).toEqual([
      ["a", "Select"],
      ["b", "Back"],
    ]);
  });

  // Section 3.4: on a dialog A is captioned the option's own text, not "Select",
  // and B is captioned with the option that closes it.
  it("captions a dialog's buttons with the options' own text", () => {
    expect(labels(open(EXIT))).toEqual([
      ["a", "Yes, don't ask"],
      ["b", "No, take it back"],
    ]);
  });

  it("moves the A caption with the focused option", () => {
    expect(labels(open(EXIT, focus(0, 1)))[0]).toEqual(["a", "No, take it back"]);
  });

  // The no-network dialog's B is labelled "Back" and is not the negative answer.
  it("takes a B option labelled Back where the dialog wrote one", () => {
    expect(labels(open(NO_BACK))).toEqual([
      ["a", "Change Network Settings"],
      ["b", "Back"],
    ]);
  });

  it("falls back to the last option when the back option is not in the list", () => {
    const broken: DialogPage = { ...EXIT, back: "missing" };
    expect(labels(open(broken))[1]).toEqual(["b", "No, take it back"]);
  });

  it("is empty at the hub root, where the dashboard drew no prompt at all", () => {
    expect(pagePrompts([])).toEqual([]);
  });
});

describe("the shell's prompt row", () => {
  it("is A Select and nothing else at the hub root", () => {
    expect(shellLabels(false, [])).toEqual([["a", "Select"]]);
  });

  it("is the open page's own row with a page open", () => {
    expect(shellLabels(false, open(FITS))).toEqual([
      ["a", "Select"],
      ["b", "Back"],
    ]);
  });

  it("adds X Hide at the root where the focused pane can leave the row", () => {
    expect(shellLabels(false, [], true)).toEqual([
      ["a", "Select"],
      ["x", "Hide"],
      ["y", "Move"],
    ]);
  });

  it("never adds X Hide to a page row or under the Guide", () => {
    expect(shellLabels(false, open(FITS), true)).toEqual([
      ["a", "Select"],
      ["b", "Back"],
    ]);
    expect(shellPrompts(true, [], true)).toEqual([]);
    expect(shellPrompts(true, open(FITS), true)).toEqual([]);
  });

  it("offers Move beside Hide, and Place and Cancel while a pane is held", () => {
    expect(shellPrompts(false, [], true).map((prompt) => prompt.button)).toEqual(["a", "x", "y"]);
    expect(shellPrompts(false, [], true, true).map((prompt) => prompt.label)).toEqual([
      "Place",
      "Cancel",
    ]);
  });

  it("draws nothing with the Guide open, which carries its own row", () => {
    expect(shellPrompts(true, [])).toEqual([]);
    expect(shellPrompts(true, open(FITS))).toEqual([]);
  });
});

describe("every page at once", () => {
  it("holds a fixed slot count and a fixed box for the whole set", () => {
    for (const page of ALL_PAGES) {
      for (const at0 of [ROOT_FOCUS, focus(1, 0), focus(1, 1), focus(2, 2)]) {
        expect(rows(page, at0), `${page.id} ${at0.item}`).toHaveLength(ROW_SLOTS);
        expect(pageBox()).toEqual({ x: PAGE_X, y: PAGE_Y, width: PAGE_W, height: PAGE_H });
      }
    }
  });

  it("keeps every scroll and every focus in range under a long run of presses", () => {
    for (const page of ALL_PAGES) {
      let stack = open(page);
      for (let press = 0; press < 60; press += 1) {
        stack = stepVertical(
          stepHorizontal(stack, press % 3 === 0 ? 1 : -1),
          press % 2 === 0 ? 1 : -1,
        );
        const { focus: f } = frame(stack);
        expect(f.group, page.id).toBeGreaterThanOrEqual(0);
        expect(scrollTop(page, f), page.id).toBeLessThanOrEqual(maxScroll(page, f));
        expect(rows(page, f), page.id).toHaveLength(ROW_SLOTS);
      }
    }
  });
});
