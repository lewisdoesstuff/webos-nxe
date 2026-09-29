import allIcon from "./assets/system/all.svg?inline";
import generalIcon from "./assets/system/general.svg?inline";
import networkIcon from "./assets/system/network.svg?inline";
import pictureIcon from "./assets/system/picture.svg?inline";
import settingsIcon from "./assets/system/settings.svg?inline";
import soundIcon from "./assets/system/sound.svg?inline";
import type { ListPage } from "./pages";
import { type Reported, type SectionId, SECTIONS, sectionRows } from "./sections";
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
 */
export interface HubItem extends LaunchPoint {
  readonly launch?: LaunchTarget;
  readonly all?: true;
}

const SETTINGS_APP = "com.palm.app.settings";

/**
 * The TV's own settings pages. The app id is VERIFIED (LG-XMB lists it as its
 * TV Settings entry); the `target` param names are UNVERIFIED and are the first
 * thing to check on the TV.
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
    launch: { id: SETTINGS_APP, params: { target: "network" } },
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

export function isAllPane(item: HubItem | null | undefined): boolean {
  return item?.all === true;
}

function labelOf(channel: SectionId): string {
  return SECTIONS.find((section) => section.id === channel)?.label ?? channel;
}

/** The channel's items, without the "All" pane. Empty when there are none. */
export function channelItems(
  channel: SectionId,
  points: readonly Reported[],
  settings: Settings,
): HubItem[] {
  const rows: HubItem[] = sectionRows(channel, points, settings);
  return channel === "system" ? [...SYSTEM_PANES, ...rows] : rows;
}

/** A non-empty channel's items with its "All" pane at the end. */
export function withAllPane(channel: SectionId, items: readonly HubItem[]): HubItem[] {
  if (items.length === 0) return [];
  return [
    ...items,
    { id: `all:${channel}`, title: `All ${labelOf(channel)}`, icon: allIcon, all: true },
  ];
}

/** The row the hub shows for a channel. */
export function hubRow(
  channel: SectionId,
  points: readonly Reported[],
  settings: Settings,
): HubItem[] {
  return withAllPane(channel, channelItems(channel, points, settings));
}

/** The items an "All" page lists: the row without its "All" pane. */
export function pageItems(row: readonly HubItem[]): HubItem[] {
  return row.filter((item) => !isAllPane(item));
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
