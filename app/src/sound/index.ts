/**
 * Menu sounds and background music, behind one small API.
 *
 * Both features read the persisted settings through the store, so there is no
 * state here to keep in step with them and nothing has to be wired up for a
 * setting to take effect. The blips play unless `navSound` is off;
 * the music plays whatever `musicPath` points at.
 *
 * Nothing here throws. A dashboard with no audio device, a browser that refuses
 * to start a context and a path that leads nowhere all end in silence with a
 * reason in `status()`, never in a broken menu.
 */

import cancelUrl from "../assets/sounds/cancel.ogg";
import categoryUrl from "../assets/sounds/category.ogg";
import cursorUrl from "../assets/sounds/cursor.ogg";
import decideUrl from "../assets/sounds/decide.ogg";
import optionUrl from "../assets/sounds/option.ogg";
import { SETTINGS_DEFAULTS, type Settings } from "../settings";
import { useSettingsStore } from "../stores/settings";
import { createSoundEngine } from "./engine";
import { createMusicPlayer } from "./music";
import type { SoundStatus } from "./status";
import type { SoundName } from "./voices";

export { MENU_SOUND_COUNT, SOUND_NAMES, type SoundName } from "./voices";
export { describeStatus, type MusicState, type SoundStatus } from "./status";

const engine = createSoundEngine({
  files: {
    cursor: cursorUrl,
    category: categoryUrl,
    decide: decideUrl,
    option: optionUrl,
    cancel: cancelUrl,
  },
});
const music = createMusicPlayer();

/** Decode the clips once the shell has mounted, so no key press waits on them. */
export function preloadSounds(): void {
  if (stored().navSound) engine.preload();
}

setTimeout(preloadSounds, 0);

/** The stored settings, falling back to the defaults with no store to read. */
function stored(): Settings {
  try {
    return useSettingsStore().settings;
  } catch {
    return SETTINGS_DEFAULTS;
  }
}

/**
 * A menu blip. Silent when `navSound` is off, so with it off no audio
 * context is ever created.
 */
export function playSound(name: SoundName): void {
  if (!stored().navSound) return;
  engine.play(name);
}

/**
 * Resume the audio context, if there is one to resume.
 *
 * Optional: every blip resumes it for itself, from inside the keypress that
 * asked for the blip, so nothing has to be wired up. Worth calling from a first
 * key or pointer press if you would rather the context were running before the
 * first blip than during it. Makes no context itself, so calling it at boot
 * costs nothing.
 */
export function unlockAudio(): void {
  if (!stored().navSound) return;
  engine.unlock();
}

/** Start the user's music from the top. The retry action calls this too. */
export function startMusic(): void {
  const { musicPath, musicVolume } = stored();
  if (musicPath.trim() === "") {
    music.stop();
    return;
  }
  music.start(musicPath, musicVolume, true);
}

/** Stop the music and let the TV's media pipeline go. */
export function stopMusic(): void {
  music.stop();
}

/**
 * Bring the music in line with the settings without interrupting it, so a
 * settings watcher can call this on any change: a new path restarts, a cleared
 * path stops, and a new volume is taken mid-track.
 */
export function syncMusic(): void {
  const { musicPath, musicVolume } = stored();
  if (musicPath.trim() === "") {
    music.stop();
    return;
  }
  music.start(musicPath, musicVolume, false);
}

export function status(): SoundStatus {
  const blips = engine.status();
  const track = music.status();
  return {
    navSound: stored().navSound,
    unlocked: blips.unlocked,
    sounds: blips.sounds,
    reason: blips.reason,
    music: track.state,
    musicPath: track.path,
    musicSource: track.source,
    musicReason: track.reason,
  };
}
