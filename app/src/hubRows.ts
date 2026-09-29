import allIcon from "./assets/system/all.svg?inline";
import generalIcon from "./assets/system/general.svg?inline";
import networkIcon from "./assets/system/network.svg?inline";
import pictureIcon from "./assets/system/picture.svg?inline";
import settingsIcon from "./assets/system/settings.svg?inline";
import soundIcon from "./assets/system/sound.svg?inline";
import type { ListPage } from "./pages";
import { recentlyLaunched, type Reported, type SectionId, SECTIONS, sectionRows } from "./sections";
import type { Settings } from "./settings";
import type { LaunchPoint } from "./types";

/** What a pane launches when it is not an installed app's own launch point. */
export interface LaunchTarget {
  readonly id: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * A pane of the hub's row. Most are launch points, and two kinds are made here:
 * a settings page, which launches the TV's settings app with a target, and an
 * "All" pane, which opens the channel's page instead of launching anything.
 * An empty channel's row holds one more kind: a placeholder, which is drawn
 * and never launched or listed.
 */
export interface HubItem extends LaunchPoint {
  readonly launch?: LaunchTarget;
  readonly all?: true;
  readonly empty?: true;
  /** The dashboard's own settings page, opened rather than launched. */
  readonly settings?: true;
  /** The profile pane: the gamercard, with the avatar standing beside it. */
  readonly profile?: true;
  /** The profile's gamerscore. */
  readonly score?: number;
  /** The profile's recent apps, newest first. */
  readonly recent?: readonly LaunchPoint[];
}

const SETTINGS_APP = "com.palm.app.settings";
const NETWORK_APP = "com.webos.app.firstuse-overlay";

/**
 * The TV's own settings pages, VERIFIED on the TV. Settings maps `picture`,
 * `sound` and `general` to its pages and falls back to Picture for anything
 * else; it opens its own network page through the first-use overlay.
 */
export const SYSTEM_PANES: readonly HubItem[] = [
  {
    id: "system:picture",
    title: "Picture",
    icon: pictureIcon,
    launch: { id: SETTINGS_APP, params: { target: "picture" } },
  },
  {
    id: "system:sound",
    title: "Sound",
    icon: soundIcon,
    launch: { id: SETTINGS_APP, params: { target: "sound" } },
  },
  {
    id: "system:network",
    title: "Network",
    icon: networkIcon,
    launch: { id: NETWORK_APP, params: { target: "network" } },
  },
  {
    id: "system:general",
    title: "General",
    icon: generalIcon,
    launch: { id: SETTINGS_APP, params: { target: "general" } },
  },
  {
    id: "system:settings",
    title: "All Settings",
    icon: settingsIcon,
    launch: { id: SETTINGS_APP, params: {} },
  },
];

/**
 * The dashboard's own settings, beside the TV's. It opens a page rather than
 * launching anything. It shares the sun tile with All Settings: channels have
 * no icons of their own, and the titles tell them apart until they do.
 */
export const XNE_SETTINGS_PANE: HubItem = {
  id: "xne:settings",
  title: "XNE Settings",
  icon: settingsIcon,
  settings: true,
};

/**
 * The profile, second on Apps, the home channel, as it was second on My Xbox
 * (t062): the gamertag and gamerscore on the pane's face, the avatar standing
 * beside it, and the apps launched last under "Recent Apps" as retail's
 * card listed the latest games.
 * It launches nothing; retail's A opened the avatar's menu, which is not
 * built.
 */
/** As many as fit left of the avatar. */
export const PROFILE_RECENT = 3;

export function profilePane(settings: Settings, points: readonly Reported[] = []): HubItem {
  return {
    id: "xne:profile",
    title: settings.gamertag || "Player1",
    profile: true,
    score: settings.gamerscore,
    recent: recentlyLaunched(points, settings, PROFILE_RECENT),
  };
}

export function isProfilePane(item: HubItem | null | undefined): boolean {
  return item?.profile === true;
}

export function isAllPane(item: HubItem | null | undefined): boolean {
  return item?.all === true;
}

export function isEmptyPane(item: HubItem | null | undefined): boolean {
  return item?.empty === true;
}

export function isSettingsPane(item: HubItem | null | undefined): boolean {
  return item?.settings === true;
}

/**
 * Whether X can hide this pane: a real launch point, not synthetic chrome.
 *
 * Settings panes carry their own launch target, and "All", placeholder and
 * settings panes are the row's own furniture, so none of them can leave it. A
 * hidden real item leaves the row because `sectionRows` filters it.
 */
export function isHideable(item: HubItem | null | undefined): item is HubItem {
  return (
    !!item &&
    !isAllPane(item) &&
    !isEmptyPane(item) &&
    !isSettingsPane(item) &&
    !isProfilePane(item) &&
    item.launch === undefined
  );
}

function labelOf(channel: SectionId): string {
  return SECTIONS.find((section) => section.id === channel)?.label ?? channel;
}

/**
 * One inert pane for a channel with nothing in it, so the row is not blank.
 *
 * It carries no icon: channels have none, and the pane draws the title's
 * initial the way it does for any icon-less item. Its id is namespaced like an
 * "All" pane's, but nothing ever launches it: `pageItems` leaves it out and
 * the shell's A guard turns it away.
 */
function emptyPane(channel: SectionId): HubItem {
  const label = labelOf(channel);
  return { id: `empty:${channel}`, title: `No ${label.toLowerCase()} installed`, empty: true };
}

/** The channel's items, without the "All" pane. Empty when there are none. */
export function channelItems(
  channel: SectionId,
  points: readonly Reported[],
  settings: Settings,
): HubItem[] {
  const rows: HubItem[] = sectionRows(channel, points, settings);
  if (channel === "system") return [...SYSTEM_PANES, XNE_SETTINGS_PANE, ...rows];
  if (channel === "apps")
    return [...rows.slice(0, 1), profilePane(settings, points), ...rows.slice(1)];
  return rows;
}

/** A non-empty channel's items with its "All" pane at the end. */
export function withAllPane(channel: SectionId, items: readonly HubItem[]): HubItem[] {
  if (items.length === 0) return [];
  return [
    ...items,
    { id: `all:${channel}`, title: `All ${labelOf(channel)}`, icon: allIcon, all: true },
  ];
}

/** The row the hub shows for a channel. An empty channel shows one
 * placeholder pane, and nothing else: there is no "All" of nothing. */
export function hubRow(
  channel: SectionId,
  points: readonly Reported[],
  settings: Settings,
): HubItem[] {
  const items = channelItems(channel, points, settings);
  if (items.length === 0) return [emptyPane(channel)];
  return withAllPane(channel, items);
}

/** The items an "All" page lists: the row without its "All" pane, its
 * placeholder, its settings pane or the profile, so a channel page never lists
 * what cannot be launched. */
export function pageItems(row: readonly HubItem[]): HubItem[] {
  return row.filter(
    (item) =>
      !isAllPane(item) && !isEmptyPane(item) && !isSettingsPane(item) && !isProfilePane(item),
  );
}

const EMPTY_PAGE: ListPage = {
  kind: "list",
  id: "all",
  title: "",
  groups: [{ id: "all", title: "", items: [{ id: "none", label: "" }] }],
};

/** The page for a channel's items. A channel with none gets an inert placeholder. */
export function channelPage(channel: SectionId, items: readonly HubItem[]): ListPage {
  const [first, ...rest] = items;
  if (first === undefined) return EMPTY_PAGE;
  const label = labelOf(channel);
  return {
    kind: "list",
    id: `all:${channel}`,
    title: `All ${label}`,
    groups: [
      {
        id: channel,
        title: label,
        items: [first, ...rest].map((item) => ({ id: item.id, label: item.title })),
      },
    ],
  };
}

/** Where a pane's launch goes: its own target, or the launch point itself. */
export function launchTarget(item: HubItem): LaunchTarget {
  return item.launch ?? { id: item.id, params: {} };
}
