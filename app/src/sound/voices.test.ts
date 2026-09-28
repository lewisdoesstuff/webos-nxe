import { describe, expect, it } from "vitest";

import {
  MENU_SOUND_COUNT,
  SOUND_NAMES,
  SOUNDS,
  specFor,
  synthesise,
  type SoundSpec,
  type Tone,
} from "./voices";

const RATE = 48000;

/** A blip of one tone, so a test can vary one parameter at a time. */
function single(tone: Tone, ms = 100, level = 0.5): SoundSpec {
  return { ms, level, tick: 0, partials: [tone] };
}

function part(over: Partial<Tone> = {}): Tone {
  return {
    freq: 1000,
    amp: 1,
    attack: 0.001,
    decay: 0.09,
    ratio: 1,
    glide: 0,
    delay: 0,
    shape: 0,
    ...over,
  };
}

function peak(pcm: Float32Array): number {
  let highest = 0;
  for (const value of pcm) highest = Math.max(highest, Math.abs(value));
  return highest;
}

function mean(pcm: Float32Array): number {
  let sum = 0;
  for (const value of pcm) sum += value;
  return sum / pcm.length;
}

/** Rising zero crossings, which is how a waveform's pitch can be counted. */
function crossings(pcm: Float32Array): number {
  let count = 0;
  for (let index = 1; index < pcm.length; index++) {
    const before = pcm[index - 1] ?? 0;
    const after = pcm[index] ?? 0;
    if (before <= 0 && after > 0) count++;
  }
  return count;
}

/** Where the loudest sample is, in milliseconds from the start. */
function peakAt(pcm: Float32Array, rate: number): number {
  let best = 0;
  for (let index = 1; index < pcm.length; index++) {
    if ((pcm[index] ?? 0) > (pcm[best] ?? 0)) best = index;
  }
  return (best / rate) * 1000;
}

/** The tones of a blip that slide rather than sit still. */
function slides(spec: SoundSpec): Tone[] {
  return spec.partials.filter((tone) => tone.glide !== 0);
}

describe("the six blips", () => {
  it("names the six the settings screen lists", () => {
    expect(SOUND_NAMES).toEqual(["cursor", "category", "decide", "option", "cancel", "error"]);
    expect(MENU_SOUND_COUNT).toBe(6);
    for (const name of SOUND_NAMES) expect(specFor(name)).toBe(SOUNDS[name]);
  });

  it("keeps every blip inside 120 ms", () => {
    for (const name of SOUND_NAMES) {
      const spec = SOUNDS[name];
      expect(spec.ms, name).toBeGreaterThan(0);
      expect(spec.ms, name).toBeLessThanOrEqual(120);
    }
  });

  it("is quietest on the cursor, which is the one that repeats", () => {
    const cursor = specFor("cursor");
    for (const name of SOUND_NAMES) {
      if (name === "cursor") continue;
      expect(cursor.level, name).toBeLessThan(SOUNDS[name].level);
    }
  });

  it("gives every blip its own shape", () => {
    const shapes = new Set(SOUND_NAMES.map((name) => JSON.stringify(SOUNDS[name])));
    expect(shapes.size).toBe(SOUND_NAMES.length);
  });

  it("pairs a slide with its mirror, so back is option played backwards", () => {
    const option = specFor("option");
    const cancel = specFor("cancel");
    expect(slides(option)).toHaveLength(2);
    expect(slides(cancel)).toHaveLength(1);
    expect(slides(option)[0]?.glide).toBeGreaterThan(0);
    expect(slides(cancel)[0]?.glide).toBeLessThan(0);
  });

  it("beats the two low hits of the error blip against each other", () => {
    const firsts = specFor("error").partials.filter((p) => p.delay === 0 && p.freq < 200);
    expect(firsts).toHaveLength(2);
    expect(firsts[0]?.freq).not.toBe(firsts[1]?.freq);
  });
});

