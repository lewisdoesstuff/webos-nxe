import type { BootTheme } from "../bootTheme";

/** The clips a theme can replace, by the names the engine plays them under. */
export const SOUND_KEYS = [
  "option",
  "panelLeft",
  "panelRight",
  "channelUp",
  "channelDown",
  "select",
  "back",
  "focus",
  "transition",
  "hudOpen",
  "hudClose",
  "hudFocus",
  "hudSelect",
  "blade1",
  "blade2",
  "blade3",
  "boot",
  "toast",
] as const;

export type SoundKey = (typeof SOUND_KEYS)[number];

export const CARD_COUNT = 8;

/** Names and captions, the part of a theme that is wording rather than art. */
export interface ThemeStrings {
  /** The Guide's five channels, top to bottom. */
  readonly channels: readonly [string, string, string, string, string];
  readonly gameStore: string;
  readonly mediaStore: string;
  /** The Guide's Y caption. */
  readonly dashboard: string;
  readonly gamertag: string;
  readonly gamerscore: string;
}

export interface ThemeFont {
  /** The family name the stylesheet asks for. */
  readonly family: string;
  readonly src: string;
  readonly weight: number;
}

/** A theme as the app uses it: every slot filled, every file a URL. */
export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly sounds: Readonly<Record<SoundKey, string>>;
  readonly cards: readonly string[];
  readonly art: {
    readonly orb: string;
    readonly settings: string;
    /** A silhouette for the sign-in toast, drawn in place of the built-in console when set. */
    readonly console?: string;
  };
  readonly avatar: string;
  readonly strings: ThemeStrings;
  readonly boot: BootTheme;
  readonly fonts: readonly ThemeFont[];
  /** Custom properties set on the root element, for colours a stylesheet reads. */
  readonly cssVars: Readonly<Record<string, string>>;
}

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { -readonly [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * `theme.json`. Every field is optional and every path is relative to the
 * manifest. An omitted slot comes from `extends`, or from the default theme.
 * Boot colours are `#rrggbb` strings.
 */
export interface ThemeManifest {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  /** The id of another installed theme this one is a variation of. */
  readonly extends?: string;
  readonly sounds?: Partial<Record<SoundKey, string>>;
  readonly fonts?: readonly ThemeFont[];
  readonly cards?: readonly string[];
  readonly art?: {
    readonly orb?: string;
    readonly settings?: string;
    readonly console?: string;
  };
  readonly avatar?: string;
  readonly strings?: Partial<ThemeStrings>;
  /** The boot's numbers and textures; a texture's `url` is a relative path. */
  readonly boot?: DeepPartial<BootTheme>;
  readonly cssVars?: Readonly<Record<string, string>>;
}

export interface ThemeInfo {
  readonly id: string;
  readonly name: string;
}
