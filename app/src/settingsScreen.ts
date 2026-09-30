/**
 * The dashboard's own settings screen: its content, its values and what `A`
 * does on each row.
 *
 * Pure and framework-free, like `pages.ts`: the screen is a drill of `ListPage`
 * surfaces (the root names the categories, each category lists its rows), so
 * everything here builds pages out of the stored settings and the installed
 * apps and resolves an `A` press to either a deeper page or one `SettingChange`.
 *
 * Only settings with a live reader are listed. A toggle with nothing reading
 * it is a dead control, so the backdrop and the screensaver stay out until
 * their features land, each of which adds its rows here as data. What is here:
 * the flags something reads, the hidden apps, which no other screen can bring
 * back, and the TV's own sound and option settings and system information.
 */

import type { ListPage, Page, PageFocus } from "./pages";
import { paneArt, type PaneItem } from "./panel";
import type { FlagKeys, LevelKeys, SettingChange, Settings } from "./settings";
import {
  choicesFor,
  detailControl,
  EMPTY_TV,
  infoRows,
  stepTvValue,
  tvDef,
  tvHint,
  tvId,
  tvPage,
  TV_PAGES,
  tvValue,
  type DetailControl,
  type TvDef,
  type TvSnapshot,
} from "./tvSettings";

/** An installed app as the screen reads it: its name, and any art for its row. */
export type SettingsApp = PaneItem;

/** One drill level between the root and the rows. */
export interface SettingsCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  { id: "general", title: "General", description: "The dashboard's own behaviour." },
  {
    id: "hidden",
    title: "Hidden Apps",
    description: "Apps put away with X. Select one to bring it back.",
  },
  ...TV_PAGES.map((page) => ({
    id: page.id,
    title: page.title,
    description: page.description,
  })),
  {
    id: "system",
    title: "System Information",
    description: "The TV's model, software and connection.",
  },
];

/** A boolean setting, flipped by `A`. */
export interface FlagDef {
  readonly kind: "flag";
  readonly key: FlagKeys;
  readonly title: string;
  readonly description: string;
}

/**
 * A numeric setting over fixed presets, advanced by `A`.
 *
 * No live level has a reader yet (`musicVolume` is silent with no `musicPath`,
 * the backdrop and the screensaver are hardcoded), so no category lists one.
 * The advance is here and tested so the first level row is data.
 */
export interface LevelDef {
  readonly kind: "level";
  readonly key: LevelKeys;
  readonly title: string;
  readonly description: string;
  readonly options: readonly number[];
  readonly format: (value: number) => string;
}

export type SettingDef = FlagDef | LevelDef;

export const GENERAL_DEFS: readonly SettingDef[] = [
  {
    kind: "flag",
    key: "navSound",
    title: "Menu Sounds",
    description: "The blips on move, select and back. Off is silent everywhere.",
  },
  {
    kind: "flag",
    key: "previews",
    title: "Input Previews",
    description: "Photograph an input on the way out of it, and show it on its row.",
  },
  {
    kind: "flag",
    key: "showClock",
    title: "Show Clock",
    description: "The time on the Guide's title band.",
  },
  {
    kind: "flag",
    key: "clock24h",
    title: "24-Hour Clock",
    description: "Off shows the Guide's clock as 12-hour time.",
  },
  {
    kind: "flag",
    key: "toasts",
    title: "Notifications",
    description: "The pop-up over the hub when you sign in.",
  },
  {
    kind: "flag",
    key: "hintBar",
    title: "Button Hints",
    description: "The A, B, X and Y prompts along the foot of the screen.",
  },
  {
    kind: "flag",
    key: "reduceMotion",
    title: "Skip Boot Animation",
    description: "Start straight on the dashboard instead of playing the boot.",
  },
];

const PICK = "settings:pick:";

/** The page that lists a choice's options, opened by A on the choice's row. */
function pickPage(def: TvDef, tv: TvSnapshot): ListPage {
  return {
    kind: "list",
    id: `${PICK}${tvId(def)}`,
    title: def.title,
    groups: [
      {
        id: "pick",
        title: def.title,
        items: choicesFor(def, tv).map((option) => ({
          id: `opt:${option.value}`,
          label: option.label,
        })),
      },
    ],
  };
}

/** The index of the option a choice is on now, for the picker to open there. */
export function pickFocus(def: TvDef, tv: TvSnapshot): number {
  const current = tv.values[tvId(def)];
  const at = choicesFor(def, tv).findIndex((option) => String(option.value) === String(current));
  return Math.max(0, at);
}

