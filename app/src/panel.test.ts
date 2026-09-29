import { describe, expect, it } from "vitest";

import { initialsFor, paneArt } from "./panel";

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
