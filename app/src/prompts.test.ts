import { describe, expect, it } from "vitest";

import {
  BACK,
  BUTTON_FILL,
  BUTTON_RING,
  BUTTON_SIZE,
  type Button,
  HIDE,
  NO_BACK,
  SELECT,
  promptsFor,
  promptRow,
} from "./prompts";

/** The order the dashboard read them in, which is also the Guide's own row. */
const ORDER: readonly Button[] = ["a", "b", "x", "y"];

/** The four the Guide shows at once, verbatim: A Select, B Back, X Sign Out, Y Xbox Dashboard. */
const GUIDE: Record<Button, string> = {
  a: "Select",
  b: "Back",
  x: "Sign Out",
  y: "Xbox Dashboard",
};

/** A fill and a ring, and the hue the research says each button's is. */
const HUES: readonly (readonly [Button, number])[] = [
  ["a", 109],
  ["b", 358],
  ["x", 210],
  ["y", 48],
];

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i];
    if (head === undefined) continue;
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

function channels(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a hex colour: ${hex}`);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function hue(hex: string): number {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const turns = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (((turns * 60) % 360) + 360) % 360;
}

/** Degrees between two hues, which wrap at 0 and so are not a plain subtraction. */
function apart(hex: string, from: number): number {
  const delta = Math.abs(hue(hex) - from) % 360;
  return Math.min(delta, 360 - delta);
}

/** One channel of sRGB, taken to linear light. */
function lin(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe("promptsFor", () => {
  it("orders the row by button, whatever order the keys were written in", () => {
    const orders = permutations(ORDER);
    expect(orders).toHaveLength(24);
    for (const order of orders) {
      const spec: Partial<Record<Button, string | null>> = {};
      for (const button of order) spec[button] = GUIDE[button];
      expect(promptsFor(spec), order.join("")).toEqual([
        { button: "a", label: "Select" },
        { button: "b", label: "Back" },
        { button: "x", label: "Sign Out" },
        { button: "y", label: "Xbox Dashboard" },
      ]);
    }
  });

  it("leaves the spec it was handed exactly as it found it", () => {
    for (const order of permutations(ORDER)) {
      const spec: Partial<Record<Button, string | null>> = {};
      for (const button of order) spec[button] = GUIDE[button];
      promptsFor(spec);
      expect(Object.keys(spec), order.join("")).toEqual([...order]);
    }
  });

  // A caption of null is a disc the dashboard drew with no word beside it, and
  // a key that is not there is a prompt the dashboard did not draw at all. The
  // two are different facts about a screen, so both survive the spec: dropping
  // the null would leave `label: string | null` with no way to be null.
  it("keeps a button whose caption is null, as a disc with no word", () => {
    expect(promptsFor({ a: "Select", b: null })).toEqual([SELECT, NO_BACK]);
    expect(promptsFor({ b: null })).toEqual([NO_BACK]);
    const row = promptsFor({ a: "Select", b: null });
    expect(row).toHaveLength(2);
    expect(row[1]?.label).toBeNull();
    expect(row[1]?.button).toBe("b");
  });

  it("leaves out every button the spec never named", () => {
    expect(promptsFor({ y: "Marketplace" })).toEqual([{ button: "y", label: "Marketplace" }]);
    expect(promptsFor({ a: "Select" }).map((p) => p.button)).toEqual(["a"]);
    expect(promptsFor({ x: "Theme", b: "Back" }).map((p) => p.button)).toEqual(["b", "x"]);
  });

  it("does not invent a caption for a button that is missing", () => {
    for (const button of ORDER) {
      const spec: Partial<Record<Button, string | null>> = { a: "Select" };
      delete spec[button];
      const labels = promptsFor(spec).map((p) => (p.button === button ? p.label : "Select"));
      expect(labels.includes(null), `${button} came back`).toBe(false);
    }
  });

  it("holds an empty caption as an empty caption rather than a null one", () => {
    const row = promptsFor({ b: "" });
    expect(row).toHaveLength(1);
    expect(row[0]?.button).toBe("b");
    expect(row[0]?.label).toBe("");
  });

  it("yields an empty row for an empty spec, rather than throwing", () => {
    expect(promptsFor({})).toEqual([]);
    expect(() => promptsFor({})).not.toThrow();
  });
});

describe("the named prompts", () => {
  it("gives A the word the dashboard used, which is Select and never OK", () => {
    expect(SELECT.button).toBe("a");
    expect(SELECT.label).toBe("Select");
    expect(SELECT.label).not.toBe("OK");
  });

  it("gives B the word Back on a page with somewhere to go back to", () => {
    expect(BACK.button).toBe("b");
    expect(BACK.label).toBe("Back");
  });

  it("gives X the word Hide for the pane it can put away", () => {
    expect(HIDE.button).toBe("x");
    expect(HIDE.label).toBe("Hide");
  });

  it("leaves B uncaptioned where the dashboard wrote no word", () => {
    expect(NO_BACK.button).toBe("b");
    expect(NO_BACK.label).toBeNull();
  });

  it("keeps A and B on different buttons, so a row can hold both", () => {
    expect(SELECT.button).not.toBe(BACK.button);
    expect(promptRow(SELECT, BACK)).toHaveLength(2);
  });
});

describe("promptRow", () => {
  it("drops the empty slots and keeps the order it was given", () => {
    expect(promptRow(SELECT, null, BACK)).toEqual([SELECT, BACK]);
    expect(promptRow({ button: "y", label: "Marketplace" }, null, NO_BACK)).toEqual([
      { button: "y", label: "Marketplace" },
      NO_BACK,
    ]);
  });

  it("keeps an uncaptioned prompt, because a null slot is not a null caption", () => {
    expect(promptRow(NO_BACK)).toEqual([NO_BACK]);
    expect(promptRow(null, NO_BACK, null)).toEqual([NO_BACK]);
  });

  it("yields nothing when every slot is empty", () => {
    expect(promptRow()).toEqual([]);
    expect(promptRow(null, null)).toEqual([]);
  });
});

describe("the badge colours", () => {
  it("gives every button a fill and a ring", () => {
    for (const button of ORDER) {
      expect(BUTTON_FILL[button], button).toBeTruthy();
      expect(BUTTON_RING[button], button).toBeTruthy();
    }
    expect(Object.keys(BUTTON_FILL).sort()).toEqual([...ORDER]);
    expect(Object.keys(BUTTON_RING).sort()).toEqual([...ORDER]);
  });

  it("gives every button a fill and a ring that differ from each other", () => {
    for (const button of ORDER) {
      expect(BUTTON_FILL[button], button).not.toBe(BUTTON_RING[button]);
    }
  });

  it("tells the four buttons apart, in the fills and in the rings", () => {
    expect(new Set(ORDER.map((b) => BUTTON_FILL[b])).size).toBe(ORDER.length);
    expect(new Set(ORDER.map((b) => BUTTON_RING[b])).size).toBe(ORDER.length);
  });

  // Green, red, blue, yellow: the research fixes the hue, not the hex.
  it("keeps A green, B red, X blue and Y yellow, in both the fill and the ring", () => {
    for (const [button, expected] of HUES) {
      expect(apart(BUTTON_FILL[button], expected), `${button} fill`).toBeLessThan(20);
      expect(apart(BUTTON_RING[button], expected), `${button} ring`).toBeLessThan(20);
    }
  });

  it("rings each badge in something darker than the badge", () => {
    for (const button of ORDER) {
      expect(luminance(BUTTON_FILL[button]), button).toBeGreaterThan(
        luminance(BUTTON_RING[button]),
      );
    }
  });
});

describe("BUTTON_SIZE", () => {
  // The badge as the retail dashboard drew it, against the 32 the shipped
  // assets are authored at. Those are two different numbers and not a scale.
  it("is the 22 the dashboard measured, not the 32 of the assets", () => {
    expect(BUTTON_SIZE).toBe(22);
  });
});
