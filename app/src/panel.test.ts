import { describe, expect, it } from "vitest";

import { artTint, initialsFor, paneArt } from "./panel";

describe("artTint", () => {
  it("washes a hued colour", () => {
    expect(artTint("#4faa6e").top).toBe("rgba(79, 170, 110, 0.38)");
  });
  it("stays neutral for missing, white, black and junk", () => {
    const neutral = artTint(undefined);
    expect(artTint("#FFFFFF")).toEqual(neutral);
    expect(artTint("#000000")).toEqual(neutral);
    expect(artTint("red")).toEqual(neutral);
  });
});

describe("paneArt", () => {
  it("prefers the largest icon", () => {
    expect(
      paneArt({
        id: "a",
        title: "A",
        icon: "/i.png",
        largeIcon: "/l.png",
        extraLargeIcon: "/x.png",
      }),
    ).toBe("hack/x.png");
    expect(paneArt({ id: "a", title: "A", icon: "/i.png", largeIcon: "/l.png" })).toBe(
      "hack/l.png",
    );
    expect(paneArt({ id: "a", title: "A", icon: "/i.png" })).toBe("hack/i.png");
  });

  it("passes remote and inline art through", () => {
    expect(paneArt({ id: "a", title: "A", icon: "https://x/y.png" })).toBe("https://x/y.png");
    expect(paneArt({ id: "a", title: "A", icon: "data:image/png;base64,AA" })).toBe(
      "data:image/png;base64,AA",
    );
  });

  it("gives null for nothing usable", () => {
    expect(paneArt({ id: "a", title: "A" })).toBeNull();
    expect(paneArt({ id: "a", title: "A", icon: "relative.png" })).toBeNull();
  });
});

describe("initialsFor", () => {
  it("takes the first letter, upper-cased", () => {
    expect(initialsFor("  netflix")).toBe("N");
    expect(initialsFor("")).toBe("");
  });
});
