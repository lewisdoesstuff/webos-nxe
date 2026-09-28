import { describe, expect, it } from "vitest";

import { describeStatus, type SoundStatus } from "./status";

function status(over: Partial<SoundStatus> = {}): SoundStatus {
  return {
    navSound: true,
    unlocked: true,
    sounds: 6,
    reason: null,
    music: "off",
    musicPath: "",
    musicSource: null,
    musicReason: null,
    ...over,
  };
}

describe("describeStatus", () => {
  it("says off plainly, which is not the same as silent", () => {
    expect(describeStatus(status({ navSound: false }))).toBe("Menu sounds off. No music file set.");
  });

  it("counts the blips that are ready", () => {
    expect(describeStatus(status())).toBe("All 6 menu sounds ready. No music file set.");
    expect(describeStatus(status({ sounds: 3 }))).toBe(
      "3 of 6 menu sounds ready. No music file set.",
    );
  });

  it("says a locked context is waiting for a key rather than broken", () => {
    expect(describeStatus(status({ unlocked: false, sounds: 0, reason: null }))).toContain(
      "waiting for a key press",
    );
  });

  it("passes on the reason nothing can be played", () => {
    expect(describeStatus(status({ reason: "this browser has no Web Audio" }))).toBe(
      "Menu sounds unavailable: this browser has no Web Audio. No music file set.",
    );
  });

  it("covers every music state", () => {
    expect(describeStatus(status({ music: "loading" }))).toContain("Music starting");
    expect(describeStatus(status({ music: "playing" }))).toContain("Music playing");
    expect(describeStatus(status({ music: "blocked" }))).toContain("Music blocked");
    expect(describeStatus(status({ music: "failed" }))).toContain("Music file could not be played");
    expect(describeStatus(status({ music: "unavailable" }))).toContain("cannot play music");
  });

  it("prefers the player's own reason where there is one", () => {
    expect(
      describeStatus(
        status({ music: "blocked", musicReason: "the browser blocked autoplay, sorry" }),
      ),
    ).toContain("the browser blocked autoplay, sorry");
    expect(
      describeStatus(
        status({ music: "failed", musicReason: "hack/media/x.mp3 could not be read" }),
      ),
    ).toContain("hack/media/x.mp3 could not be read");
  });

  it("does not double the full stop on a reason the browser wrote", () => {
    const reason = "Failed to load because no supported source was found.";
    expect(describeStatus(status({ music: "failed", musicReason: reason }))).toBe(
      "All 6 menu sounds ready. Failed to load because no supported source was found.",
    );
  });
});
