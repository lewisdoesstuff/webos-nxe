/**
 * Global settings, pure. The store wraps this and the UI reads it.
 *
 * Defaults live in code and stored values layer over them, so a re-tuned default
 * can be applied later without clobbering customisations. `defaultsRev` marks a
 * stored document as predating a re-tune.
 */

/** Bump when a default below is re-tuned, and list the key in `RETUNED_KEYS`. */
export const DEFAULTS_REV = 1;

/** How a section orders the apps assigned to it. */
export type SortMode = "default" | "recent" | "name-asc" | "name-desc";

export interface Settings {
  defaultsRev: number;
  /** Empty means signed out, and the gamercard shows its caption instead. */
  gamertag: string;
  /** Shown on the gamercard and the profile pane; set by hand, since nothing earns it. */
  gamerscore: number;
  /** The channel the hub starts on, by section id. Apps when unset. */
  lastChannel: string;
  clock24h: boolean;
  showClock: boolean;
  /** The A/B/X/Y + LB/RB row at the foot of the screen. */
  hintBar: boolean;
  /** Toasts over the hub, such as the sign-in. */
  toasts: boolean;
  reduceMotion: boolean;
  /** Explicit app order within a section; anything unlisted keeps its position. */
  appOrder: string[];
  hiddenApps: string[];
  /** Apps the user has moved to a different section, by app id. */
  appSection: Record<string, string>;
  /** Sort per section, by section id. Anything missing is `default`. */
  sortModes: Record<string, SortMode>;
  /** Most recently launched app ids, newest first. */
  recentApps: string[];
  /** Backdrop id, or `custom` to use `wallpaperPath` instead. */
  background: string;
  wallpaperPath: string;
  backgroundBrightness: number;
  navSound: boolean;
  musicPath: string;
  musicVolume: number;
  /** Photograph an input on the way out of it, and show it on its row. */
  previews: boolean;
  /** Idle seconds before the screensaver, 0 for off. */
  screensaverDelay: number;
  /** Fraction the backdrop dims to while the screensaver runs, 0..1. */
  screensaverDim: number;
}

export const SETTINGS_DEFAULTS: Settings = {
  defaultsRev: DEFAULTS_REV,
  gamertag: "Player",
  gamerscore: 0,
  lastChannel: "apps",
  clock24h: true,
  showClock: true,
  hintBar: true,
  toasts: true,
  reduceMotion: false,
  appOrder: [],
  hiddenApps: [],
  appSection: {},
  sortModes: {},
  recentApps: [],
  background: "none",
  wallpaperPath: "/media/internal/ooo.lew.xne/wallpaper.jpg",
  backgroundBrightness: 1,
  navSound: true,
  musicPath: "",
  musicVolume: 0.5,
  previews: true,
  screensaverDelay: 120,
  screensaverDim: 0.25,
};

type Stored = Record<string, unknown>;

function isRecord(value: unknown): value is Stored {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : fallback;
}

function stringMapOr(value: unknown, fallback: Record<string, string>): Record<string, string> {
  if (!isRecord(value)) return fallback;
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") next[key] = entry;
  }
  return next;
}

const SORT_MODE_IDS: readonly string[] = ["default", "recent", "name-asc", "name-desc"];

function sortModesOr(value: unknown, fallback: Record<string, SortMode>): Record<string, SortMode> {
  if (!isRecord(value)) return fallback;
  const next: Record<string, SortMode> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && SORT_MODE_IDS.includes(entry)) {
      next[key] = entry as SortMode;
    }
  }
  return next;
}

/**
 * Stored settings layered over the code defaults.
 *
 * Each known key is read explicitly rather than spreading the stored object, so
 * a stale or corrupted document cannot inject keys the app does not understand.
 * `migrated` reports that the stored document predates `DEFAULTS_REV`.
 */