/** The root's own page, listing the categories. */
export function settingsRoot(): ListPage {
  return {
    kind: "list",
    id: "settings",
    title: "XNE Settings",
    groups: [
      {
        id: "settings",
        title: "Settings",
        items: SETTINGS_CATEGORIES.map((category) => ({ id: category.id, label: category.title })),
      },
    ],
  };
}

const SHOW_ALL_ID = "show-all";

/** The row that empties the hidden list. */
export const SHOW_ALL_LABEL = "Show All Apps";

/** A category's page. `apps` supplies the hidden apps' titles. */
export function settingsCategoryPage(
  category: string,
  settings: Settings,
  apps: readonly SettingsApp[],
  tv: TvSnapshot = EMPTY_TV,
): ListPage | null {
  const page = tvPage(category);
  if (page) {
    return {
      kind: "list",
      id: `settings:${category}`,
      title: page.title,
      groups: [
        {
          id: category,
          title: page.title,
          items: page.defs.map((def) => ({ id: tvId(def), label: def.title })),
        },
      ],
    };
  }
  if (category === "system") {
    return {
      kind: "list",
      id: "settings:system",
      title: "System Information",
      groups: [
        {
          id: "system",
          title: "System Information",
          items: infoRows(tv).map((row) => ({ id: `info:${row.id}`, label: row.label })),
        },
      ],
    };
  }
  if (category === "general") {
    return {
      kind: "list",
      id: "settings:general",
      title: "General",
      groups: [
        {
          id: "general",
          title: "General",
          items: GENERAL_DEFS.map((def) => ({ id: def.key, label: def.title })),
        },
      ],
    };
  }
  if (category === "hidden") {
    const byId = new Map(apps.map((app) => [app.id, app]));
    return {
      kind: "list",
      id: "settings:hidden",
      title: "Hidden Apps",
      groups: [
        {
          id: "hidden",
          title: "Hidden Apps",
          items: [
            ...settings.hiddenApps.map((id) => {
              const app = byId.get(id);
              const art = app ? paneArt(app) : null;
              return {
                id: `hidden:${id}`,
                label: app?.title ?? id,
                ...(art ? { icon: art } : {}),
              };
            }),
            { id: SHOW_ALL_ID, label: SHOW_ALL_LABEL },
          ],
        },
      ],
    };
  }
  return null;
}

/** The TV's browser, which Customize Avatar opens on 360sona. */
export const BROWSER_APP = "com.webos.app.beanbrowser";
export const AVATAR_EDITOR_URL = "https://360sona.com";

/**
 * Where a new avatar is picked up: an export saved to the TV's Downloads under
 * 360sona's default name replaces the bundled model on the next launch.
 */
export const AVATAR_DOWNLOAD = "/media/internal/downloads/MyAvatar.glb";

/**
 * The profile's menu, opened by A on the profile pane, as retail's avatar menu
 * was: the gamertag, typed with the TV's keyboard, and the avatar, edited on
 * 360sona in the TV's browser.
 */
export function profilePage(): ListPage {
  return {
    kind: "list",
    id: "profile",
    title: "Profile",
    groups: [
      {
        id: "profile",
        title: "Profile",
        items: [
          { id: "gamertag", label: "Gamertag" },
          { id: "gamerscore", label: "Gamerscore" },
          { id: "avatar", label: "Customize Avatar" },
        ],
      },
    ],
  };
}

/** The most a gamerscore can be typed as. */
export const GAMERSCORE_MAX = 9_999_999;

/** A gamerscore as the gamercard shows it, with thousands grouped. */
export function formatGamerscore(score: number): string {
  return Math.round(score).toLocaleString("en-US");
}

/** A typed gamerscore: digits, optionally grouped with commas or spaces, in range. Null otherwise. */
export function parseGamerscore(text: string): number | null {
  const digits = text.trim().replace(/[,\s]/g, "");
  if (!/^\d{1,7}$/.test(digits)) return null;
  const score = Number(digits);
  return score <= GAMERSCORE_MAX ? score : null;
}

function profileDetail(id: string, settings: Settings): SettingDetail {
  if (id === "gamertag") {
    return {
      values: [settings.gamertag || "Player1"],
      description: "Press A and type a new gamertag.",
    };
  }
  if (id === "gamerscore") {
    return {
      values: [formatGamerscore(settings.gamerscore)],
      description: "Press A and type a new gamerscore.",
    };
  }
  if (id === "avatar") {
    return {
      values: [],
      description:
        "Opens 360sona in the browser. Export your avatar as MyAvatar.glb into Downloads and it stands on the dashboard from the next launch.",
    };
  }
  return { values: [], description: "" };
}

