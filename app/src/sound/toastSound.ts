/**
 * The toast's own cue: the console's notification blip, played once per toast.
 *
 * It gets its own small context so the menu blips stay lazy, and it is silent
 * on any failure, like the boot sound.
 */

import { fetchBytes } from "./engine";

type ContextCtor = new (options?: AudioContextOptions) => AudioContext;

export interface ToastSound {
  /** Make the context and decode the clip. */
  preload(): void;
  /** Play it, waiting for the decode if it is not done. */
  play(): void;
}

export function createToastSound(
  url: string,
  load: (url: string) => Promise<ArrayBuffer> = fetchBytes,
): ToastSound {
  let context: AudioContext | null = null;
  let buffer: AudioBuffer | null = null;
  let failed = false;
  let queued = false;

  function start(): void {
    if (!context || !buffer) return;
    void context.resume().catch(() => undefined);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
  }

  function preload(): void {
    if (context || failed) return;
    const Ctor = (globalThis as { AudioContext?: ContextCtor }).AudioContext;
    if (typeof Ctor !== "function") {
      failed = true;
      return;
    }
    try {
      const created = new Ctor({ latencyHint: "interactive" });
      context = created;
      void load(url)
        .then((bytes) => created.decodeAudioData(bytes))
        .then((decoded) => {
          buffer = decoded;
          if (queued) {
            queued = false;
            start();
          }
        })
        .catch(() => {
          failed = true;
        });
    } catch {
      failed = true;
    }
  }

  return {
    preload,
    play(): void {
      preload();
      if (failed) return;
      if (buffer) start();
      else queued = true;
    },
  };
}