export function mergeSettings(stored: unknown): { settings: Settings; migrated: boolean } {
  const source: Stored = isRecord(stored) ? stored : {};
  const storedRev = typeof source["defaultsRev"] === "number" ? source["defaultsRev"] : 0;

  const settings: Settings = {
    defaultsRev: DEFAULTS_REV,
    gamertag: stringOr(source["gamertag"], SETTINGS_DEFAULTS.gamertag),
    gamerscore: numberOr(source["gamerscore"], SETTINGS_DEFAULTS.gamerscore),
    lastChannel: stringOr(source["lastChannel"], SETTINGS_DEFAULTS.lastChannel),
    clock24h: booleanOr(source["clock24h"], SETTINGS_DEFAULTS.clock24h),
    showClock: booleanOr(source["showClock"], SETTINGS_DEFAULTS.showClock),
    hintBar: booleanOr(source["hintBar"], SETTINGS_DEFAULTS.hintBar),
    toasts: booleanOr(source["toasts"], SETTINGS_DEFAULTS.toasts),
    reduceMotion: booleanOr(source["reduceMotion"], SETTINGS_DEFAULTS.reduceMotion),
    appOrder: stringArrayOr(source["appOrder"], SETTINGS_DEFAULTS.appOrder),
    hiddenApps: stringArrayOr(source["hiddenApps"], SETTINGS_DEFAULTS.hiddenApps),
    appSection: stringMapOr(source["appSection"], SETTINGS_DEFAULTS.appSection),
    sortModes: sortModesOr(source["sortModes"], SETTINGS_DEFAULTS.sortModes),
    recentApps: stringArrayOr(source["recentApps"], SETTINGS_DEFAULTS.recentApps),
    background: stringOr(source["background"], SETTINGS_DEFAULTS.background),
    wallpaperPath: stringOr(source["wallpaperPath"], SETTINGS_DEFAULTS.wallpaperPath),
    backgroundBrightness: numberOr(
      source["backgroundBrightness"],
      SETTINGS_DEFAULTS.backgroundBrightness,
    ),
    navSound: booleanOr(source["navSound"], SETTINGS_DEFAULTS.navSound),
    musicPath: stringOr(source["musicPath"], SETTINGS_DEFAULTS.musicPath),
    musicVolume: numberOr(source["musicVolume"], SETTINGS_DEFAULTS.musicVolume),
    previews: booleanOr(source["previews"], SETTINGS_DEFAULTS.previews),
    screensaverDelay: numberOr(source["screensaverDelay"], SETTINGS_DEFAULTS.screensaverDelay),
    screensaverDim: numberOr(source["screensaverDim"], SETTINGS_DEFAULTS.screensaverDim),
  };

  return { settings, migrated: storedRev < DEFAULTS_REV };
}

/**
 * Apply a stored order to a canonical list: listed entries first, in that
 * order, followed by anything unlisted in its original relative position.
 * Entries naming something that no longer exists are dropped.
 */
export function applyOrder(ids: readonly string[], order: readonly string[]): string[] {
  if (order.length === 0) return [...ids];
  const rank = new Map(order.map((id, index) => [id, index]));
  const present = new Set(ids);
  return [...ids]
    .sort((a, b) => {
      const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (ra === rb) return 0;
      return ra - rb;
    })
    .filter((id) => present.has(id));
}

/** The section an app sits on: the user's choice, else the caller's default. */
export function sectionForApp(
  appId: string,
  appSection: Record<string, string>,
  fallback: string,
): string {
  return appSection[appId] ?? fallback;
}

export type FlagKeys = {
  [K in keyof Settings]-?: boolean extends Settings[K] ? K : never;
}[keyof Settings];
export type LevelKeys = {
  [K in keyof Settings]-?: number extends Settings[K] ? K : never;
}[keyof Settings];
type ChoiceKeys = {
  [K in keyof Settings]-?: string extends Settings[K] ? K : never;
}[keyof Settings];

/**
 * One write, already resolved to its value, so applying it is a single call and
 * whatever offers the setting never has to know how the key is stored.
 */
export type SettingChange =
  | { readonly kind: "flag"; readonly key: FlagKeys; readonly value: boolean }
  | { readonly kind: "level"; readonly key: LevelKeys; readonly value: number }
  | { readonly kind: "choice"; readonly key: ChoiceKeys; readonly value: string }
  | { readonly kind: "sort"; readonly section: string; readonly mode: SortMode }
  | { readonly kind: "app-section"; readonly appId: string; readonly section: string }
  | { readonly kind: "app-hidden"; readonly appId: string; readonly hidden: boolean }
  | { readonly kind: "app-order"; readonly order: readonly string[] }
  | { readonly kind: "hidden-clear" }
  | { readonly kind: "layout-reset" };

/**
 * Whether one stored value counts as a change from the shipped default.
 *
 * Compared by length for the lists and maps, since every one of them defaults to
 * empty, so an entry anywhere in them is a change and their order is not.
 */
function isChanged(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(value) || Array.isArray(fallback)) {
    if (!Array.isArray(value) || !Array.isArray(fallback)) return true;
    return value.length !== fallback.length;
  }
  if (isRecord(value) || isRecord(fallback)) {
    if (!isRecord(value) || !isRecord(fallback)) return true;
    return Object.keys(value).length !== Object.keys(fallback).length;
  }
  return value !== fallback;
}

/** The keys the user has moved off the shipped default, in declaration order. */
export function changedKeys(settings: Settings): (keyof Settings)[] {
  return (Object.keys(SETTINGS_DEFAULTS) as (keyof Settings)[]).filter((key) =>
    isChanged(settings[key], SETTINGS_DEFAULTS[key]),
  );
}

/** How many settings differ from the shipped default, which is what a reset costs. */
export function changeCount(settings: Settings): number {
  return changedKeys(settings).length;
}