/** Any settings page by its id, for pushing and for rebuilding after a change. */
export function settingsPageFor(
  id: string,
  settings: Settings,
  apps: readonly SettingsApp[],
  tv: TvSnapshot = EMPTY_TV,
): ListPage | null {
  if (id === "settings") return settingsRoot();
  if (id.startsWith(PICK)) {
    const def = tvDef(id.slice(PICK.length));
    return def === undefined ? null : pickPage(def, tv);
  }
  if (id === "profile") return profilePage();
  if (id.startsWith("settings:"))
    return settingsCategoryPage(id.slice("settings:".length), settings, apps, tv);
  return null;
}

/** A row's current value as the detail column shows it. */
export function settingValue(def: SettingDef, settings: Settings): string {
  if (def.kind === "flag") return settings[def.key] ? "On" : "Off";
  return def.format(settings[def.key]);
}

/**
 * The next preset after the stored value, wrapping to the first.
 *
 * A stored value between presets steps up to the next one rather than
 * repeating the nearest, so `A` always visibly does something.
 */
export function advanceLevel(def: LevelDef, current: number): number {
  return def.options.find((option) => option > current) ?? def.options[0] ?? current;
}

/** The right column for the focused row: its values over its description. */
export interface SettingDetail {
  readonly values: readonly string[];
  readonly description: string;
  /** A drawn control for the focused row, in place of its value text. */
  readonly control?: DetailControl;
}

function categoryDetail(id: string): SettingDetail {
  const category = SETTINGS_CATEGORIES.find((entry) => entry.id === id);
  return { values: [], description: category?.description ?? "" };
}

/**
 * The detail for whatever the focus is on. Unknown rows describe nothing
 * rather than throwing, since the focus can outrun a list that just shrank.
 */
export function settingsDetail(
  page: Page,
  focus: PageFocus,
  settings: Settings,
  apps: readonly SettingsApp[],
  tv: TvSnapshot = EMPTY_TV,
): SettingDetail {
  if (page.kind !== "list") return { values: [], description: "" };
  const item = page.groups[focus.group]?.items[focus.item];
  if (page.id.startsWith(PICK)) {
    const def = tvDef(page.id.slice(PICK.length));
    return {
      values: [],
      description: def === undefined ? "" : `Press A to use this for ${def.title}.`,
    };
  }
  const group = tvPage(page.id.slice("settings:".length));
  if (group && page.id.startsWith("settings:")) {
    const def = group.defs.find((entry) => tvId(entry) === item?.id);
    if (def === undefined) return { values: [], description: "" };
    const control = detailControl(def, tv);
    return {
      values: control?.kind === "slider" || control?.kind === "toggle" ? [] : [tvValue(def, tv)],
      description: tvHint(def, tv),
      ...(control ? { control } : {}),
    };
  }
  if (page.id === "settings:system") {
    const row = infoRows(tv).find((entry) => `info:${entry.id}` === item?.id);
    return row === undefined
      ? { values: [], description: "" }
      : { values: [row.value], description: row.description };
  }
  if (page.id === "profile") return profileDetail(item?.id ?? "", settings);
  if (page.id === "settings" || item === undefined) {
    return categoryDetail(item?.id ?? "");
  }
  if (page.id === "settings:general") {
    const def = GENERAL_DEFS.find((entry) => entry.key === item.id);
    if (def === undefined) return { values: [], description: "" };
    return { values: [settingValue(def, settings)], description: def.description };
  }
  if (item.id === SHOW_ALL_ID) {
    return {
      values: [],
      description:
        settings.hiddenApps.length === 0
          ? "No apps are hidden. Press X on an app in the dashboard to put it away."
          : "Put every hidden app back on its channel.",
    };
  }
  const titles = new Map(apps.map((app) => [app.id, app.title]));
  const id = item.id.startsWith("hidden:") ? item.id.slice("hidden:".length) : item.id;
  return { values: [], description: `Put ${titles.get(id) ?? id} back on its channel.` };
}

/** Rows the list column shows at once. */
export const SETTINGS_ROWS = 10;

/**
 * The index of the first row shown. The window stays put until the focus
 * would leave it, then follows it, and never runs past the last row.
 */
