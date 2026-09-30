import { describe, expect, it } from "vitest";

import { describeApp } from "./appDescriptions";

describe("describeApp", () => {
  it("uses the shipped line for a common app", () => {
    expect(describeApp("netflix", {})).toBe("Instantly watch TV episodes and movies");
  });

  it("prefers the user's text", () => {
    expect(describeApp("netflix", { netflix: "  Movie night " })).toBe("Movie night");
  });

  it("falls back when the user's text is blank", () => {
    expect(describeApp("netflix", { netflix: "   " })).toBe(describeApp("netflix", {}));
  });

  it("has nothing for an unknown app", () => {
    expect(describeApp("org.example.app", {})).toBe("");
  });

  it("describes an unknown app the user has typed for", () => {
    expect(describeApp("org.example.app", { "org.example.app": "Mine" })).toBe("Mine");
  });
});
