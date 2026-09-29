/**
 * Web Audio and media element stand-ins for the tests.
 *
 * jsdom has neither an `AudioContext` nor a working `HTMLMediaElement.play`, so
 * the engine and the player are driven against these instead. Both record what
 * was asked of them, which is how the tests check that the six blips are
 * rendered once and what a burst of keypresses costs.
 *
 * Not part of the app: nothing in `app/src` outside a `.test.ts` imports it, so
 * it is never reached by the bundler.
 */

type Handler = () => void;

export interface AudioLog {
  /** How many contexts were constructed. */
  contexts: number;
  /** How many audio buffers were allocated. */
  buffers: number;
  /** How many buffer sources were created. */
  sources: number;
  /** How many of those were started. */
  started: number;
  /** How many were stopped again, for the voice cap. */
  stopped: number;
  resumed: number;
  closed: number;
  /** Length in samples of the buffer each started source played. */
  playedLengths: number[];
  /** The last context made, for poking at its state. */
  last: FakeContext | null;
}

class FakeGain {
  readonly gain = {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  };
  readonly connected: unknown[] = [];

  connect(target: unknown): unknown {
    this.connected.push(target);
    return target;
  }
}

class FakeBuffer {
  readonly channels: Float32Array[] = [];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    for (let index = 0; index < numberOfChannels; index++) {
      this.channels.push(new Float32Array(length));
    }
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  copyToChannel(source: Float32Array, channel: number): void {
    this.channels[channel]?.set(source);
  }
}

class FakeSource {
  buffer: FakeBuffer | null = null;

  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(private readonly log: AudioLog) {
    log.sources++;
  }

  connect(): unknown {
    return undefined;
  }

  addEventListener(type: string, handler: Handler): void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(type, set);
  }

  removeEventListener(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  start(): void {
    this.log.started++;
    this.log.playedLengths.push(this.buffer?.length ?? 0);
  }

  stop(): void {
    this.log.stopped++;
    for (const handler of this.handlers.get("ended") ?? []) handler();
  }
}

export class FakeContext {
  sampleRate = 48000;
  state: AudioContextState = "suspended";
  readonly destination = { name: "destination" };

  constructor(private readonly log: AudioLog) {
    log.contexts++;
    log.last = this;
  }

  createGain(): unknown {
    return new FakeGain();
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    this.log.buffers++;
    return new FakeBuffer(channels, length, sampleRate);
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    if (bytes.byteLength === 0) return Promise.reject(new Error("undecodable"));
    return Promise.resolve(new FakeBuffer(1, bytes.byteLength, this.sampleRate));
  }

  createBufferSource(): unknown {
    return new FakeSource(this.log);
  }

  resume(): Promise<void> {
    this.log.resumed++;
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.log.closed++;
    return Promise.resolve();
  }
}

/** Makes the next `play()` reject, the way a blocked autoplay does. */
export class NotAllowedError extends Error {
  constructor() {
    super("play() failed because the user did not interact with the document first");
    this.name = "NotAllowedError";
  }
}

export class FakeMedia {
  static instances: FakeMedia[] = [];
  static rejection: Error | null = null;
  static blocked = false;

  loop = false;
  preload = "";
  volume = 1;
  paused = true;
  src = "";
  loaded = 0;
  pausedCount = 0;
  removed = 0;

  private readonly handlers = new Map<string, Set<Handler>>();

  constructor() {
    FakeMedia.instances.push(this);
  }

  addEventListener(type: string, handler: Handler): void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(type, set);
  }

  removeEventListener(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  play(): Promise<void> {
    if (FakeMedia.blocked) return Promise.reject(new NotAllowedError());
    if (FakeMedia.rejection) return Promise.reject(FakeMedia.rejection);
    this.paused = false;
    this.fire("playing");
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.pausedCount++;
  }

  load(): void {
    this.loaded++;
  }

  removeAttribute(name: string): void {
    this.removed++;
    if (name === "src") this.src = "";
  }

  fire(type: string): void {
    for (const handler of this.handlers.get(type) ?? []) handler();
  }

  static last(): FakeMedia | undefined {
    return FakeMedia.instances[FakeMedia.instances.length - 1];
  }

  static reset(): void {
    FakeMedia.instances = [];
    FakeMedia.rejection = null;
    FakeMedia.blocked = false;
  }
}

const scope = globalThis as Record<string, unknown>;
let savedContext: PropertyDescriptor | undefined;
let savedMedia: PropertyDescriptor | undefined;
let log: AudioLog;

function emptyLog(): AudioLog {
  return {
    contexts: 0,
    buffers: 0,
    sources: 0,
    started: 0,
    stopped: 0,
    resumed: 0,
    closed: 0,
    playedLengths: [],
    last: null,
  };
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function restore(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete scope[name];
}

/** Put the stand-ins in place and hand back the log they write to. */
export function installAudio(): AudioLog {
  savedContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  savedMedia = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  log = emptyLog();
  FakeMedia.reset();
  define("AudioContext", function FakeContextForTest() {
    return new FakeContext(log);
  });
  define("Audio", FakeMedia);
  return log;
}

export function uninstallAudio(): void {
  restore("AudioContext", savedContext);
  restore("Audio", savedMedia);
}

/** Make the next `new Audio()` throw, the way a device with no media support does. */
export function breakMedia(): void {
  define("Audio", function BrokenMedia(): never {
    throw new Error("no media support on this device");
  });
}
