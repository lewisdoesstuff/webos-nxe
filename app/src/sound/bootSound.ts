/**
 * The boot sound: the master's own audio track, played against the boot clock.
 *
 * The clip is cut from the same capture the animation's timing is measured off,
 * so master time and clip time are the same axis and starting it is a seek to
 * the clock's current reading. It gets its own context so that the menu blips
 * stay lazy, and it is silent on any failure: no output, a context the autoplay
 * policy will not start, a clip that will not decode.
 */

import { fetchBytes } from "./engine";

/** How long a skip takes to bring the sound down, in seconds. */
const FADE_S = 0.15;

export interface BootSound {
  /** Make the context and decode the clip, so `start` finds it ready. */
  preload(): void;
  /** Sound the clip from `atMs()` on the boot clock, waiting for the decode if it is not done. */
  start(atMs: () => number): void;
  /** Bring it down over a short fade and stop. */
  fadeOut(): void;
  /** Stop at once. */
  stop(): void;
}

type ContextCtor = new (options?: AudioContextOptions) => AudioContext;

export function createBootSound(
  url: string,
  load: (url: string) => Promise<ArrayBuffer> = fetchBytes,
): BootSound {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let failed = false;
  let waiting: (() => number) | null = null;

  function ensure(): AudioContext | null {
    if (context) return context;
    if (failed) return null;
    const Ctor = (globalThis as { AudioContext?: ContextCtor }).AudioContext;
    if (typeof Ctor !== "function") {
      failed = true;
      return null;
    }
    try {
      const created = new Ctor({ latencyHint: "playback" });
      const bus = created.createGain();
      bus.connect(created.destination);
      context = created;
      gain = bus;
      void load(url)
        .then((bytes) => created.decodeAudioData(bytes))
        .then((decoded) => {
          if (context !== created) return;
          buffer = decoded;
          const pending = waiting;
          waiting = null;
          if (pending) begin(pending());
        })
        .catch(() => {
          failed = true;
        });
    } catch {
      context = null;
      gain = null;
      failed = true;
    }
    return context;
  }

  function begin(atMs: number): void {
    const ctx = context;
    if (!ctx || !gain || !buffer) return;
    const offset = Math.max(0, atMs) / 1000;
    if (offset >= buffer.duration) return;
    try {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      release();
      gain.gain.cancelScheduledValues(0);
      gain.gain.value = 1;
      const next = ctx.createBufferSource();
      next.buffer = buffer;
      next.connect(gain);
      next.start(0, offset);
      source = next;
    } catch {
      // A refused source leaves the boot silent, nothing more.
    }
  }

  function release(): void {
    const playing = source;
    source = null;
    if (!playing) return;
    try {
      playing.stop();
    } catch {
      // Already stopped.
    }
  }

  function preload(): void {
    ensure();
  }

  function start(atMs: () => number): void {
    if (!ensure()) return;
    if (buffer) begin(atMs());
    else waiting = atMs;
  }

  function fadeOut(): void {
    waiting = null;
    const ctx = context;
    if (!ctx || !gain || !source) return;
    try {
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
      source.stop(ctx.currentTime + FADE_S);
    } catch {
      release();
    }
  }

  function stop(): void {
    waiting = null;
    release();
  }

  return { preload, start, fadeOut, stop };
}
