import { describe, expect, it } from "vitest";

import { hashId, lookFor } from "./look";

describe("lookFor", () => {
  it("is the same for the same id", () => {
    expect(lookFor("76561198057794205")).toEqual(lookFor("76561198057794205"));
  });

  it("differs between ids", () => {
    const looks = new Set(
      Array.from({ length: 40 }, (_, i) => JSON.stringify(lookFor(`7656119800000${i}`))),
    );
    expect(looks.size).toBe(40);
  });

  it("keeps every colour in range", () => {
    for (let i = 0; i < 200; i += 1) {
      const look = lookFor(String(i * 7919));
      for (const colour of [look.skin, look.hair, look.shirt, look.trousers, look.shoes]) {
        expect(colour).toBeGreaterThanOrEqual(0);
        expect(colour).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it("hashes stably", () => {
    expect(hashId("a")).toBe(hashId("a"));
    expect(hashId("a")).not.toBe(hashId("b"));
  });
});
