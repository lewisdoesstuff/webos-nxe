/**
 * The TV's own settings as the settings screen lists them, and the System
 * Information rows.
 *
 * Pure: the store reads and writes the settings service; this owns which keys
 * a page offers (generated from the TV's own description, see
 * `tools/gen-tv-keys.mjs`), how a key is worded, and what each of the three
 * controls does. A key is a toggle (on/off), a choice (one of several) or a
 * range (a number in steps).
 */

import { TV_GEN_PAGES, type GenKind } from "./tvKeys.generated";

export type TvKind = "bool" | "choice" | "range";

export interface TvOption {
  readonly value: string | number;
  readonly label: string;
}

export interface TvDef {
  readonly category: string;
  readonly key: string;
  readonly title: string;
  readonly kind: TvKind;
  /** Options fixed by hand, in place of the ones the TV reports. */
  readonly fixed?: readonly TvOption[];
}

export interface TvRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** What the TV last reported, keyed `category.key`, and the system facts. */
export interface TvSnapshot {
  readonly values: Readonly<Record<string, unknown>>;
  readonly choices: Readonly<Record<string, readonly TvOption[]>>;
  readonly ranges: Readonly<Record<string, TvRange>>;
  readonly volume: number | null;
  readonly muted: boolean;
  readonly model: string;
  readonly firmware: string;
  readonly network: string;
  readonly address: string;
  readonly output: string;
}

export const EMPTY_TV: TvSnapshot = {
  values: {},
  choices: {},
  ranges: {},
  volume: null,
  muted: false,
  model: "",
  firmware: "",
  network: "",
  address: "",
  output: "",
};

const DASH = "—";

export function tvId(def: TvDef): string {
  return `${def.category}.${def.key}`;
}

const WORDS: Readonly<Record<string, string>> = {
  ai: "AI",
  hdr: "HDR",
  oled: "OLED",
  tv: "TV",
  hdmi: "HDMI",
  arc: "ARC",
  earc: "eARC",
  dtv: "DTV",
  av: "AV",
  ire: "IRE",
  rgb: "RGB",
  cec: "CEC",
  mpeg: "MPEG",
  memc: "MEMC",
  hd: "HD",
  ui: "UI",
  wisa: "WiSA",
  lg: "LG",
  fps: "FPS",
  rts: "RTS",
  atsc: "ATSC",
};

