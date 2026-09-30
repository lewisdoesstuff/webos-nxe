import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS } from "../settings";
import { useSettingsStore } from "./settings";

/** What a settings-screen change does to the stored document. */
const APPLIED: Parameters<ReturnType<typeof useSettingsStore>["applyChange"]>[0][] = [
  { kind: "flag", key: "navSound", value: true },
  { kind: "level", key: "musicVolume", value: 0.25 },
  { kind: "choice", key: "background", value: "solid" },
  { kind: "choice", key: "gamertag", value: "" },
  { kind: "sort", section: "media", mode: "name-asc" },
  { kind: "app-section", appId: "netflix", section: "games" },
  { kind: "app-hidden", appId: "netflix", hidden: true },
  { kind: "app-order", order: ["b", "a"] },
  { kind: "app-order", order: ["a", "b", "c"] },
  { kind: "hidden-clear" },
];

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
});

function appliedStore() {
  const store = useSettingsStore();
  for (const change of APPLIED) store.applyChange(change);
  return store;
}

describe("settings store", () => {
  it("writes every key a settings-screen row can change", () => {
    const store = appliedStore();

    expect(store.settings.navSound).toBe(true);
    expect(store.settings.musicVolume).toBe(0.25);
    expect(store.settings.background).toBe("solid");
    expect(store.settings.gamertag).toBe("");
    expect(store.settings.sortModes).toEqual({ media: "name-asc" });
    expect(store.settings.appSection).toEqual({ netflix: "games" });
    expect(store.settings.hiddenApps).toEqual([]);
  });

  it("keeps one blade's sort out of another's", () => {
    const store = useSettingsStore();
    store.setSortMode("media", "recent");
    store.setSortMode("games", "name-desc");

    expect(store.settings.sortModes).toEqual({ media: "recent", games: "name-desc" });
  });

  it("writes a blade's whole order over what was stored for those apps", () => {
    const store = useSettingsStore();
    store.updateSetting("appOrder", ["z", "a", "b"]);

    store.setAppOrder(["b", "a"]);
    expect(store.settings.appOrder).toEqual(["z", "b", "a"]);

    store.setAppOrder(["a", "b", "c"]);
    expect(store.settings.appOrder).toEqual(["z", "a", "b", "c"]);
  });

  it("pins apps to Home in the order they were added, and reorders them", () => {
    const store = useSettingsStore();
    store.setAppHome("a", true);
    store.setAppHome("b", true);
    store.setAppHome("a", true);
    expect(store.settings.homeApps).toEqual(["b", "a"]);
    expect(store.isAppHome("a")).toBe(true);

    store.setHomeOrder(["a", "b"]);
    expect(store.settings.homeApps).toEqual(["a", "b"]);
    store.setAppHome("a", false);
    expect(store.settings.homeApps).toEqual(["b"]);
  });

  it("holds a draft order in memory until it is saved", () => {
    const store = useSettingsStore();
    store.setAppOrder(["b", "a"], false);
    expect(store.settings.appOrder).toEqual(["b", "a"]);
    const stored = () =>
      JSON.parse(window.localStorage.getItem("ooo.lew.nxe.settings") ?? "{}").appOrder;
    expect(stored()).toEqual([]);
    store.persist();
    expect(stored()).toEqual(["b", "a"]);
  });

  it("clears the hidden list in one go", () => {
    const store = useSettingsStore();
    store.setAppHidden("a", true);
    store.setAppHidden("b", true);
    store.clearHiddenApps();
    expect(store.settings.hiddenApps).toEqual([]);
  });

  it("records a launch once, most recent first", () => {
    const store = useSettingsStore();
    store.noteLaunch("a");
    store.noteLaunch("b");
    store.noteLaunch("a");

    expect(store.settings.recentApps).toEqual(["a", "b"]);
  });

  it("keeps the recently used list to a length worth storing", () => {
    const store = useSettingsStore();
    for (let index = 0; index < 40; index++) store.noteLaunch(`app-${index}`);
    expect(store.settings.recentApps).toHaveLength(32);
    expect(store.settings.recentApps[0]).toBe("app-39");
  });

  it("puts the blades, the apps and their order back on a layout reset", () => {
    const store = appliedStore();
    store.updateSetting("appOrder", ["b", "a"]);
    store.applyChange({ kind: "layout-reset" });

    expect(store.settings.appSection).toEqual({});
    expect(store.settings.appOrder).toEqual([]);
    expect(store.settings.hiddenApps).toEqual([]);
    expect(store.settings.sortModes).toEqual({});
    expect(store.settings.navSound).toBe(true);
    expect(store.settings.musicVolume).toBe(0.25);
  });

  it("survives a stored document it cannot read", () => {
    window.localStorage.setItem("ooo.lew.nxe.settings", "not json");
    setActivePinia(createPinia());
    expect(useSettingsStore().settings).toEqual(SETTINGS_DEFAULTS);
  });
});
