import { describe, expect, it } from "vitest";

import {
  channelItems,
  channelPage,
  hubRow,
  isAllPane,
  isEmptyPane,
  isHideable,
  isSettingsPane,
  launchTarget,
  pageItems,
  SYSTEM_PANES,
  withAllPane,
} from "./hubRows";
import { SETTINGS_DEFAULTS } from "./settings";

const POINTS = [
  { id: "youtube.leanback.v4", title: "YouTube" },
  { id: "com.webos.app.discovery", title: "Apps", systemApp: true },
];

describe("hubRow", () => {
  it("ends a non-empty channel with its All pane", () => {
    const row = hubRow("apps", POINTS, SETTINGS_DEFAULTS);
    expect(row.length).toBeGreaterThan(1);
    const last = row[row.length - 1];
    expect(isAllPane(last)).toBe(true);
    expect(last?.title).toBe("All Apps");
    expect(row.filter(isAllPane)).toHaveLength(1);
  });

  it("leaves an empty channel with one placeholder pane and no All pane", () => {
    const row = hubRow("games", [], SETTINGS_DEFAULTS);
    expect(row).toHaveLength(1);
    expect(isEmptyPane(row[0])).toBe(true);
    expect(isAllPane(row[0])).toBe(false);
    expect(row[0]?.id).toBe("empty:games");
    expect(row[0]?.title).toBe("No games installed");
    expect(withAllPane("games", [])).toEqual([]);
  });

  it("keeps a placeholder out of page items and off any launch target", () => {
    const row = hubRow("games", [], SETTINGS_DEFAULTS);
    expect(pageItems(row)).toEqual([]);
    expect(launchTarget(row[0]!)).toEqual({ id: "empty:games", params: {} });
  });

  it("lets X hide a real item, and nothing synthetic", () => {
    const row = hubRow("apps", POINTS, SETTINGS_DEFAULTS);
    expect(isHideable(row[0])).toBe(true);
    expect(isHideable(row[row.length - 1])).toBe(false);
    expect(isHideable(hubRow("games", [], SETTINGS_DEFAULTS)[0])).toBe(false);
    expect(isHideable(SYSTEM_PANES[0])).toBe(false);
    expect(isHideable(null)).toBe(false);
    expect(isHideable(undefined)).toBe(false);
  });

  it("puts the settings panes on System, ahead of system apps", () => {
    const items = channelItems("system", POINTS, SETTINGS_DEFAULTS);
    expect(items.slice(0, SYSTEM_PANES.length)).toEqual(SYSTEM_PANES);
    expect(channelItems("apps", POINTS, SETTINGS_DEFAULTS)).not.toContain(SYSTEM_PANES[0]);
  });

  it("seats the dashboard's own settings beside the TV's, opened and never launched", () => {
    const items = channelItems("system", POINTS, SETTINGS_DEFAULTS);
    const pane = items[SYSTEM_PANES.length];
    expect(pane?.id).toBe("xne:settings");
    expect(isSettingsPane(pane)).toBe(true);
    expect(isHideable(pane)).toBe(false);
    expect(pageItems(items)).not.toContain(pane);
  });

  it("gives every synthetic pane a unique id, an icon and a target", () => {
    const ids = new Set(SYSTEM_PANES.map((pane) => pane.id));
    expect(ids.size).toBe(SYSTEM_PANES.length);
    for (const pane of SYSTEM_PANES) {
      expect(pane.icon).toBeTruthy();
      expect(pane.launch?.id).toBeTruthy();
    }
    const network = SYSTEM_PANES.find((pane) => pane.id === "system:network");
    expect(network?.launch?.id).toBe("com.webos.app.firstuse-overlay");
  });
});

describe("pages", () => {
  it("lists the row without its All pane or its settings pane", () => {
    const row = hubRow("system", POINTS, SETTINGS_DEFAULTS);
    const items = pageItems(row);
    expect(items).toHaveLength(row.length - 2);
    expect(items.some((item) => isAllPane(item) || isSettingsPane(item))).toBe(false);
    const page = channelPage("system", items);
    expect(page.title).toBe("All System");
    expect(page.groups[0].items.map((item) => item.id)).toEqual(items.map((item) => item.id));
  });

  it("launches a pane's own target, or the launch point", () => {
    expect(launchTarget(SYSTEM_PANES[0]!)).toEqual({
      id: "com.palm.app.settings",
      params: { target: "picture" },
    });
    expect(launchTarget({ id: "x", title: "X" })).toEqual({ id: "x", params: {} });
  });
});