export function settingsWindow(count: number, focus: number, slots = SETTINGS_ROWS): number {
  const last = Math.max(0, count - slots);
  return Math.min(last, Math.max(0, focus - (slots - 1)));
}

/** What `A` does on the focused row: open a deeper page, or write one change. */
export type SettingsAction =
  | { readonly kind: "push"; readonly page: ListPage; readonly focusItem?: number }
  | { readonly kind: "change"; readonly change: SettingChange }
  | { readonly kind: "edit"; readonly key: "gamertag" | "gamerscore" }
  | {
      readonly kind: "tv";
      readonly def: TvDef;
      readonly value: string | number;
      /** The picker closes once it has written. */
      readonly pop?: boolean;
    }
  | {
      readonly kind: "launch";
      readonly id: string;
      readonly params: Readonly<Record<string, unknown>>;
    };

/**
 * The `A` press resolved, or null where there is nothing to do.
 *
 * Categories push their page; flags flip; levels advance to the next preset;
 * a hidden app comes back; Show All empties the list. An `A` on a blank slot
 * or a stale focus is null, and the caller stays silent the way it does for a
 * clamped step.
 */
export function settingsAction(
  page: Page,
  focus: PageFocus,
  settings: Settings,
  apps: readonly SettingsApp[],
  tv: TvSnapshot = EMPTY_TV,
): SettingsAction | null {
  if (page.kind !== "list") return null;
  const item = page.groups[focus.group]?.items[focus.item];
  if (item === undefined) return null;
  if (page.id.startsWith(PICK)) {
    const def = tvDef(page.id.slice(PICK.length));
    if (def === undefined || !item.id.startsWith("opt:")) return null;
    const option = choicesFor(def, tv).find((entry) => `opt:${entry.value}` === item.id);
    return option === undefined ? null : { kind: "tv", def, value: option.value, pop: true };
  }
  const group = tvPage(page.id.slice("settings:".length));
  if (group && page.id.startsWith("settings:")) {
    const def = group.defs.find((entry) => tvId(entry) === item.id);
    if (def === undefined) return null;
    if (def.kind === "choice") {
      if (choicesFor(def, tv).length === 0) return null;
      return { kind: "push", page: pickPage(def, tv), focusItem: pickFocus(def, tv) };
    }
    const value = def.kind === "bool" ? stepTvValue(def, tv, 1) : null;
    return value === null ? null : { kind: "tv", def, value };
  }
  if (page.id === "profile") {
    if (item.id === "gamertag") return { kind: "edit", key: "gamertag" };
    if (item.id === "gamerscore") return { kind: "edit", key: "gamerscore" };
    if (item.id === "avatar") {
      return { kind: "launch", id: BROWSER_APP, params: { target: AVATAR_EDITOR_URL } };
    }
    return null;
  }
  if (page.id === "settings") {
    const next = settingsPageFor(`settings:${item.id}`, settings, apps, tv);
    return next === null ? null : { kind: "push", page: next };
  }
  if (page.id === "settings:general") {
    const def = GENERAL_DEFS.find((entry) => entry.key === item.id);
    if (def === undefined) return null;
    if (def.kind === "flag") {
      return { kind: "change", change: { kind: "flag", key: def.key, value: !settings[def.key] } };
    }
    return {
      kind: "change",
      change: { kind: "level", key: def.key, value: advanceLevel(def, settings[def.key]) },
    };
  }
  if (page.id === "settings:hidden") {
    if (item.id === SHOW_ALL_ID) return { kind: "change", change: { kind: "hidden-clear" } };
    if (!item.id.startsWith("hidden:")) return null;
    return {
      kind: "change",
      change: { kind: "app-hidden", appId: item.id.slice("hidden:".length), hidden: false },
    };
  }
  return null;
}

/**
 * Left or right on the focused row: flips a toggle, steps a choice along its
 * options, moves a slider one step. Null where the row has no such control.
 */
export function settingsStep(
  page: Page,
  focus: PageFocus,
  tv: TvSnapshot,
  dir: number,
): SettingsAction | null {
  if (page.kind !== "list" || page.id.startsWith(PICK)) return null;
  const item = page.groups[focus.group]?.items[focus.item];
  const group = tvPage(page.id.slice("settings:".length));
  if (item === undefined || group === undefined || !page.id.startsWith("settings:")) return null;
  const def = group.defs.find((entry) => tvId(entry) === item.id);
  if (def === undefined) return null;
  const value = stepTvValue(def, tv, dir);
  return value === null ? null : { kind: "tv", def, value };
}
