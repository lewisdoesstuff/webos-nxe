import allIcon from "./assets/system/all.svg?inline";
import settingsIcon from "./assets/system/settings.png?inline";
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
  /** Art drawn straight on the card, without the glossy tile. */
  readonly bare?: true;
  /** A second line under the name, such as free space. */
  readonly detail?: string;
  /** The profile pane: the gamercard, with the avatar standing beside it. */
  readonly profile?: true;
  /** The profile's gamerscore. */
  readonly score?: number;
  /** The profile's recent apps, newest first. */
  readonly recent?: readonly LaunchPoint[];
}

/** System settings, first on System. It opens a page rather than launching anything. */
export const XNE_SETTINGS_PANE: HubItem = {
  id: "xne:settings",
  title: "System Settings",
  icon: settingsIcon,
  bare: true,
  settings: true,
};

/**
 * The profile, first on Home, as it was second on My Xbox
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

/** Whether a pane can be picked up and moved: a real item, or the profile. */
export function isMovable(item: HubItem | null | undefined): item is HubItem {
  return isHideable(item) || isProfilePane(item);
}

/** The ids of the movable items in a row, in the order the store keeps them. */
export function movableIds(row: readonly HubItem[]): string[] {
  return row.filter(isMovable).map((item) => item.id);
}

/**
 * One step of moving the item at `index` along its row: the new stored order
 * and the row index the item lands on. The synthetic panes stay where they
 * are and the real ones trade places among the slots, so the step is always
 * to the next real item. Null at either end of the real items, or for a pane
 * that cannot move.
 */
export function moveStep(
  row: readonly HubItem[],
  index: number,
  direction: -1 | 1,
): { readonly order: string[]; readonly index: number } | null {
  const item = row[index];
  if (!isMovable(item)) return null;
  const order = movableIds(row);
  const from = order.indexOf(item.id);
  const to = from + direction;
  const other = order[to];
  if (from === -1 || other === undefined) return null;
  order[to] = item.id;
  order[from] = other;
  return { order, index: row.findIndex((candidate) => candidate.id === other) };
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
  const title =
    channel === "home" ? "Nothing pinned to Home" : `No ${label.toLowerCase()} installed`;
  return { id: `empty:${channel}`, title, empty: true };
}

/**
 * Home's items: the pinned apps in pin order with the profile among them. The
 * profile sits second until it is moved, and once it is moved its place is kept
 * in the stored order like any pin's.
 */
function homeItems(rows: readonly HubItem[], profile: HubItem, settings: Settings): HubItem[] {
  const byId = new Map<string, HubItem>(rows.map((item) => [item.id, item]));
  byId.set(profile.id, profile);
  const order = [...new Set(settings.homeApps)].filter((id) => byId.has(id));
  if (!order.includes(profile.id)) order.splice(Math.min(1, order.length), 0, profile.id);
  return order.map((id) => byId.get(id) as HubItem);
}

/** A row with one pane's second line set. A blank line, or no such pane, leaves the row as it is. */
export function withDetail(row: readonly HubItem[], id: string, detail: string): HubItem[] {
  if (detail === "") return [...row];
  return row.map((item) => (item.id === id ? { ...item, detail } : item));
}

/** The channel's items, without the "All" pane. Empty when there are none. */
export function channelItems(
  channel: SectionId,
  points: readonly Reported[],
  settings: Settings,
): HubItem[] {
  const rows: HubItem[] = sectionRows(channel, points, settings);
  if (channel === "system") return [XNE_SETTINGS_PANE, ...rows];
  if (channel === "home") return homeItems(rows, profilePane(settings, points), settings);
  return rows;
}

/** A non-empty channel's items with its "All" pane at the end. Home is the pins themselves, so it has none. */
export function withAllPane(channel: SectionId, items: readonly HubItem[]): HubItem[] {
  if (items.length === 0) return [];
  if (channel === "home") return [...items];
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
