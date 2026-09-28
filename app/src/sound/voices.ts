/**
 * The six menu blips, written down as data, and the synthesis that turns a
 * description into PCM.
 *
 * Nothing here touches Web Audio. Each blip is rendered once into a
 * `Float32Array` by `synthesise`, so a keypress costs one buffer source and no
 * oscillator graph at all. The shapes are short decays: a low body tone under a
 * fast wooden transient, which is what the dashboard's own cues are, and the
 * longest of the six is under 120 ms so nothing is left ringing over the
 * animation it plays under.
 */

/** The blips, in the order the settings screen lists them. */
export const SOUND_NAMES = ["cursor", "category", "decide", "option", "cancel", "error"] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

/** How many of the six there are, for the status line. */
export const MENU_SOUND_COUNT = SOUND_NAMES.length;

/** One tone in a blip, which may be an inharmonic partial of another. */
export interface Tone {
  /** Starting frequency in Hz. */
  freq: number;
  /** Peak amplitude, relative to the whole blip. */
  amp: number;
  /** Seconds from the start of the blip to the peak. */
  attack: number;
  /** Seconds from the peak down to inaudible. */
  decay: number;
  /**
   * Inharmonic multiplier. 1 is a pure tone, a whole number above it is the
   * harmonic a struck bar rings at, which is what gives a blip its edge.
   */
  ratio: number;
  /** Pitch travel in Hz across the decay, so a tone can slide up or down. */
  glide: number;
  /** Seconds of delay from the start of the blip, which is how a pair of notes works. */
  delay: number;
  /** Sine to sawtooth blend: 0 is a sine, 1 adds four harmonics. */
  shape: number;
}

export interface SoundSpec {
  /** Length in milliseconds. Every spec here is at most 120. */
  ms: number;
  /** Peak level of the finished blip, 0..1. The cursor is the quietest. */
  level: number;
  /** Amplitude of the noise transient, the mechanical edge. 0 for none. */
  tick: number;
  partials: readonly Tone[];
}

/** A plucked body tone: the low part of every blip. */
function body(freq: number, amp: number, decay: number, delay = 0): Tone {
  return { freq, amp, attack: 0.003, decay, ratio: 1, glide: 0, delay, shape: 0.2 };
}

/** A pitched partial over the body, optionally sliding. */
function tone(
  freq: number,
  amp: number,
  decay: number,
  options: { delay?: number; glide?: number; ratio?: number; shape?: number } = {},
): Tone {
  return {
    freq,
    amp,
    attack: 0.002,
    decay,
    ratio: options.ratio ?? 1,
    glide: options.glide ?? 0,
    delay: options.delay ?? 0,
    shape: options.shape ?? 0.25,
  };
}

export const SOUNDS: Readonly<Record<SoundName, SoundSpec>> = {
  /**
   * Moving the cursor. The one that repeats, so it is the quietest and the
   * shortest: a low knock with a filtered click on the front of it.
   */
  cursor: {
    ms: 70,
    level: 0.5,
    tick: 0.3,
    partials: [
      body(196, 1, 0.05),
      tone(1568, 0.5, 0.028, { glide: -220, shape: 0.35 }),
      tone(1568, 0.18, 0.014, { ratio: 2, shape: 0.2 }),
    ],
  },

  /**
   * Changing blade. A rising fifth over a settling body, so the two blades
   * sound related rather than merely different.
   */
  category: {
    ms: 118,
    level: 0.8,
    tick: 0.18,
    partials: [
      body(147, 0.7, 0.09),
      tone(523.25, 1, 0.06),
      tone(783.99, 0.9, 0.07, { delay: 0.045 }),
      tone(1567.98, 0.16, 0.03, { delay: 0.045 }),
    ],
  },

  /**
   * Confirming a setting or launching. The heaviest of the six, and the only
   * one built from a two-step figure rather than a slide.
   */
  decide: {
    ms: 118,
    level: 1,
    tick: 0.22,
    partials: [
      body(174.61, 0.8, 0.1),
      tone(659.25, 0.9, 0.05),
      tone(987.77, 1, 0.08, { delay: 0.042 }),
      tone(1975.53, 0.14, 0.025, { delay: 0.042 }),
    ],
  },

  /** Opening a panel. A single tone sliding up, the lightest of the figures. */
  option: {
    ms: 96,
    level: 0.75,
    tick: 0.15,
    partials: [
      body(130.81, 0.55, 0.07),
      tone(440, 1, 0.055, { glide: 190, shape: 0.2 }),
      tone(880, 0.3, 0.045, { delay: 0.012, glide: 260, shape: 0 }),
    ],
  },

  /** Going back. The mirror of `option`, so the pair reads as one gesture. */
  cancel: {
    ms: 92,
    level: 0.7,
    tick: 0.12,
    partials: [
      body(155.56, 0.5, 0.065),
      tone(698.46, 1, 0.055, { glide: -210, shape: 0.2 }),
      tone(349.23, 0.35, 0.05, { delay: 0.035, shape: 0 }),
    ],
  },

  /**
   * A launch that failed. Two low hits a sixth of a second apart, detuned
   * against each other so they beat: the one blip that is meant to be ugly.
   */
  error: {
    ms: 120,
    level: 0.85,
    tick: 0.1,
    partials: [
      tone(138.59, 1, 0.055, { shape: 0.55 }),
      tone(146.83, 0.7, 0.055, { shape: 0.55 }),
      tone(277.18, 0.35, 0.04, { shape: 0.4 }),
      tone(138.59, 0.85, 0.05, { delay: 0.062, shape: 0.55 }),
      tone(146.83, 0.6, 0.05, { delay: 0.062, shape: 0.55 }),
    ],
  },
};

