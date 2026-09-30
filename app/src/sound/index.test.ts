import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "../stores/settings";
import { FakeMedia, installAudio, uninstallAudio, type AudioLog } from "./fakeAudio";
import { MENU_SOUND_COUNT } from "./voices";

type Sound = typeof import("./index");

const TRACK = "/media/internal/ooo.lew.nxe/theme.mp3";

/** A fresh module, so every test gets its own engine and player. */
async function load(): Promise<Sound> {
  vi.resetModules();
  return await import("./index");
}

let sound: Sound | null = null;
let log: AudioLog | null = null;

afterEach(() => {
  sound = null;
  uninstallAudio();
});

function armed(): { log: AudioLog } {
  // The settings store persists to localStorage, so each test starts from the
  // code defaults rather than the last test's choices.
  localStorage.clear();
  setActivePinia(createPinia());
  useSettingsStore().updateSetting("navSound", false);
  log = installAudio();
  return { log };
}

describe("playSound", () => {
  it("says nothing at all while the setting is off", async () => {
    armed();
    sound = await load();

    sound.playSound("cursor");
    sound.playSound("decide");

    expect(log?.contexts).toBe(0);
    expect(log?.buffers).toBe(0);
    expect(sound.status().sounds).toBe(0);
  });

  it("plays a blip as soon as the setting is on", async () => {
    armed();
    sound = await load();
    useSettingsStore().updateSetting("navSound", true);

    sound.playSound("category");

    expect(log?.contexts).toBe(1);
    expect(log?.buffers).toBe(MENU_SOUND_COUNT);
    expect(log?.started).toBe(1);
  });

  it("follows the setting being turned back off", async () => {
    armed();
    sound = await load();
    const settings = useSettingsStore();
    settings.updateSetting("navSound", true);
    sound.playSound("cursor");

    settings.updateSetting("navSound", false);
    sound.playSound("cursor");

    expect(log?.started).toBe(1);
  });

  it("keeps the music playing when the blips are turned off", async () => {
    armed();
    sound = await load();
    const settings = useSettingsStore();
    settings.updateSetting("musicPath", TRACK);
    settings.updateSetting("navSound", true);
    sound.playSound("decide");

    settings.updateSetting("navSound", false);
    sound.startMusic();

    expect(log?.started).toBe(1);
    expect(FakeMedia.last()?.src).toBe(`hack${TRACK}`);
  });

  it("does not unlock a context for a dashboard with the blips off", async () => {
    armed();
    sound = await load();
    sound.unlockAudio();
    sound.playSound("decide");
    expect(log?.contexts).toBe(0);

    useSettingsStore().updateSetting("navSound", true);
    sound.unlockAudio();
    expect(log?.contexts).toBe(0);
    sound.playSound("decide");
    expect(log?.contexts).toBe(1);
  });
});

describe("status", () => {
  it("reports a mute dashboard as off rather than broken", async () => {
    armed();
    sound = await load();

    expect(sound.status()).toEqual({
      navSound: false,
      unlocked: false,
      sounds: 0,
      reason: "audio has not been unlocked yet",
      music: "off",
      musicPath: "",
      musicSource: null,
      musicReason: null,
    });
    expect(sound.describeStatus(sound.status())).toBe("Menu sounds off. No music file set.");
  });

  it("reports a dashboard whose blips are on and its context is locked", async () => {
    armed();
    sound = await load();
    useSettingsStore().updateSetting("navSound", true);

    expect(sound.status().navSound).toBe(true);
    expect(sound.status().unlocked).toBe(false);
    expect(sound.status().sounds).toBe(0);
  });

  it("reports all six ready once a blip has made and unlocked the context", async () => {
    armed();
    sound = await load();
    useSettingsStore().updateSetting("navSound", true);
    sound.unlockAudio();
    expect(sound.status().unlocked).toBe(false);

    sound.playSound("decide");

    expect(sound.status().unlocked).toBe(true);
    expect(sound.status().sounds).toBe(MENU_SOUND_COUNT);
    expect(sound.describeStatus(sound.status())).toContain("All 6 menu sounds ready");
  });

  it("reports why a music file could not be played", async () => {
    armed();
    sound = await load();
    useSettingsStore().updateSetting("musicPath", TRACK);
    sound.startMusic();
    FakeMedia.last()?.fire("error");

    expect(sound.status().music).toBe("failed");
    expect(sound.status().musicPath).toBe(TRACK);
    expect(sound.status().musicSource).toBe(`hack${TRACK}`);
    expect(sound.status().musicReason).toContain("could not be read");
  });
});

describe("the music settings", () => {
  it("starts nothing while the path is empty", async () => {
    armed();
    sound = await load();
    sound.startMusic();
    sound.syncMusic();
    expect(FakeMedia.instances).toHaveLength(0);
    expect(sound.status().music).toBe("off");
  });

  it("starts the user's file, whatever navSound is doing", async () => {
    armed();
    sound = await load();
    useSettingsStore().updateSetting("musicPath", TRACK);
    useSettingsStore().updateSetting("musicVolume", 0.2);

    sound.startMusic();

    expect(FakeMedia.last()?.src).toBe(`hack${TRACK}`);
    expect(FakeMedia.last()?.volume).toBeCloseTo(0.2, 5);
  });

  it("takes a new volume mid-track without restarting it", async () => {
    armed();
    sound = await load();
    const settings = useSettingsStore();
    settings.updateSetting("musicPath", TRACK);
    sound.syncMusic();
    const audio = FakeMedia.last();

    settings.updateSetting("musicVolume", 0.8);
    sound.syncMusic();

    expect(audio?.loaded).toBe(1);
    expect(audio?.volume).toBeCloseTo(0.8, 5);
  });

  it("stops when the path is cleared", async () => {
    armed();
    sound = await load();
    const settings = useSettingsStore();
    settings.updateSetting("musicPath", TRACK);
    sound.startMusic();

    settings.updateSetting("musicPath", "");
    sound.syncMusic();

    expect(sound.status().music).toBe("off");
    expect(FakeMedia.last()?.paused).toBe(true);
  });

  it("stops on demand, and restarts from the top after", async () => {
    armed();
    sound = await load();
    useSettingsStore().updateSetting("musicPath", TRACK);
    sound.startMusic();
    const audio = FakeMedia.last();

    sound.stopMusic();
    expect(sound.status().music).toBe("off");

    // The second start reloads the file rather than resuming the old one.
    const loaded = audio?.loaded ?? 0;
    sound.startMusic();
    expect(audio?.loaded).toBe(loaded + 1);
    expect(sound.status().musicSource).toBe(`hack${TRACK}`);
  });
});

describe("with no store to read", () => {
  it("falls back to the defaults rather than throwing", async () => {
    armed();
    sound = await load();
    setActivePinia(undefined as never);

    expect(() => sound?.playSound("cursor")).not.toThrow();
    expect(() => sound?.startMusic()).not.toThrow();
    expect(sound?.status().navSound).toBe(true);
  });
});
