/**
 * Turning a `theme.json` into a theme, pure: relative paths become URLs under
 * the theme's folder, colour strings become triples, and the result is laid
 * over a base theme slot by slot.
 */

import { hex, type Rgb } from "../bootTheme";
import {
  BUTTON_KEYS,
  ICON_KEYS,
  CARD_COUNT,
  type ButtonKey,
  SOUND_KEYS,
  type SoundKey,
  type Theme,
  type ThemeFont,
  type ThemeManifest,
} from "./types";

export function joinUrl(base: string, relative: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(relative)) return relative;
  const trimmed = relative.replace(/^\.\//, "");
  return `${base.replace(/\/+$/, "")}/${trimmed}`;
}

const COLOR = /^#([0-9a-f]{6})$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `#rrggbb` strings to triples, and a texture's relative `url` to a full one, anywhere under `boot`. */
function reviveBoot(value: unknown, base: string, key = ""): unknown {
  if (typeof value === "string") {
    const match = COLOR.exec(value);
    if (match?.[1] !== undefined) return hex(Number.parseInt(match[1], 16));
    return key === "url" ? joinUrl(base, value) : value;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, inner]) => [name, reviveBoot(inner, base, name)]),
    );
  }
  return value;
}

function mergeDeep<T>(base: T, layer: unknown): T {
  if (!isRecord(base) || !isRecord(layer)) return (layer === undefined ? base : layer) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [name, inner] of Object.entries(layer)) {
    out[name] = name in base ? mergeDeep(base[name], inner) : inner;
  }
  return out as T;
}

function strings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Lay one manifest, found at `base`, over `under`. Anything malformed is ignored, so a bad slot falls back. */
export function applyManifest(under: Theme, manifest: ThemeManifest, base: string): Theme {
  const sounds: Record<SoundKey, string> = { ...under.sounds };
  for (const key of SOUND_KEYS) {
    const path = manifest.sounds?.[key];
    if (typeof path === "string") sounds[key] = joinUrl(base, path);
  }

  const cards = [...under.cards];
  if (strings(manifest.cards)) {
    manifest.cards.slice(0, CARD_COUNT).forEach((path, index) => {
      cards[index] = joinUrl(base, path);
    });
  }

  const fonts: ThemeFont[] = [...under.fonts];
  for (const font of manifest.fonts ?? []) {
    if (typeof font.family !== "string" || typeof font.src !== "string") continue;
    const weight = typeof font.weight === "number" ? font.weight : 400;
    const rest = fonts.filter((kept) => kept.family !== font.family || kept.weight !== weight);
    fonts.length = 0;
    fonts.push(...rest, { family: font.family, src: joinUrl(base, font.src), weight });
  }

  const art = {
    orb: manifest.art?.orb === undefined ? under.art.orb : joinUrl(base, manifest.art.orb),
    settings:
      manifest.art?.settings === undefined
        ? under.art.settings
        : joinUrl(base, manifest.art.settings),
  };

  const buttons: Partial<Record<ButtonKey, string>> = { ...under.icons.buttons };
  for (const key of BUTTON_KEYS) {
    const path = manifest.icons?.buttons?.[key];
    if (typeof path === "string") buttons[key] = joinUrl(base, path);
  }

  const icons: Theme["icons"] = { ...under.icons, buttons };
  for (const key of ICON_KEYS) {
    const path = manifest.icons?.[key];
    if (typeof path === "string") (icons as Record<string, unknown>)[key] = joinUrl(base, path);
  }

  return {
    id: manifest.id,
    name: manifest.name,
    sounds,
    cards,
    art,
    icons,
    avatar: manifest.avatar === undefined ? under.avatar : joinUrl(base, manifest.avatar),
    strings: mergeDeep(under.strings, manifest.strings),
    boot: mergeDeep(under.boot, reviveBoot(manifest.boot, base)),
    fonts,
    cssVars: { ...under.cssVars, ...manifest.cssVars },
  };
}

export type { Rgb };
