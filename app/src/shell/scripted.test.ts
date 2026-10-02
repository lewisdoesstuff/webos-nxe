import { describe, expect, it } from "vitest";

import { thin } from "./scripted";

describe("thin", () => {
  it("keeps the ends and spaces offsets evenly", () => {
    const frames = Array.from({ length: 13 }, (_, index) => ({ opacity: `${index}` }));
    const kept = thin(frames);
    expect(kept).toHaveLength(7);
    expect(kept[0]).toMatchObject({ opacity: "0", offset: 0 });
    expect(kept.at(-1)).toMatchObject({ opacity: "12", offset: 1 });
  });

  it("always ends on the last frame, whatever the step", () => {
    const frames = Array.from({ length: 11 }, (_, index) => ({ opacity: `${index}` }));
    expect(thin(frames, 3).at(-1)).toMatchObject({ opacity: "10", offset: 1 });
  });

  it("keeps an offset a frame already has", () => {
    const frames = [0, 0.5, 1].map((offset) => ({ opacity: "1", offset }));
    expect(thin(frames, 2).map((frame) => frame.offset)).toEqual([0, 1]);
  });
});
