import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { LunaCallError, callLuna } from "../luna";
import { isInputAppId } from "../preview/inputs";
import { loadStills } from "../preview/stills";
import { usePreviewStore } from "../preview/store";
import type { LaunchPoint, ListAppsResult, ListLaunchPointsResult } from "../types";

const LIST_LAUNCH_POINTS = "luna://com.webos.applicationManager/listLaunchPoints";
const LIST_APPS = "luna://com.webos.applicationManager/listApps";
const LAUNCH = "luna://com.webos.applicationManager/launch";
const GET_APP_INFO = "luna://com.webos.applicationManager/getAppInfo";

/** The sources this TV does not list as launch points. */
const INPUT_IDS: readonly { id: string; title: string }[] = [
  { id: "com.webos.app.livetv", title: "Live TV" },
  { id: "com.webos.app.hdmi1", title: "HDMI 1" },
  { id: "com.webos.app.hdmi2", title: "HDMI 2" },
  { id: "com.webos.app.hdmi3", title: "HDMI 3" },
  { id: "com.webos.app.hdmi4", title: "HDMI 4" },
];

/** `icon` from `getAppInfo` is a bare filename, so it only means something
 *  beside the folder it lives in. */
function iconPathFor(info: Record<string, unknown>): string | undefined {
  if (typeof info.icon !== "string" || info.icon === "") return undefined;
  if (info.icon.startsWith("/")) return info.icon;
  if (typeof info.folderPath === "string" && info.folderPath !== "") {
    return `${info.folderPath.replace(/\/$/, "")}/${info.icon}`;
  }
  return undefined;
}

export type LoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * `listLaunchPoints` is a private ACL on this TV, so an ungranted app is
 * denied rather than broken. Say which one it is, and how it gets fixed,
 * instead of showing a bare error code (PLAN §2, §5).
 */
function describe(cause: unknown): string {
  if (cause instanceof LunaCallError) {
    if (/permission|notallowed|denied|access/i.test(cause.code)) {
      return `${cause.code} — this app has no ACL grant yet. Run \`homectl grant\` over Homebrew Channel /exec, then relaunch.`;
    }
    return cause.message;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Fill in icons from `listApps`, which has them when `listLaunchPoints` does not.
 *
 * Only missing fields are taken, so the launch point stays the source of truth
 * for what is shown and in what order.
 *
 * Property-by-property rather than spread-and-override because
 * `exactOptionalPropertyTypes` forbids writing an explicit `undefined`.
 */
function enrichWithIcons(points: LaunchPoint[], apps: LaunchPoint[]): LaunchPoint[] {
  if (apps.length === 0) return points;
  const byId = new Map(apps.map((app) => [app.id, app]));

  return points.map((point) => {
    const app = byId.get(point.id);
    if (!app) return point;

    const merged: LaunchPoint = { ...point };
    if (!merged.icon && app.icon) merged.icon = app.icon;
    if (!merged.largeIcon && app.largeIcon) merged.largeIcon = app.largeIcon;
    if (!merged.iconColor && app.iconColor) merged.iconColor = app.iconColor;
    if (!merged.folderPath && app.folderPath) merged.folderPath = app.folderPath;
    return merged;
  });
}

export const useAppsStore = defineStore("apps", () => {
  const launchPoints = ref<LaunchPoint[]>([]);
  const status = ref<LoadStatus>("idle");
  const error = ref<string | null>(null);

  const visibleLaunchPoints = computed(() =>
    launchPoints.value.filter((point) => point.visible !== false),
  );

  /** Icon data is a nicety: never let it fail the load. */
  async function loadIcons(): Promise<LaunchPoint[]> {
    try {
      const result = await callLuna<ListAppsResult>(LIST_APPS, {});
      return result.apps ?? [];
    } catch {
      return [];
    }
  }

  /**
   * The tuner and the HDMI inputs are apps here, but `listLaunchPoints` reports
   * none of them, so ask for each by id and keep the ones the TV answers for.
   * A refusal is not a failure: the blade shows whatever exists.
   */
  async function loadInputs(points: readonly LaunchPoint[]): Promise<LaunchPoint[]> {
    const known = new Set(points.map((point) => point.id));
    const wanted = INPUT_IDS.filter((input) => !known.has(input.id));

    const found = await Promise.all(
      wanted.map(async (input): Promise<LaunchPoint | null> => {
        try {
          const payload = await callLuna<Record<string, unknown>>(GET_APP_INFO, { id: input.id });
          const info =
            typeof payload.appInfo === "object" && payload.appInfo !== null
              ? (payload.appInfo as Record<string, unknown>)
              : payload;
          const matches = payload.appId === input.id || info.title !== undefined;
          if (!matches) return null;

          const title =
            typeof info.title === "string" && info.title !== "" ? info.title : input.title;
          const icon = iconPathFor(info);
          return { id: input.id, title, visible: true, ...(icon ? { icon } : {}) };
        } catch {
          return null;
        }
      }),
    );

    return found.filter((point): point is LaunchPoint => point !== null);
  }

  async function load(): Promise<void> {
    status.value = "loading";
    error.value = null;
    // The boot path this app has. The still registry is read here so a row can
    // draw a photograph taken on a previous run rather than only one taken since
    // the page loaded.
    loadStills();
    try {
      const result = await callLuna<ListLaunchPointsResult>(LIST_LAUNCH_POINTS, {});
      // Deliberately *not* sorted: the device already returns them in the order
      // the stock home shows, which is the order the QML home inherited, and
      // custom ordering is the user's `appOrder` (PLAN §9 M4).
      const points = [...(result.launchPoints ?? [])];
      // Both in flight together: the grid is usable before the icons land, and
      // on the TV the icon paths are the difference between tiles and initials.
      const [apps, inputs] = await Promise.all([loadIcons(), loadInputs(points)]);
      launchPoints.value = enrichWithIcons([...points, ...inputs], apps);
      status.value = "ready";
    } catch (cause) {
      error.value = describe(cause);
      status.value = "error";
    }
  }

  async function launch(id: string): Promise<void> {
    error.value = null;
    try {
      await callLuna(LAUNCH, { id, params: {} });
    } catch (cause) {
      error.value = describe(cause);
      return;
    }
    // An input is up for exactly as long as the launcher is not, and a
    // backgrounded page cannot run a timer, so the settle has to start here,
    // off the back of this reply. Not awaited: the user pressed Enter and the
    // input is already on its way.
    if (isInputAppId(id)) {
      void usePreviewStore().capture(id);
    }
  }

  return { launchPoints, visibleLaunchPoints, status, error, load, launch };
});
