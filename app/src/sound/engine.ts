/**
 * Menu blips over one Web Audio context.
 *
 * All six are rendered to PCM once, on the first blip, and each keypress then
 * costs a single `AudioBufferSourceNode`: no oscillators, no gain envelopes and
 * no graph are built while the user is navigating, which matters on a TV that
 * rasterises at 3840x2160. A shared `GainNode` is the only other node, and it
 * is the destination of every blip.
 *
 * Every entry point swallows its own failures. A TV with no output, a browser
 * with no Web Audio and a context the autoplay policy will not start all have
 * to leave navigation working, so the worst case is silence plus a reason in
 * `status()`. A context that could not be made is not retried on every keypress.
 */

import { CUE_FALLBACK, CUE_NAMES, isCue, REPEATING, type Sound } from "./cues";
import { SOUND_NAMES, SOUNDS, synthesise, type SoundName } from "./voices";

/** How many blips may sound at once. The oldest is cut when a fifth starts. */
const MAX_VOICES = 4;

/** Repeating cues closer together than this are dropped, so a held key cannot machine-gun. */
const CURSOR_MIN_GAP_MS = 40;

/** Slack over a blip's own length before a voice is considered finished. */
const VOICE_SLACK_MS = 40;

export interface EngineStatus {
  /** A running context, so a blip would be heard. */
  unlocked: boolean;
  /** How many of the six are rendered and playable. */
  sounds: number;
  /** Why nothing can be played, or null. */
  reason: string | null;
}

export interface SoundEngine {
  play(name: Sound): void;
  /** Make the context and start decoding the clips, so the first key press finds them ready. */
  preload(): void;
  /** Resume a context that already exists. Makes none, so boot stays free. */
  unlock(): void;
  status(): EngineStatus;
  /** Silence anything sounding and drop the context. */
  dispose(): void;
}

type ContextCtor = new (options?: AudioContextOptions) => AudioContext;

function contextCtor(): ContextCtor | null {
  const scope = globalThis as { AudioContext?: ContextCtor };
  return typeof scope.AudioContext === "function" ? scope.AudioContext : null;
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface Voice {
  source: AudioBufferSourceNode;
  /** `performance.now()` at which the blip is over and the voice can be dropped. */
  endsAt: number;
  /** The handler the source is given, so it can be taken back off. */
  ended: () => void;
}

/** Stop a source, and take the handler off first so it cannot re-enter. */
function silence(voice: Voice): void {
  voice.source.removeEventListener("ended", voice.ended);
  try {
    voice.source.stop();
  } catch {
    // Already stopped, or never started. Nothing left to do either way.
  }
}

export interface EngineOptions {
  /** Recorded clips that replace the synthesised blips once decoded. */
  files?: Partial<Record<Sound, string>>;
  /** Fetch a clip's bytes. Defaults to XMLHttpRequest, which also reads `file://`. */
  load?: (url: string) => Promise<ArrayBuffer>;
}

export function fetchBytes(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.addEventListener("load", () => {
      const ok = request.status === 0 || (request.status >= 200 && request.status < 300);
      if (ok && request.response instanceof ArrayBuffer) resolve(request.response);
      else reject(new Error(`${url}: ${request.status}`));
    });
    request.addEventListener("error", () => reject(new Error(`${url}: request failed`)));
    request.send();
  });
}

export function createSoundEngine(options: EngineOptions = {}): SoundEngine {
  const files = options.files ?? {};
  const load = options.load ?? fetchBytes;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let buffers: Partial<Record<Sound, AudioBuffer>> = {};
  let reason: string | null = null;
  let abandoned = false;
  let lastCursorAt = -CURSOR_MIN_GAP_MS;
  const voices: Voice[] = [];

  /** Decode each recorded clip over its synthesised fallback. A failed file keeps the fallback. */
  function loadFiles(ctx: AudioContext): void {
    for (const name of [...SOUND_NAMES, ...CUE_NAMES]) {
      const url = files[name];
      if (!url) continue;
      void load(url)
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((decoded) => {
          if (context === ctx) buffers = { ...buffers, [name]: decoded };
        })
        .catch(() => {});
    }
  }

  /** Render all six, once, at the context's own rate. */
  function render(ctx: AudioContext): void {
    const rendered: Partial<Record<SoundName, AudioBuffer>> = {};
    for (const name of SOUND_NAMES) {
      const pcm = synthesise(SOUNDS[name], ctx.sampleRate);
      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buffer.copyToChannel(pcm, 0);
      rendered[name] = buffer;
    }
    buffers = rendered;
  }

  function ensure(): AudioContext | null {
    if (context) return context;
    if (abandoned) return null;

    const Ctor = contextCtor();
    if (!Ctor) {
      abandoned = true;
      reason = "this browser has no Web Audio";
      return null;
    }
    try {
      const created = new Ctor({ latencyHint: "interactive" });
      const bus = created.createGain();
      bus.connect(created.destination);
      master = bus;
      context = created;
      render(created);
      loadFiles(created);
      reason = null;
    } catch (cause) {
      context = null;
      master = null;
      abandoned = true;
      reason = why(cause);
    }
    return context;
  }

  function drop(voice: Voice): void {
    const at = voices.indexOf(voice);
    if (at >= 0) voices.splice(at, 1);
  }

  function trim(now: number): void {
    for (let index = voices.length - 1; index >= 0; index--) {
      const voice = voices[index];
      if (voice && voice.endsAt <= now) voices.splice(index, 1);
    }
    while (voices.length >= MAX_VOICES) {
      const oldest = voices.shift();
      if (oldest) silence(oldest);
    }
  }

  function play(name: Sound): void {
    if (abandoned) return;
    const now = performance.now();
    if (REPEATING.has(name)) {
      if (now - lastCursorAt < CURSOR_MIN_GAP_MS) return;
      lastCursorAt = now;
    }

    const ctx = ensure();
    if (!ctx || !master) return;
    const buffer = buffers[name] ?? (isCue(name) ? buffers[CUE_FALLBACK[name]] : undefined);
    if (!buffer) return;

    if (ctx.state === "suspended") {
      // A keydown is a user gesture, so this is the one moment a suspended
      // context can be started from.
      void ctx.resume().catch(() => {});
    }

    trim(now);
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      const voice: Voice = {
        source,
        endsAt: now + buffer.duration * 1000 + VOICE_SLACK_MS,
        ended: () => drop(voice),
      };
      source.addEventListener("ended", voice.ended);
      voices.push(voice);
      source.start();
    } catch {
      // A refused source must not take the navigation down with it.
    }
  }

  function preload(): void {
    ensure();
  }

  function unlock(): void {
    // Deliberately makes no context. A blip makes one on the first key, which
    // is a moment the cost of rendering all six lands far more quietly than it
    // would at boot.
    const ctx = context;
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }

  function status(): EngineStatus {
    let sounds = 0;
    for (const name of SOUND_NAMES) if (buffers[name] !== undefined) sounds++;
    const running = context?.state === "running";
    return {
      unlocked: running,
      sounds,
      reason: reason ?? (context ? null : "audio has not been unlocked yet"),
    };
  }

  function dispose(): void {
    while (voices.length > 0) {
      const voice = voices.pop();
      if (voice) silence(voice);
    }
    buffers = {};
    if (context) {
      const closing = context;
      context = null;
      master = null;
      try {
        void closing.close();
      } catch {
        // Already closed, or never opened on a device with no output.
      }
    }
  }

  return { play, preload, unlock, status, dispose };
}
