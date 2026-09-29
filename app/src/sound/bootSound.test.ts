import { afterEach, describe, expect, it, vi } from "vitest";

import { createBootSound } from "./bootSound";

const starts: number[][] = [];

class Ctx {
  state = "running";
  currentTime = 0;
  destination = {};
  createGain() {
    return {
      connect() {},
      gain: {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      start: (...args: number[]) => starts.push(args),
      stop() {},
    };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 7.9 });
  }
  resume() {
    return Promise.resolve();
  }
}

afterEach(() => {
  starts.length = 0;
  vi.unstubAllGlobals();
});

describe("boot sound", () => {
  it("seeks the clip to the boot clock once it has decoded", async () => {
    vi.stubGlobal("AudioContext", Ctx);
    const sound = createBootSound("boot.ogg", () => Promise.resolve(new ArrayBuffer(1)));
    sound.preload();
    sound.start(() => 1500);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toEqual([[0, 1.5]]);
  });

  it("stays silent with no Web Audio", () => {
    const sound = createBootSound("boot.ogg", () => Promise.resolve(new ArrayBuffer(1)));
    expect(() => {
      sound.preload();
      sound.start(() => 0);
      sound.fadeOut();
    }).not.toThrow();
    expect(starts).toEqual([]);
  });
});
