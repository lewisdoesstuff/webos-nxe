import { describe, expect, it } from "vitest";

import { PANE_H, PANE_W } from "./hub";
import {
  BLURB_BOX,
  COUNTER_BOX,
  counterFor,
  FIT,
  initialsFor,
  NAMES_BOX,
  paneZones,
  SCRIM_BOX,
  SHELF_BOX,
  SHELF_SLOT_INDEX,
  SHELF_SLOTS,
  TILE_GAP,
  tileArt,
  TILE_H,
  tileLabel,
  TILE_W,
  TILE_X,
  TITLE_BOX,
  type TileRow,
} from "./panel";

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`nothing at ${index}`);
  return value;
}

const ROW: TileRow = { id: "a", title: "  Netflix  " };

describe("the shelf", () => {
  it("has a fixed slot count, so no tile is ever created by a focus change", () => {
    expect(SHELF_SLOTS).toBe(4);
    expect(SHELF_SLOT_INDEX).toHaveLength(SHELF_SLOTS);
    expect(SHELF_SLOT_INDEX[0]).toBe(0);
    expect(at(SHELF_SLOT_INDEX, SHELF_SLOTS - 1)).toBe(SHELF_SLOTS - 1);
  });

  it("fits four tiles and their gaps exactly in the shelf's interior", () => {
    const tiles = SHELF_SLOTS * TILE_W;
    const gaps = (SHELF_SLOTS - 1) * TILE_GAP;
    expect(tiles + gaps).toBeCloseTo(SHELF_BOX.width, 5);
  });

  it("keeps the measured cover ratio of the 234x320 GameCover archetype", () => {
    expect(TILE_W / TILE_H).toBeCloseTo(78 / 107, 3);
    expect(TILE_W / TILE_H).toBeLessThan(234 / 320);
    expect(TILE_W / TILE_H).toBeGreaterThan(0.7);
  });

  it("steps the tiles along the shelf without going back", () => {
    for (let i = 1; i < TILE_X.length; i += 1) {
      expect(at(TILE_X, i) - at(TILE_X, i - 1)).toBeCloseTo(TILE_W + TILE_GAP, 5);
    }
  });

  it("fits the whole composition inside the pane's own box", () => {
    for (const zone of paneZones()) {
      expect(zone.x, zone.name).toBeGreaterThanOrEqual(0);
      expect(zone.y, zone.name).toBeGreaterThanOrEqual(0);
      expect(zone.x + zone.width, zone.name).toBeLessThanOrEqual(PANE_W + 0.01);
      expect(zone.y + zone.height, zone.name).toBeLessThanOrEqual(PANE_H + 0.01);
    }
  });

  it("is the measured plate composition scaled by one factor", () => {
    expect(FIT).toBeCloseTo(PANE_W / 386, 10);
    expect(SHELF_BOX.height).toBeCloseTo(107 * FIT, 5);
    expect(SCRIM_BOX.y).toBeCloseTo(150 * FIT, 5);
    expect(BLURB_BOX.y).toBeCloseTo(157 * FIT, 5);
    expect(TITLE_BOX.y).toBeCloseTo(191 * FIT, 5);
    expect(NAMES_BOX.y).toBeCloseTo(129 * FIT, 5);
    expect(COUNTER_BOX.y).toBeCloseTo(207 * FIT, 5);
  });

  it("leaves the copy block below the shelf, as the measured plate does", () => {
    expect(SCRIM_BOX.y).toBeGreaterThan(SHELF_BOX.y + SHELF_BOX.height);
    expect(BLURB_BOX.y).toBeGreaterThan(SCRIM_BOX.y);
    expect(TITLE_BOX.y).toBeGreaterThan(BLURB_BOX.y);
  });
});

describe("tileArt", () => {
  it("prefers the large icon over the small one", () => {
    expect(tileArt({ ...ROW, icon: "/a.png", largeIcon: "/b.png" })).toBe("hack/b.png");
  });

  it("sends absolute paths through the hack prefix, since they are outside the app", () => {
    expect(tileArt({ ...ROW, icon: "/a.png" })).toBe("hack/a.png");
    expect(tileArt({ ...ROW, icon: "a.png" })).toBeNull();
    expect(tileArt({ ...ROW, icon: "https://x/a.png" })).toBe("https://x/a.png");
    expect(tileArt({ ...ROW, icon: "data:image/png;base64,AA" })).toBe("data:image/png;base64,AA");
  });

  it("answers null when a row has no artwork at all", () => {
    expect(tileArt(ROW)).toBeNull();
    expect(tileArt({ id: "a", title: "A" })).toBeNull();
  });
});

describe("tileLabel", () => {
  it("trims, and cuts a caption that cannot fit one line", () => {
    expect(tileLabel(ROW.title)).toBe("Netflix");
    expect(tileLabel("01234567890123456789")).toBe("012345678901234567");
  });
});

describe("initialsFor", () => {
  it("takes the first letter, uppercased", () => {
    expect(initialsFor("netflix")).toBe("N");
    expect(initialsFor("  plex")).toBe("P");
  });
});

describe("counterFor", () => {
  it("says nothing when a section is empty, which is the truthful report", () => {
    expect(counterFor(0)).toBe("");
  });

  it("shows the plain count when every row fits", () => {
    expect(counterFor(1)).toBe("1");
    expect(counterFor(SHELF_SLOTS)).toBe("4");
  });

  it("reads like the 2008 footer when it does not", () => {
    expect(counterFor(SHELF_SLOTS + 1)).toBe(`4 of ${SHELF_SLOTS + 1}`);
  });
});
