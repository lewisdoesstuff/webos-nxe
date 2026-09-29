import { describe, expect, it } from "vitest";

import {
  applyOrder,
  sectionForApp,
  changeCount,
  changedKeys,
  mergeSettings,
  SETTINGS_DEFAULTS,
} from "./settings";

describe("mergeSettings", () => {
  it("falls back to the defaults for anything unparseable", () => {
    for (const stored of [undefined, null, 42, "nope", []]) {
      const { settings, migrated } = mergeSettings(stored);
      expect(settings).toEqual(SETTINGS_DEFAULTS);
      expect(migrated).toBe(true);
    }
  });

  it("keeps the values the user set", () => {
    const { settings } = mergeSettings({
      defaultsRev: SETTINGS_DEFAULTS.defaultsRev,
      gamertag: "Matty",
      hintBar: false,
      appSection: { netflix: "games" },
    });

    expect(settings.gamertag).toBe("Matty");
    expect(settings.hintBar).toBe(false);
    expect(settings.appSection).toEqual({ netflix: "games" });
  });

  it("refuses values of the wrong type", () => {
    const { settings } = mergeSettings({
      gamertag: 7,
      hintBar: "yes",
      appSection: { netflix: 3 },
    });

    expect(settings.gamertag).toBe(SETTINGS_DEFAULTS.gamertag);
    expect(settings.hintBar).toBe(SETTINGS_DEFAULTS.hintBar);
    expect(settings.appOrder).toEqual([]);
    expect(settings.appSection).toEqual({});
  });

  it("turns input previews on by default and honours them off", () => {
    expect(SETTINGS_DEFAULTS.previews).toBe(true);
    expect(mergeSettings({}).settings.previews).toBe(true);
    expect(mergeSettings({ previews: false }).settings.previews).toBe(false);
    expect(mergeSettings({ previews: "no" }).settings.previews).toBe(true);
  });

  it("remembers the last channel, defaulting to Apps", () => {
    expect(SETTINGS_DEFAULTS.lastChannel).toBe("apps");
    expect(mergeSettings({}).settings.lastChannel).toBe("apps");
    expect(mergeSettings({ lastChannel: "games" }).settings.lastChannel).toBe("games");
    expect(mergeSettings({ lastChannel: 3 }).settings.lastChannel).toBe("apps");
  });

  it("reports an older document as needing migration", () => {
    expect(mergeSettings({}).migrated).toBe(true);
    expect(mergeSettings({ defaultsRev: 0 }).migrated).toBe(true);
    expect(mergeSettings({ defaultsRev: SETTINGS_DEFAULTS.defaultsRev }).migrated).toBe(false);
  });

  it("drops stored keys the app does not know", () => {
    const { settings } = mergeSettings({ surprise: true });
    expect("surprise" in settings).toBe(false);
  });
});

describe("applyOrder", () => {
  it("returns a copy when there is no stored order", () => {
    const ids = ["a", "b"];
    const ordered = applyOrder(ids, []);
    expect(ordered).toEqual(["a", "b"]);
    expect(ordered).not.toBe(ids);
  });

  it("puts the named entries first, in their order", () => {
    expect(applyOrder(["a", "b", "c", "d"], ["c", "a"])).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores entries for things that no longer exist", () => {
    expect(applyOrder(["a", "b"], ["zz", "b", "a"])).toEqual(["b", "a"]);
  });

  it("keeps relative order for anything unlisted", () => {
    expect(applyOrder(["a", "b", "c"], ["c"])).toEqual(["c", "a", "b"]);
  });
});

describe("sectionForApp", () => {
  it("prefers the user's blade", () => {
    expect(sectionForApp("netflix", { netflix: "games" }, "media")).toBe("games");
  });

  it("falls back to the default blade", () => {
    expect(sectionForApp("netflix", {}, "media")).toBe("media");
  });
});

describe("changedKeys", () => {
  it("finds nothing in a document that was never written", () => {
    expect(changedKeys(SETTINGS_DEFAULTS)).toEqual([]);
    expect(changeCount(SETTINGS_DEFAULTS)).toBe(0);
  });

  it("finds a value the user has moved off the default", () => {
    expect(changedKeys({ ...SETTINGS_DEFAULTS, navSound: false })).toEqual(["navSound"]);
    expect(changedKeys({ ...SETTINGS_DEFAULTS, musicVolume: 0.5 })).toEqual([]);
    expect(changedKeys({ ...SETTINGS_DEFAULTS, screensaverDim: 0 })).toEqual(["screensaverDim"]);
  });

  it("counts an entry in any of the lists and maps as a change", () => {
    expect(changedKeys({ ...SETTINGS_DEFAULTS, appOrder: ["netflix"] })).toEqual(["appOrder"]);
    expect(changedKeys({ ...SETTINGS_DEFAULTS, appSection: { netflix: "games" } })).toEqual([
      "appSection",
    ]);
    expect(changedKeys({ ...SETTINGS_DEFAULTS, hiddenApps: ["netflix"] })).toEqual(["hiddenApps"]);
  });

  it("counts an emptied list as a change, which a reset cannot tell apart", () => {
    const emptied = mergeSettings({ appOrder: ["netflix"] }).settings;
    expect(changeCount(emptied)).toBe(1);
    expect(changedKeys({ ...SETTINGS_DEFAULTS, gamertag: "" })).toEqual(["gamertag"]);
  });
});
