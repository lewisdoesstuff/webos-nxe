import { afterEach, describe, expect, it, vi } from "vitest";

import { createSoundEngine, type SoundEngine } from "./engine";
import { installAudio, uninstallAudio, type AudioLog } from "./fakeAudio";
import { MENU_SOUND_COUNT } from "./voices";

/** A context ctor for a device with no audio output at all. */
function BrokenContext(): never {
  throw new Error("no audio device");
}

let engine: SoundEngine | null = null;
let log: AudioLog | null = null;

function armed(): SoundEngine {
  log = installAudio();
  engine = createSoundEngine();
  return engine;
}

afterEach(() => {
  engine?.dispose();
  engine = null;
  uninstallAudio();
});

describe("the blip engine", () => {
  it("renders all six on the first blip and one source for it", () => {
    const sound = armed();
    sound.play("cursor");

    expect(log?.contexts).toBe(1);
    expect(log?.buffers).toBe(MENU_SOUND_COUNT);
    expect(log?.sources).toBe(1);
    expect(log?.started).toBe(1);
  });

  it("makes no second context for the rest of the session", () => {
    const sound = armed();
    sound.play("cursor");
    sound.play("decide");
    sound.play("error");
    expect(log?.contexts).toBe(1);
    expect(log?.buffers).toBe(MENU_SOUND_COUNT);
  });

  it("starts the context a browser leaves suspended, from the first blip", () => {
    const sound = armed();
    sound.play("category");
    expect(log?.resumed).toBe(1);
    expect(log?.last?.state).toBe("running");
    expect(sound.status().unlocked).toBe(true);
  });

  it("resumes a context it already has, and does nothing when it has none", () => {
    const sound = armed();
    sound.unlock();
    expect(log?.contexts).toBe(0);

    sound.play("decide");
    sound.unlock();
    sound.unlock();
    expect(log?.resumed).toBe(1);
    expect(sound.status()).toEqual({ unlocked: true, sounds: MENU_SOUND_COUNT, reason: null });
  });

  it("counts the blips it has ready", () => {
    const sound = armed();
    expect(sound.status()).toEqual({
      unlocked: false,
      sounds: 0,
      reason: "audio has not been unlocked yet",
    });
    sound.play("decide");
    expect(sound.status().sounds).toBe(MENU_SOUND_COUNT);
  });

  // The three calls have to land inside `CURSOR_MIN_GAP_MS` of each other for the
  // engine to collapse them, and that only holds if the clock is held still.
  // Left on the real clock this failed roughly one run in three, so "all tests
  // pass" was not a claim that could be made.
  it("drops a held cursor rather than machine-gunning", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    const sound = armed();
    sound.play("cursor");
    sound.play("cursor");
    sound.play("cursor");
    expect(log?.sources).toBe(1);
    clock.mockRestore();
  });

  it("keeps separate cursor blips once the gap has passed", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    const sound = armed();
    sound.play("cursor");
    clock.mockReturnValue(1000 + 1000);
    sound.play("cursor");
    expect(log?.sources).toBe(2);
    clock.mockRestore();
  });

  it("does not rate limit the blips that are not the cursor", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    const sound = armed();
    sound.play("decide");
    sound.play("decide");
    sound.play("decide");
    expect(log?.sources).toBe(3);
    clock.mockRestore();
  });

  it("never has more than four blips sounding at once", () => {
    const sound = armed();
    for (let index = 0; index < 9; index++) sound.play("error");
    expect(log?.started).toBe(9);
    expect(log?.stopped).toBe(5);
  });

  it("does not cut a blip that has already finished", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    const sound = armed();
    for (let index = 0; index < 5; index++) sound.play("decide");
    expect(log?.stopped).toBe(1);
    clock.mockReturnValue(1600);
    sound.play("decide");
    expect(log?.stopped).toBe(1);
  });

  it("gives up on a browser with no Web Audio and does not keep asking", () => {
    uninstallAudio();
    const sound = createSoundEngine();
    expect(() => {
      sound.play("cursor");
      sound.play("cursor");
      sound.unlock();
    }).not.toThrow();
    expect(sound.status()).toEqual({
      unlocked: false,
      sounds: 0,
      reason: "this browser has no Web Audio",
    });
  });

  it("gives up on a context that cannot be made, and says why", () => {
    uninstallAudio();
    Object.defineProperty(globalThis, "AudioContext", {
      value: BrokenContext,
      configurable: true,
      writable: true,
    });
    const sound = createSoundEngine();
    expect(() => sound.play("decide")).not.toThrow();
    expect(sound.status().reason).toBe("no audio device");
    expect(sound.status().sounds).toBe(0);
  });
  it("lets go of the context when disposed", () => {
    const sound = armed();
    sound.play("decide");
    sound.dispose();
    expect(log?.closed).toBe(1);
    expect(sound.status().sounds).toBe(0);
  });
});