export function specFor(name: SoundName): SoundSpec {
  return SOUNDS[name];
}

/** The amplitude envelope: a fast rise, then a squared fall to nothing. */
function envelope(t: number, attack: number, decay: number): number {
  if (t < 0) return 0;
  if (t < attack) return attack <= 0 ? 1 : t / attack;
  if (decay <= 0) return 0;
  const spent = (t - attack) / decay;
  if (spent >= 1) return 0;
  const left = 1 - spent;
  return left * left;
}

/**
 * One cycle of the requested shape. A sine with up to four harmonics folded in,
 * which is enough edge for a blip without the aliasing a real sawtooth has.
 */
function wave(phase: number, shape: number): number {
  if (shape <= 0) return Math.sin(phase);
  const harmonics = Math.sin(phase * 2) / 2 + Math.sin(phase * 3) / 3 + Math.sin(phase * 4) / 4;
  return (Math.sin(phase) + harmonics * shape) / (1 + shape * 1.08);
}

/**
 * The mechanical click on the front of a blip. One-pole filtered noise from a
 * fixed seed, so the transient is the same every time it is played.
 */
function addTick(out: Float32Array, amplitude: number, rate: number): void {
  const length = Math.min(out.length, Math.max(1, Math.round(0.004 * rate)));
  let previous = 0;
  let seed = 0x2545f491;
  for (let index = 0; index < length; index++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed |= 0;
    previous = previous * 0.6 + (seed / 0x7fffffff) * 0.4;
    out[index] = (out[index] ?? 0) + amplitude * previous * (1 - index / length);
  }
}

/** Peak-normalise to the spec's level, with the accumulated DC taken out. */
function level(out: Float32Array, target: number): void {
  let sum = 0;
  for (const value of out) sum += value;
  const mean = sum / out.length;
  let peak = 0;
  for (let index = 0; index < out.length; index++) {
    out[index] = (out[index] ?? 0) - mean;
    const size = Math.abs(out[index] ?? 0);
    if (size > peak) peak = size;
  }
  if (peak <= 1e-9) return;
  const scale = target / peak;
  for (let index = 0; index < out.length; index++) out[index] = (out[index] ?? 0) * scale;
}

/**
 * Render a spec to mono PCM at `sampleRate`. Called once per blip, for all six
 * at a time, when the audio context is first made.
 */
export function synthesise(spec: SoundSpec, sampleRate: number): Float32Array<ArrayBuffer> {
  const rate = sampleRate > 0 ? sampleRate : 1;
  const length = Math.max(1, Math.round((spec.ms / 1000) * rate));
  const out = new Float32Array(length);
  const step = (2 * Math.PI) / rate;

  for (const partial of spec.partials) {
    if (partial.amp <= 0) continue;
    const start = Math.max(0, Math.round(partial.delay * rate));
    if (start >= length) continue;

    const base = partial.freq * partial.ratio;
    const sweep = partial.glide / Math.max((partial.attack + partial.decay) * rate, 1);
    let freq = base;
    let phase = 0;

    for (let index = start; index < length; index++) {
      const t = (index - start) / rate;
      const env = envelope(t, partial.attack, partial.decay);
      phase += step * freq;
      if (env > 0) {
        out[index] = (out[index] ?? 0) + partial.amp * env * wave(phase, partial.shape);
      }
      freq += sweep;
    }
  }

  if (spec.tick > 0) addTick(out, spec.tick, rate);
  level(out, spec.level);
  return out;
}