/** `energySavingAutoMin` becomes "Energy Saving Auto Min". */
export function humanize(text: string): string {
  const words = text
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\d+)/g, " $1 ")
    .split(/\s+/)
    .filter((word) => word !== "");
  return words
    .map((word) => WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const TITLES: Readonly<Record<string, string>> = {
  "picture.backlight": "OLED Pixel Brightness",
  "picture.truMotionMode": "TruMotion",
  "picture.hdrDynamicToneMapping": "HDR Dynamic Tone Mapping",
  "sound.avSync": "AV Sync Adjustment",
  "sound.eArcSupport": "eARC",
  "other.simplinkEnable": "HDMI-CEC",
  "caption.captionEnable": "Captions",
};

const VALUES: Readonly<Record<string, string>> = {
  on: "On",
  off: "Off",
  normal: "Standard",
  movie: "Cinema",
  news: "Clear Voice",
  filmMaker: "FILMMAKER MODE",
  expert1: "Expert (Bright Room)",
  expert2: "Expert (Dark Room)",
  tv_speaker: "TV Speaker",
  external_arc: "HDMI ARC",
  external_optical: "Optical",
  bt_soundbar: "Bluetooth Soundbar",
  lineout: "Line Out",
  headphone: "Headphones",
};

function valueLabel(value: string | number): string {
  const text = String(value);
  return VALUES[text] ?? humanize(text);
}

/** Options as the TV reports them: those it says are visible and active now. */
export function optionsFrom(values: readonly unknown[]): TvOption[] {
  const out: TvOption[] = [];
  for (const item of values) {
    if (typeof item === "object" && item !== null) {
      const entry = item as { value?: unknown; visible?: unknown; active?: unknown };
      if (entry.visible === false || entry.active === false) continue;
      if (typeof entry.value === "string" || typeof entry.value === "number") {
        out.push({ value: entry.value, label: valueLabel(entry.value) });
      }
    } else if (typeof item === "string" || typeof item === "number") {
      out.push({ value: item, label: valueLabel(item) });
    }
  }
  return out;
}

const KINDS: Readonly<Record<GenKind, TvKind>> = { b: "bool", e: "choice", r: "range" };

/** Sound output is offered as three destinations, not every one the TV knows. */
const FIXED: Readonly<Record<string, readonly TvOption[]>> = {
  "sound.soundOutput": [
    { value: "tv_speaker", label: "TV Speaker" },
    { value: "external_arc", label: "HDMI ARC" },
    { value: "external_optical", label: "Optical" },
  ],
};

/** Settings outside the generated categories, picked by hand. */
const OPTION_DEFS: readonly TvDef[] = [
  { category: "other", key: "simplinkEnable", title: "HDMI-CEC", kind: "bool" },
];

export interface TvPage {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly defs: readonly TvDef[];
}

function generatedDefs(keys: readonly (readonly [string, string, GenKind])[]): TvDef[] {
  return keys.map(([category, key, kind]) => {
    const id = `${category}.${key}`;
    const fixed = FIXED[id];
    return {
      category,
      key,
      title: TITLES[id] ?? humanize(key),
      kind: KINDS[kind],
      ...(fixed ? { fixed } : {}),
    };
  });
}

export const TV_PAGES: readonly TvPage[] = [
  ...TV_GEN_PAGES.map((page) => ({
    id: page.id,
    title: page.title,
    description: page.description,
    defs: generatedDefs(page.keys),
  })),
  {
    id: "tv-options",
    title: "TV Options",
    description: "HDMI-CEC.",
    defs: OPTION_DEFS,
  },
];

const BY_ID = new Map<string, TvDef>();
for (const page of TV_PAGES) for (const def of page.defs) BY_ID.set(tvId(def), def);

export function tvPage(pageId: string): TvPage | undefined {
  return TV_PAGES.find((page) => page.id === pageId);
}

export function tvDef(id: string): TvDef | undefined {
  return BY_ID.get(id);
}

/** A stored value as a scalar, or null for the objects some keys hold. */
function scalar(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

/** The options a choice offers now: the fixed set, else what the TV reported. */
export function choicesFor(def: TvDef, tv: TvSnapshot): readonly TvOption[] {
  const base = def.fixed ?? tv.choices[tvId(def)] ?? [];
  const current = scalar(tv.values[tvId(def)]);
  if (current === null) return base;
  if (base.some((option) => String(option.value) === String(current))) return base;
  return [{ value: current, label: valueLabel(current) }, ...base];
}

/** A row's current value as the detail column shows it. */
export function tvValue(def: TvDef, tv: TvSnapshot): string {
  const value = scalar(tv.values[tvId(def)]);
  if (value === null) return DASH;
  if (def.kind === "range") return String(value);
  if (def.kind === "bool") return valueLabel(value);
  const hit = choicesFor(def, tv).find((option) => String(option.value) === String(value));
  return hit?.label ?? valueLabel(value);
}

function sameType(current: string | number, next: number | string): string | number {
  return typeof current === "string" ? String(next) : Number(next);
}

/**
 * The value a step of `dir` writes, or null when there is nothing to write:
 * the key is not loaded yet, or is a range already at its end.
 *
 * A toggle flips whichever way it is pressed. A choice moves along its options
 * and wraps. A range moves by its step and stops at both ends. The written
 * value keeps the type the TV reported, since brightness comes back as a string.
 */
export function stepTvValue(def: TvDef, tv: TvSnapshot, dir: number): string | number | null {
  const current = scalar(tv.values[tvId(def)]);
  if (current === null) return null;
  if (def.kind === "bool") return String(current) === "on" ? "off" : "on";
  if (def.kind === "range") {
    const range = tv.ranges[tvId(def)];
    if (range === undefined) return null;
    const at = Number(current);
    if (!Number.isFinite(at)) return null;
    const raw = at + dir * range.step;
    const snapped = range.min + Math.round((raw - range.min) / range.step) * range.step;
    const next = Math.min(range.max, Math.max(range.min, snapped));
    return next === at ? null : sameType(current, next);
  }
  const options = choicesFor(def, tv);
  if (options.length === 0) return null;
  const at = options.findIndex((option) => String(option.value) === String(current));
  const size = options.length;
  const next = options[(((at < 0 ? 0 : at + dir) % size) + size) % size];
  return next === undefined ? null : sameType(current, next.value);
}

/** What the detail column draws for the focused key. */
export type DetailControl =
  | { readonly kind: "toggle"; readonly on: boolean }
  | { readonly kind: "slider"; readonly fill: number; readonly text: string }
  | { readonly kind: "choice" };

export function detailControl(def: TvDef, tv: TvSnapshot): DetailControl | null {
  const current = scalar(tv.values[tvId(def)]);
  if (current === null) return null;
  if (def.kind === "bool") return { kind: "toggle", on: String(current) === "on" };
  if (def.kind === "choice") return { kind: "choice" };
  const range = tv.ranges[tvId(def)];
  if (range === undefined) return null;
  const span = range.max - range.min;
  const fill = span <= 0 ? 0 : Math.min(1, Math.max(0, (Number(current) - range.min) / span));
  return { kind: "slider", fill, text: String(current) };
}

const HINTS: Readonly<Record<TvKind, string>> = {
  bool: "Press A, or left or right, to switch it.",
  choice: "Press A to choose, or left or right to step through.",
  range: "Press left or right to adjust. Hold to move faster.",
};

export function tvHint(def: TvDef, tv: TvSnapshot): string {
  return scalar(tv.values[tvId(def)]) === null ? "Not available right now." : HINTS[def.kind];
}

export interface InfoRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description: string;
}

function dash(text: string): string {
  return text === "" ? DASH : text;
}

/** The System Information rows, in order; empty values read as a dash. */
export function infoRows(tv: TvSnapshot): InfoRow[] {
  const volume = tv.volume === null ? DASH : tv.muted ? `${tv.volume} (muted)` : `${tv.volume}`;
  return [
    { id: "model", label: "Model", value: dash(tv.model), description: "The TV's model name." },
    {
      id: "firmware",
      label: "Firmware",
      value: dash(tv.firmware),
      description: "The installed system software version.",
    },
    {
      id: "network",
      label: "Network",
      value: dash(tv.network),
      description: "The connection the TV is using.",
    },
    {
      id: "address",
      label: "IP Address",
      value: dash(tv.address),
      description: "The TV's address on that network.",
    },
    { id: "volume", label: "Volume", value: volume, description: "The current output volume." },
    {
      id: "output",
      label: "Sound Output",
      value: dash(tv.output),
      description: "Where the TV sends its sound.",
    },
  ];
}
