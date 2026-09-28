/**
 * Background music from a file the user supplies.
 *
 * A media element rather than a Web Audio source: the file is long, it is
 * streamed, and a separate player is what lets the dashboard's blips share the
 * audio bus without the two fighting over it. The element is only created once
 * a path is set, so a dashboard with music off never asks the TV for a media
 * pipeline at all.
 *
 * A missing or unreadable file leaves the menu usable: the element's error
 * event becomes a reason in `status()` and nothing else.
 */

import { HACK_PREFIX } from "../paths";
import type { MusicState } from "./status";

/**
 * A media path, resolved to something the page can load.
 *
 * The same problem as an icon: the file lives outside the app and a cross-app
 * `file://` read is blocked by origin scoping, so an absolute path goes through
 * the app-dir `hack/` symlink. A relative path is already inside our own origin
 * (a bundled track, or one served by the dev server), and an `http` URL is
 * remote, so both pass through untouched.
 */
export function mediaSource(path: string): string | null {
  const asked = path.trim();
  if (asked === "") return null;
  if (/^https?:/i.test(asked)) return asked;
  if (/^file:/i.test(asked)) {
    const local = asked.replace(/^file:\/{0,3}/i, "/");
    return local === "/" ? null : `${HACK_PREFIX}${local}`;
  }
  if (asked.startsWith("/")) return `${HACK_PREFIX}${asked}`;
  return asked;
}

export interface MusicStatus {
  state: MusicState;
  /** The file as the user typed it. */
  path: string;
  /** What the element was pointed at, or null when nothing is loaded. */
  source: string | null;
  /** Why it is not playing, or null when nothing is wrong. */
  reason: string | null;
}

export interface MusicPlayer {
  /**
   * Point the player at a file. `retry` reloads from the beginning, which is
   * what a "retry playback" action wants; without it an already-loaded file
   * keeps its position and only takes the new volume.
   */
  start(path: string, volume: number, retry: boolean): void;
  stop(): void;
  status(): MusicStatus;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.min(Math.max(volume, 0), 1);
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as Promise<unknown> | null)?.then === "function";
}

function blockedReason(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  // Chrome's own wording is "the user did not interact with the document first".
  if (/gesture|interact|not allowed/i.test(message)) {
    return "the browser blocked autoplay, so a key press and a retry are needed";
  }
  return message;
}

export function createMusicPlayer(): MusicPlayer {
  let element: HTMLAudioElement | null = null;
  let state: MusicState = "off";
  let path = "";
  let source: string | null = null;
  let reason: string | null = null;

  function attach(): HTMLAudioElement | null {
    if (element) return element;
    if (typeof Audio === "undefined") {
      state = "unavailable";
      reason = "this browser cannot play media";
      return null;
    }
    try {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.addEventListener("playing", () => {
        state = "playing";
        reason = null;
      });
      audio.addEventListener("error", () => {
        state = "failed";
        reason = `${source ?? path} could not be read or is not audio the TV can decode`;
      });
      element = audio;
    } catch (cause) {
      state = "unavailable";
      reason = cause instanceof Error ? cause.message : String(cause);
    }
    return element;
  }

  function play(audio: HTMLAudioElement): void {
    state = "loading";
    let started: unknown;
    try {
      started = audio.play();
    } catch (cause) {
      state = "blocked";
      reason = blockedReason(cause);
      return;
    }
    if (!isPromise(started)) return;
    started.then(
      () => {
        state = "playing";
        reason = null;
      },
      (cause: unknown) => {
        // A file the TV cannot read fires its error event and then rejects the
        // play, and the event is the one that knows why.
        if (state === "failed") return;
        state = "blocked";
        reason = blockedReason(cause);
      },
    );
  }

  function start(asked: string, volume: number, retry: boolean): void {
    const resolved = mediaSource(asked);
    if (!resolved) {
      stop();
      return;
    }

    const audio = attach();
    if (!audio) return;

    const level = clampVolume(volume);
    audio.volume = level;

    if (source === resolved && !retry) {
      // Same file, already loaded: take the new level and try a paused
      // element again, which is the free half of a retry.
      if (audio.paused) play(audio);
      return;
    }

    path = asked;
    source = resolved;
    reason = null;
    try {
      audio.src = resolved;
      audio.load();
    } catch (cause) {
      state = "failed";
      reason = cause instanceof Error ? cause.message : String(cause);
      return;
    }
    play(audio);
  }

  function stop(): void {
    const audio = element;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute("src");
        // Hands the TV's media pipeline back rather than holding it on a file
        // nobody is listening to.
        audio.load();
      } catch {
        // A device with no media support has nothing to release.
      }
    }
    state = "off";
    source = null;
    reason = null;
  }

  function status(): MusicStatus {
    return { state, path, source, reason };
  }

  return { start, stop, status };
}
