import { describe, expect, it } from "vitest";

import {
  XNE_SETTINGS_PANE,
  channelItems,
  channelPage,
  hubRow,
  isAllPane,
  isEmptyPane,
  isHideable,
  isMovable,
  isProfilePane,
  isSettingsPane,
  launchTarget,
  moveStep,
  pageItems,
  PROFILE_RECENT,
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
    expect(isHideable(XNE_SETTINGS_PANE)).toBe(false);
    expect(isHideable(null)).toBe(false);
    expect(isHideable(undefined)).toBe(false);
  });

  it("seats the profile second on Home, launching nothing and never leaving", () => {
    const items = channelItems("home", POINTS, {
      ...SETTINGS_DEFAULTS,
      gamertag: "Matty",
      homeApps: ["youtube.leanback.v4"],
    });
    const pane = items[1];
    expect(pane).toMatchObject({
      id: "xne:profile",
      title: "Matty",
      profile: true,
      score: 0,
      recent: [],
    });
    expect(isProfilePane(pane)).toBe(true);
    expect(isHideable(pane)).toBe(false);
    expect(isMovable(pane)).toBe(true);
    expect(pageItems(items)).not.toContain(pane);
    expect(channelItems("home", POINTS, { ...SETTINGS_DEFAULTS, gamertag: "" })[0]?.title).toBe(
      "Player1",
    );
  });

  it("lists the profile's recent apps, newest first, as many as fit", () => {
    const points = Array.from({ length: 7 }, (_, n) => ({ id: `app.${n}`, title: `App ${n}` }));
    const settings = { ...SETTINGS_DEFAULTS, recentApps: ["app.6", "gone", "app.2", "app.0"] };
    const row = channelItems("home", points, settings);
    const recent = row.find(isProfilePane)?.recent ?? [];
    expect(recent.map((point) => point.id)).toEqual(["app.6", "app.2", "app.0"]);
    const all = { ...SETTINGS_DEFAULTS, recentApps: points.map((point) => point.id) };
    expect(channelItems("home", points, all).find(isProfilePane)?.recent).toHaveLength(
      PROFILE_RECENT,
    );
  });

  it("seats System Settings first on System, opened and never launched", () => {
    const items = channelItems("system", POINTS, SETTINGS_DEFAULTS);
    const pane = items[0];
    expect(pane?.id).toBe("xne:settings");
    expect(isSettingsPane(pane)).toBe(true);
    expect(isHideable(pane)).toBe(false);
    expect(items.some(isProfilePane)).toBe(false);
    expect(pageItems(items)).not.toContain(pane);
    expect(channelItems("apps", POINTS, SETTINGS_DEFAULTS)).not.toContain(pane);
  });
});

describe("pages", () => {
  it("lists the row without its All pane or its settings pane", () => {
    const points = [
      ...POINTS,
      { id: "com.webos.app.inputcommon", title: "Inputs", systemApp: true },
    ];
    const row = hubRow("system", points, SETTINGS_DEFAULTS);
    const items = pageItems(row);
    expect(items).toHaveLength(row.length - 2);
    expect(
      items.some((item) => isAllPane(item) || isSettingsPane(item) || isProfilePane(item)),
    ).toBe(false);
    const home = hubRow("home", POINTS, SETTINGS_DEFAULTS);
    expect(pageItems(home)).toHaveLength(home.length - 2);
    expect(pageItems(home).some(isProfilePane)).toBe(false);
    const page = channelPage("system", items);
    expect(page.title).toBe("All System");
    expect(page.groups[0].items.map((item) => item.id)).toEqual(items.map((item) => item.id));
  });

  it("launches a pane's own target, or the launch point", () => {
    expect(launchTarget({ id: "x", title: "X", launch: { id: "y", params: { a: 1 } } })).toEqual({
      id: "y",
      params: { a: 1 },
    });
    expect(launchTarget({ id: "x", title: "X" })).toEqual({ id: "x", params: {} });
  });
});

describe("moveStep", () => {
  const ROW = hubRow(
    "home",
    [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ],
    { ...SETTINGS_DEFAULTS, homeApps: ["a", "b", "c"] },
  );

  it("trades places with the next real item and steps over the profile pane", () => {
    expect(ROW.map((item) => item.id)).toEqual(["a", "xne:profile", "b", "c", "all:home"]);
    expect(moveStep(ROW, 0, 1)).toEqual({ order: ["xne:profile", "a", "b", "c"], index: 1 });
    expect(moveStep(ROW, 1, 1)).toEqual({ order: ["a", "b", "xne:profile", "c"], index: 2 });
    expect(moveStep(ROW, 3, -1)).toEqual({ order: ["a", "xne:profile", "c", "b"], index: 2 });
  });

  it("stops at the ends and refuses panes that cannot move", () => {
    expect(moveStep(ROW, 0, -1)).toBeNull();
    expect(moveStep(ROW, 3, 1)).toBeNull();
    expect(moveStep(ROW, 4, -1)).toBeNull();
  });
});

describe("the Home channel", () => {
  const POINTS_HOME = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "com.webos.app.discovery", title: "Apps", systemApp: true },
  ];

  it("holds only the profile until something is pinned", () => {
    const row = hubRow("home", POINTS_HOME, SETTINGS_DEFAULTS);
    expect(row.map((item) => item.id)).toEqual(["xne:profile", "all:home"]);
    const one = hubRow("home", POINTS_HOME, { ...SETTINGS_DEFAULTS, homeApps: ["a", "b"] });
    expect(one.map((item) => item.id)).toEqual(["a", "xne:profile", "b", "all:home"]);
  });

  it("lists the pinned apps in pin order, and drops any the device no longer has", () => {
    const settings = { ...SETTINGS_DEFAULTS, homeApps: ["b", "gone", "a", "b"] };
    const row = hubRow("home", POINTS_HOME, settings);
    expect(row.map((item) => item.id)).toEqual(["b", "xne:profile", "a", "all:home"]);
    expect(isHideable(row[0])).toBe(true);
    expect(moveStep(row, 2, -1)).toEqual({ order: ["b", "a", "xne:profile"], index: 1 });
  });

  it("is never where an app is classified or sent by an override", () => {
    const settings = { ...SETTINGS_DEFAULTS, appSection: { a: "home" } };
    expect(hubRow("home", POINTS_HOME, settings)).toHaveLength(2);
    expect(hubRow("apps", POINTS_HOME, settings).some((item) => item.id === "a")).toBe(true);
  });
});
