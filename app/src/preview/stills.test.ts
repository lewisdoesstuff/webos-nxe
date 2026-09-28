import { beforeEach, describe, expect, it } from "vitest";

import { STALE_AFTER_MS, forgetStill, loadStills, markStill, resetStills, stillAt } from "./stills";

const NOW = 1_700_000_000_000;
const STILL = { at: NOW - 1000, slot: "a" } as const;

beforeEach(() => {
  resetStills();
  window.localStorage.clear();
});

describe("stillAt", () => {
  it("has nothing to say about an input it has never photographed", () => {
    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();
  });

  it("reports the still, with the file it is in", () => {
    markStill("com.webos.app.hdmi1", STILL);
    expect(stillAt("com.webos.app.hdmi1", NOW)).toEqual(STILL);
  });

  it("keeps a still right up to a week old, because a week is the line", () => {
    markStill("com.webos.app.hdmi1", { at: NOW - STALE_AFTER_MS, slot: "b" });
    expect(stillAt("com.webos.app.hdmi1", NOW)).toEqual({ at: NOW - STALE_AFTER_MS, slot: "b" });
  });

  it("drops one the moment it is older than that, since a picture of last week's content is worse than no picture", () => {
    markStill("com.webos.app.hdmi1", { at: NOW - STALE_AFTER_MS - 1, slot: "a" });
    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();
  });

  it("is per input, so one input's still never stands in for another's", () => {
    markStill("com.webos.app.hdmi1", STILL);
    expect(stillAt("com.webos.app.hdmi2", NOW)).toBeUndefined();
  });

  it("forgets one on request", () => {
    markStill("com.webos.app.hdmi1", STILL);
    forgetStill("com.webos.app.hdmi1");
    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();
  });
});

describe("loadStills", () => {
  it("brings back what a previous run photographed", () => {
    markStill("com.webos.app.hdmi1", STILL);
    resetStills();
    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();

    loadStills(NOW);

    expect(stillAt("com.webos.app.hdmi1", NOW)).toEqual(STILL);
  });

  it("leaves an already old still out rather than resurrecting it", () => {
    markStill("com.webos.app.hdmi1", { at: NOW - STALE_AFTER_MS - 1, slot: "a" });
    resetStills();

    loadStills(NOW);

    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();
  });

  it("ignores a corrupt or absent document instead of failing to start", () => {
    window.localStorage.setItem("blades.previews", "{not json");
    expect(() => loadStills(NOW)).not.toThrow();

    window.localStorage.setItem("blades.previews", '"a string"');
    expect(() => loadStills(NOW)).not.toThrow();
    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();
  });

  it("ignores entries that are not a time and a slot", () => {
    window.localStorage.setItem(
      "blades.previews",
      JSON.stringify({
        "com.webos.app.hdmi1": { at: "yesterday", slot: "a" },
        "com.webos.app.hdmi2": { at: 12, slot: "c" },
        "com.webos.app.hdmi3": { at: NOW - 1000, slot: "b" },
      }),
    );

    loadStills(NOW);

    expect(stillAt("com.webos.app.hdmi1", NOW)).toBeUndefined();
    expect(stillAt("com.webos.app.hdmi2", NOW)).toBeUndefined();
    expect(stillAt("com.webos.app.hdmi3", NOW)).toEqual({ at: NOW - 1000, slot: "b" });
  });
});
