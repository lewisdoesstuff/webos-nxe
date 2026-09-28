import { describe, expect, it } from "vitest";

import {
  intentForKeyCode,
  isLaunchRelease,
  KEY_CODE,
  LONG_PRESS_MS,
  moveIndex,
  REMOTE_KEY_CODE,
  repeatsWhileHeld,
} from "./grid";

describe("intentForKeyCode", () => {
  it("maps the arrow keys", () => {
    expect(intentForKeyCode(KEY_CODE.left)).toBe("left");
    expect(intentForKeyCode(KEY_CODE.up)).toBe("up");
    expect(intentForKeyCode(KEY_CODE.right)).toBe("right");
    expect(intentForKeyCode(KEY_CODE.down)).toBe("down");
  });

  it("treats both Enter and Space as activate, since the remote's OK is Enter", () => {
    expect(intentForKeyCode(KEY_CODE.enter)).toBe("activate");
    expect(intentForKeyCode(KEY_CODE.space)).toBe("activate");
  });

  it("accepts webOS Back and Escape, as CustomGrid.qml does", () => {
    expect(intentForKeyCode(KEY_CODE.back)).toBe("back");
    expect(intentForKeyCode(KEY_CODE.escape)).toBe("back");
  });

  it("gives the two desktop face buttons the intents the hint bar draws", () => {
    expect(intentForKeyCode(KEY_CODE.y)).toBe("options");
    expect(intentForKeyCode(89)).toBe("options");
    expect(intentForKeyCode(KEY_CODE.x)).toBe("settings");
    expect(intentForKeyCode(88)).toBe("settings");
  });

  it("steps the blade stack on PageUp and PageDown, off the arrows", () => {
    expect(intentForKeyCode(KEY_CODE.pageUp)).toBe("prev-blade");
    expect(intentForKeyCode(33)).toBe("prev-blade");
    expect(intentForKeyCode(KEY_CODE.pageDown)).toBe("next-blade");
    expect(intentForKeyCode(34)).toBe("next-blade");
  });

  it("steps the blade stack on Q and E as well, from the home row", () => {
    expect(intentForKeyCode(KEY_CODE.q)).toBe("prev-blade");
    expect(intentForKeyCode(81)).toBe("prev-blade");
    expect(intentForKeyCode(KEY_CODE.e)).toBe("next-blade");
    expect(intentForKeyCode(69)).toBe("next-blade");
  });

  it("keeps every blade step its own intent, so no key is also an arrow", () => {
    const steps = [33, 34, 69, 81].map(intentForKeyCode);
    expect(new Set(steps).size).toBe(2);
    for (const intent of steps) {
      expect(intent).not.toBe("left");
      expect(intent).not.toBe("right");
    }
  });

  it("matches each coloured remote button to the face button of that colour", () => {
    expect(intentForKeyCode(REMOTE_KEY_CODE.yellow)).toBe("options");
    expect(intentForKeyCode(REMOTE_KEY_CODE.blue)).toBe("settings");
    expect(intentForKeyCode(REMOTE_KEY_CODE.red)).toBe("back");
    expect(intentForKeyCode(REMOTE_KEY_CODE.green)).toBe("activate");
    expect(intentForKeyCode(405)).toBe("options");
    expect(intentForKeyCode(406)).toBe("settings");
    expect(intentForKeyCode(403)).toBe("back");
    expect(intentForKeyCode(404)).toBe("activate");
  });

  it("ignores keys we have no intent for", () => {
    expect(intentForKeyCode(0)).toBeNull();
    expect(intentForKeyCode(773)).toBeNull(); // Home never reaches the page anyway
    expect(intentForKeyCode(9)).toBeNull(); // Tab
    expect(intentForKeyCode(112)).toBeNull(); // F1
    expect(intentForKeyCode(462)).toBeNull(); // Enter on the webOS remote
  });
});

describe("repeatsWhileHeld", () => {
  it("refuses a held key anything that is one press", () => {
    expect(repeatsWhileHeld("activate")).toBe(false);
    expect(repeatsWhileHeld("back")).toBe(false);
    expect(repeatsWhileHeld("options")).toBe(false);
    expect(repeatsWhileHeld("settings")).toBe(false);
  });

  it("lets a held key walk the grid and the blade stack", () => {
    expect(repeatsWhileHeld("left")).toBe(true);
    expect(repeatsWhileHeld("right")).toBe(true);
    expect(repeatsWhileHeld("up")).toBe(true);
    expect(repeatsWhileHeld("down")).toBe(true);
    expect(repeatsWhileHeld("prev-blade")).toBe(true);
    expect(repeatsWhileHeld("next-blade")).toBe(true);
  });
});

describe("moveIndex", () => {
  // Six columns, ten apps: a full row plus a partial one, which is where the
  // edge rules actually get exercised.
  const COLUMNS = 6;
  const COUNT = 10;

  const move = (index: number, direction: Parameters<typeof moveIndex>[3]) =>
    moveIndex(index, COUNT, COLUMNS, direction);

  it("moves one cell left and right", () => {
    expect(move(2, "left")).toBe(1);
    expect(move(2, "right")).toBe(3);
  });

  it("clamps at the very start and end rather than wrapping", () => {
    // keyNavigationWraps is false in the QML, so edges stop.
    expect(move(0, "left")).toBe(0);
    expect(move(COUNT - 1, "right")).toBe(COUNT - 1);
  });

  it("crosses row boundaries left and right, in flow order, as GridView does", () => {
    expect(move(5, "right")).toBe(6); // end of row 0 -> start of row 1
    expect(move(6, "left")).toBe(5);
  });

  it("moves a whole row up and down", () => {
    expect(move(8, "up")).toBe(2);
    expect(move(2, "down")).toBe(8);
  });

  it("clamps vertically at the first row and the last", () => {
    expect(move(3, "up")).toBe(3);
    expect(move(7, "down")).toBe(7); // 13 is past the end, so stay
  });

  it("survives an empty grid and a nonsense index", () => {
    expect(moveIndex(0, 0, COLUMNS, "right")).toBe(0);
    expect(moveIndex(99, COUNT, COLUMNS, "left")).toBe(COUNT - 2);
    expect(moveIndex(-5, COUNT, COLUMNS, "right")).toBe(1);
  });

  it("leaves the cursor put for an intent that names no direction", () => {
    for (const intent of ["activate", "back", "options", "settings"] as const) {
      expect(move(4, intent)).toBe(4);
    }
    expect(move(4, "next-blade")).toBe(4);
    expect(move(4, "prev-blade")).toBe(4);
  });
});

describe("isLaunchRelease", () => {
  it("launches on a short press", () => {
    expect(isLaunchRelease(0)).toBe(true);
    expect(isLaunchRelease(LONG_PRESS_MS - 1)).toBe(true);
  });

  it("does not launch when the press was long enough to open the menu", () => {
    expect(isLaunchRelease(LONG_PRESS_MS)).toBe(false);
    expect(isLaunchRelease(2000)).toBe(false);
  });
});
