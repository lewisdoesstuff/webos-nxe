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

import backUrl from "../assets/sounds/back.ogg";
import blade1Url from "../assets/sounds/blade-1.ogg";
import blade2Url from "../assets/sounds/blade-2.ogg";
import blade3Url from "../assets/sounds/blade-3.ogg";
import bootUrl from "../assets/sounds/boot.ogg";
import channelDownUrl from "../assets/sounds/channel-down.ogg";
import channelUpUrl from "../assets/sounds/channel-up.ogg";
import focusUrl from "../assets/sounds/focus.ogg";
import hudCloseUrl from "../assets/sounds/hud-close.ogg";
import hudFocusUrl from "../assets/sounds/hud-focus.ogg";
import hudOpenUrl from "../assets/sounds/hud-open.ogg";
import hudSelectUrl from "../assets/sounds/hud-select.ogg";
import optionUrl from "../assets/sounds/option.ogg";
import panelLeftUrl from "../assets/sounds/panel-left.ogg";
import panelRightUrl from "../assets/sounds/panel-right.ogg";
import selectUrl from "../assets/sounds/select.ogg";
import toastUrl from "../assets/sounds/toast.ogg";
import transitionUrl from "../assets/sounds/transition.ogg";
import { SETTINGS_DEFAULTS, type Settings } from "../settings";
import { useSettingsStore } from "../stores/settings";
import { createBootSound } from "./bootSound";
import { BLADE_CYCLE, type Sound } from "./cues";
import { createSoundEngine } from "./engine";
import { createMusicPlayer } from "./music";
import type { SoundStatus } from "./status";
import { createToastSound } from "./toastSound";

export { MENU_SOUND_COUNT, SOUND_NAMES, type SoundName } from "./voices";
export type { Sound } from "./cues";
export { describeStatus, type MusicState, type SoundStatus } from "./status";

const engine = createSoundEngine({
  files: {
    option: optionUrl,
    panelLeft: panelLeftUrl,
    panelRight: panelRightUrl,
    channelUp: channelUpUrl,
    channelDown: channelDownUrl,
    select: selectUrl,
    back: backUrl,
    focus: focusUrl,
    transition: transitionUrl,
    hudOpen: hudOpenUrl,
    hudClose: hudCloseUrl,
    hudFocus: hudFocusUrl,
    hudSelect: hudSelectUrl,
    blade1: blade1Url,
    blade2: blade2Url,
    blade3: blade3Url,
  },
});
const music = createMusicPlayer();
const boot = createBootSound(bootUrl);
const toast = createToastSound(toastUrl);

/**
 * The boot's audio, as one handle. Every call is a no-op with `navSound` off, so
 * no audio context is made for a boot that is meant to be silent.
 */
export const bootSound = {
  preload(): void {
    if (stored().navSound) boot.preload();
  },
  start(atMs: () => number): void {
    if (stored().navSound) boot.start(atMs);
  },
  fadeOut: () => boot.fadeOut(),
  stop: () => boot.stop(),
};

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
export function playSound(name: Sound): void {
  if (!stored().navSound) return;
  engine.play(name);
}

let bladeStep = 0;

/** The Guide's blade switch, the next clip of its cycle. */
export function playBladeSound(): void {
  const cue = BLADE_CYCLE[bladeStep % BLADE_CYCLE.length] ?? "blade2";
  bladeStep++;
  playSound(cue);
}

/** The toast cue, silent with `navSound` off. */
export function playToastSound(): void {
  if (stored().navSound) toast.play();
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