describe("synthesise", () => {
  it("renders the blip at the length its spec asks for", () => {
    for (const name of SOUND_NAMES) {
      const spec = SOUNDS[name];
      const pcm = synthesise(spec, RATE);
      expect(pcm.length, name).toBe(Math.round((spec.ms / 1000) * RATE));
    }
  });

  it("normalises every blip to its own level", () => {
    for (const name of SOUND_NAMES) {
      const spec = SOUNDS[name];
      expect(peak(synthesise(spec, RATE)), name).toBeCloseTo(spec.level, 4);
    }
  });

  it("leaves no DC offset behind", () => {
    for (const name of SOUND_NAMES) {
      expect(Math.abs(mean(synthesise(SOUNDS[name], RATE))), name).toBeLessThan(0.01);
    }
  });

  it("stays inside the sample range", () => {
    for (const name of SOUND_NAMES) {
      for (const value of synthesise(SOUNDS[name], RATE)) {
        expect(Number.isFinite(value), name).toBe(true);
        expect(Math.abs(value), name).toBeLessThanOrEqual(1);
      }
    }
  });

  it("renders the same blip the same way every time", () => {
    for (const name of SOUND_NAMES) {
      const first = synthesise(SOUNDS[name], RATE);
      const second = synthesise(SOUNDS[name], RATE);
      expect(Array.from(second), name).toEqual(Array.from(first));
    }
  });

  it("counts the crossings a frequency asks for", () => {
    const pcm = synthesise(single(part({ freq: 1000 }), 100), RATE);
    // A thousand hertz over a tenth of a second is a hundred cycles.
    expect(crossings(pcm)).toBeGreaterThan(90);
    expect(crossings(pcm)).toBeLessThan(110);
  });

  it("doubles the crossings for the second harmonic", () => {
    const fundamental = crossings(synthesise(single(part({ freq: 1000 })), RATE));
    const harmonic = crossings(synthesise(single(part({ freq: 1000, ratio: 2 })), RATE));
    expect(harmonic).toBeGreaterThan(fundamental * 1.8);
  });

  it("slides the pitch when a partial glides", () => {
    const steady = crossings(synthesise(single(part({ freq: 1000, glide: 0 })), RATE));
    const rising = crossings(synthesise(single(part({ freq: 1000, glide: 400 })), RATE));
    const falling = crossings(synthesise(single(part({ freq: 1000, glide: -400 })), RATE));
    expect(rising).toBeGreaterThan(steady);
    expect(falling).toBeLessThan(steady);
  });

  it("delays a partial that asks to start later", () => {
    const pcm = synthesise(single(part({ freq: 1000, delay: 0.05 })), RATE);
    expect(peakAt(pcm, RATE)).toBeGreaterThan(45);
    expect(crossings(pcm.slice(0, Math.round(RATE * 0.04)))).toBe(0);
  });

  it("takes the attack time as the time to the peak", () => {
    const snappy = synthesise(single(part({ attack: 0.001 })), RATE);
    const slow = synthesise(single(part({ attack: 0.04 })), RATE);
    expect(peakAt(slow, RATE)).toBeGreaterThan(peakAt(snappy, RATE) + 20);
  });

  it("decays to nothing by the end of the blip", () => {
    for (const name of SOUND_NAMES) {
      const spec = SOUNDS[name];
      const pcm = synthesise(spec, RATE);
      const tail = pcm.slice(pcm.length - Math.round(RATE * 0.005));
      expect(peak(tail), name).toBeLessThan(spec.level * 0.1);
    }
  });

  it("says nothing for a spec with nothing in it", () => {
    const pcm = synthesise(single(part({ amp: 0 })), RATE);
    expect(peak(pcm)).toBe(0);
  });

  it("puts the click on the front of a blip that asks for one", () => {
    const click = synthesise({ ...single(part()), ms: 100, tick: 0.5, partials: [] }, RATE);
    let first = 0;
    let last = 0;
    for (let index = 0; index < click.length; index++) {
      if (Math.abs(click[index] ?? 0) > 0.02) {
        if (first === 0) first = index;
        last = index;
      }
    }
    expect(first).toBeLessThan(4);
    expect(last).toBeLessThan(RATE * 0.005);
  });

  it("scales a blip by the level its spec asks for", () => {
    const spec = single(part(), 100, 0.4);
    const quiet = synthesise(spec, RATE);
    const loud = synthesise({ ...spec, level: 0.8 }, RATE);
    for (let index = 0; index < quiet.length; index++) {
      expect(loud[index], `sample ${index}`).toBeCloseTo((quiet[index] ?? 0) * 2, 5);
    }
  });

  it("survives a sample rate of zero rather than dividing by it", () => {
    const pcm = synthesise(specFor("cursor"), 0);
    expect(pcm).toHaveLength(1);
    expect(Number.isFinite(pcm[0] ?? Number.NaN)).toBe(true);
  });
});
