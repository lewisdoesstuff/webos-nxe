import { describe, expect, it } from "vitest";

import {
  channelItems,
  channelPage,
  hubRow,
  isAllPane,
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

  it("leaves an empty channel empty", () => {
    expect(hubRow("games", [], SETTINGS_DEFAULTS)).toEqual([]);
    expect(withAllPane("games", [])).toEqual([]);
  });

  it("puts the settings panes on System, ahead of system apps", () => {
    const items = channelItems("system", POINTS, SETTINGS_DEFAULTS);
    expect(items.slice(0, SYSTEM_PANES.length)).toEqual(SYSTEM_PANES);
    expect(channelItems("apps", POINTS, SETTINGS_DEFAULTS)).not.toContain(SYSTEM_PANES[0]);
  });

  it("gives every synthetic pane a unique id, an icon and a target", () => {
    const ids = new Set(SYSTEM_PANES.map((pane) => pane.id));
    expect(ids.size).toBe(SYSTEM_PANES.length);
    for (const pane of SYSTEM_PANES) {
      expect(pane.icon).toBeTruthy();
      expect(pane.launch?.id).toBe("com.palm.app.settings");
    }
  });
});

describe("pages", () => {
  it("lists the row without its All pane", () => {
    const row = hubRow("system", POINTS, SETTINGS_DEFAULTS);
    const items = pageItems(row);
    expect(items).toHaveLength(row.length - 1);
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
