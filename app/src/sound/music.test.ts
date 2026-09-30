import { afterEach, describe, expect, it } from "vitest";

import { breakMedia, FakeMedia, installAudio, uninstallAudio } from "./fakeAudio";
import { createMusicPlayer, mediaSource, type MusicPlayer } from "./music";

const TRACK = "/media/internal/ooo.lew.nxe/theme.mp3";

let player: MusicPlayer | null = null;

function armed(): MusicPlayer {
  installAudio();
  player = createMusicPlayer();
  return player;
}

afterEach(() => {
  player?.stop();
  player = null;
  uninstallAudio();
});

describe("mediaSource", () => {
  it("puts an absolute path through the app-dir symlink, as an icon does", () => {
    expect(mediaSource(TRACK)).toBe("hack/media/internal/ooo.lew.nxe/theme.mp3");
  });

  it("puts a file URL through the same symlink", () => {
    expect(mediaSource(`file://${TRACK}`)).toBe("hack/media/internal/ooo.lew.nxe/theme.mp3");
    expect(mediaSource(`file:${TRACK}`)).toBe("hack/media/internal/ooo.lew.nxe/theme.mp3");
  });

  it("leaves what is already inside our own origin alone", () => {
    expect(mediaSource("user-music.mp3")).toBe("user-music.mp3");
    expect(mediaSource("/src/assets/theme.mp3")).toBe("hack/src/assets/theme.mp3");
  });

  it("leaves a remote URL alone", () => {
    expect(mediaSource("https://example.test/theme.mp3")).toBe("https://example.test/theme.mp3");
    expect(mediaSource("HTTP://example.test/theme.mp3")).toBe("HTTP://example.test/theme.mp3");
  });

  it("has nothing to offer for an empty path", () => {
    expect(mediaSource("")).toBeNull();
    expect(mediaSource("   ")).toBeNull();
    expect(mediaSource("file:///")).toBeNull();
  });
});

describe("the music player", () => {
  it("loops the file at the volume it was given", () => {
    const music = armed();
    music.start(TRACK, 0.4, false);
    const audio = FakeMedia.last();

    expect(audio?.loop).toBe(true);
    expect(audio?.preload).toBe("auto");
    expect(audio?.volume).toBeCloseTo(0.4, 5);
    expect(audio?.src).toBe(`hack${TRACK}`);
  });

  it("keeps its place when only the volume moved", () => {
    const music = armed();
    music.start(TRACK, 0.4, false);
    const audio = FakeMedia.last();
    audio!.src = `${audio!.src}#played-a-bit`;

    music.start(TRACK, 0.9, false);

    expect(audio?.volume).toBeCloseTo(0.9, 5);
    expect(audio?.src).toBe(`hack${TRACK}#played-a-bit`);
    expect(audio?.loaded).toBe(1);
  });

  it("reloads from the beginning on a retry", () => {
    const music = armed();
    music.start(TRACK, 0.5, false);
    music.start(TRACK, 0.5, true);
    expect(FakeMedia.last()?.loaded).toBe(2);
  });

  it("swaps the file when the path changes", () => {
    const music = armed();
    music.start(TRACK, 0.5, false);
    music.start("/media/internal/ooo.lew.nxe/other.mp3", 0.5, false);
    const audio = FakeMedia.last();
    expect(audio?.src).toBe("hack/media/internal/ooo.lew.nxe/other.mp3");
    expect(music.status().path).toBe("/media/internal/ooo.lew.nxe/other.mp3");
  });

  it("holds the volume inside the range the element accepts", () => {
    const music = armed();
    music.start(TRACK, 4, false);
    expect(FakeMedia.last()?.volume).toBe(1);
    music.start(TRACK, Number.NaN, false);
    expect(FakeMedia.last()?.volume).toBe(0);
  });

  it("reports it is playing once the element starts", async () => {
    const music = armed();
    music.start(TRACK, 0.5, false);
    await Promise.resolve();
    expect(music.status()).toEqual({
      state: "playing",
      path: TRACK,
      source: `hack${TRACK}`,
      reason: null,
    });
  });

  it("says the autoplay was blocked, and stays silent", async () => {
    installAudio();
    FakeMedia.blocked = true;
    const music = createMusicPlayer();
    music.start(TRACK, 0.5, false);
    await Promise.resolve();
    await Promise.resolve();

    expect(music.status().state).toBe("blocked");
    expect(music.status().reason).toMatch(/blocked autoplay/);
  });

  it("stays silent on a file the TV cannot read", async () => {
    const music = armed();
    music.start(TRACK, 0.5, false);
    FakeMedia.last()?.fire("error");
    expect(music.status().state).toBe("failed");
    expect(music.status().reason).toContain(`hack${TRACK}`);
  });

  it("keeps the load failure when the play rejects behind it", async () => {
    const music = armed();
    FakeMedia.rejection = new Error("Failed to load because no supported source was found.");
    music.start(TRACK, 0.5, false);
    FakeMedia.last()?.fire("error");
    await Promise.resolve();
    await Promise.resolve();

    expect(music.status().state).toBe("failed");
    expect(music.status().reason).toContain(`hack${TRACK}`);
  });

  it("never makes an element for an empty path", () => {
    installAudio();
    const music = createMusicPlayer();
    music.start("   ", 0.5, false);
    expect(FakeMedia.instances).toHaveLength(0);
    expect(music.status().state).toBe("off");
  });

  it("hands the media pipeline back when stopped", () => {
    const music = armed();
    music.start(TRACK, 0.5, false);
    const audio = FakeMedia.last();

    music.stop();

    expect(audio?.pausedCount).toBe(1);
    expect(audio?.src).toBe("");
    expect(music.status()).toEqual({ state: "off", path: TRACK, source: null, reason: null });
  });

  it("survives a device that cannot make a media element", () => {
    installAudio();
    breakMedia();
    const music = createMusicPlayer();
    expect(() => music.start(TRACK, 0.5, false)).not.toThrow();
    expect(music.status().state).toBe("unavailable");
    expect(music.status().reason).toBe("no media support on this device");
  });

  it("survives a browser with no media element at all", () => {
    uninstallAudio();
    Object.defineProperty(globalThis, "Audio", { value: undefined, configurable: true });
    const music = createMusicPlayer();
    expect(() => music.start(TRACK, 0.5, false)).not.toThrow();
    expect(music.status().state).toBe("unavailable");
  });
});
