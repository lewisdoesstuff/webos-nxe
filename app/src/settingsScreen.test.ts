import { describe, expect, it } from "vitest";

import { ROOT_FOCUS, type ListPage, type PageFocus } from "./pages";
import { SETTINGS_DEFAULTS } from "./settings";
import {
  advanceLevel,
  GENERAL_DEFS,
  SETTINGS_CATEGORIES,
  settingsAction,
  settingsCategoryPage,
  settingsDetail,
  settingsPageFor,
  settingsRoot,
  settingsWindow,
  settingValue,
  SHOW_ALL_LABEL,
  type LevelDef,
  AVATAR_EDITOR_URL,
  BROWSER_APP,
  parseGamerscore,
  profilePage,
} from "./settingsScreen";

const APPS = [
  { id: "youtube.leanback.v4", title: "YouTube" },
  { id: "com.webos.app.discovery", title: "Apps" },
];

function focus(group: number, row: number): PageFocus {
  return { group, item: row };
}

function hidden(...ids: string[]) {
  return { ...SETTINGS_DEFAULTS, hiddenApps: ids };
}

describe("the settings root", () => {
  it("lists the categories", () => {
    const root = settingsRoot();
    expect(root.title).toBe("System Settings");
    expect(root.groups[0]?.items.map((item) => item.label)).toEqual(
      SETTINGS_CATEGORIES.map((category) => category.title),
    );
  });

  it("pushes the focused category", () => {
    const action = settingsAction(settingsRoot(), focus(0, 0), SETTINGS_DEFAULTS, APPS);
    expect(action?.kind).toBe("push");
    if (action?.kind !== "push") return;
    expect(action.page.id).toBe("settings:general");
  });

  it("pushes nothing for a category that is not there", () => {
    const root = settingsRoot();
    const broken: ListPage = {
      ...root,
      groups: [{ id: "settings", title: "Settings", items: [{ id: "nope", label: "Nope" }] }],
    };
    expect(settingsAction(broken, focus(0, 0), SETTINGS_DEFAULTS, APPS)).toBeNull();
  });

  it("describes the focused category", () => {
    const detail = settingsDetail(settingsRoot(), focus(0, 1), SETTINGS_DEFAULTS, APPS);
    expect(detail.values).toEqual([]);
    expect(detail.description).toBe(
      SETTINGS_CATEGORIES.find((category) => category.id === "hidden")?.description,
    );
  });
});

describe("the general page", () => {
  it("lists one row per live setting", () => {
    const page = settingsCategoryPage("general", SETTINGS_DEFAULTS, APPS);
    expect(page?.groups[0]?.items.map((item) => item.id)).toEqual([
      ...GENERAL_DEFS.map((def) => def.key),
      "theme",
    ]);
  });

  it("opens the installed themes from the Theme row", () => {
    const page = settingsCategoryPage("general", SETTINGS_DEFAULTS, APPS);
    if (page === null) throw new Error("no general page");
    const action = settingsAction(page, focus(0, GENERAL_DEFS.length), SETTINGS_DEFAULTS, APPS);
    expect(action?.kind).toBe("push");
    if (action?.kind !== "push") return;
    expect(action.page.groups[0]?.items[0]).toEqual({ id: "theme:default", label: "Default" });
    expect(settingsAction(action.page, focus(0, 0), SETTINGS_DEFAULTS, APPS)).toEqual({
      kind: "theme",
      id: "default",
    });
  });

  it("flips a flag on A", () => {
    const page = settingsCategoryPage("general", SETTINGS_DEFAULTS, APPS);
    if (page === null) throw new Error("no general page");
    const action = settingsAction(page, focus(0, 0), SETTINGS_DEFAULTS, APPS);
    expect(action).toEqual({
      kind: "change",
      change: { kind: "flag", key: "navSound", value: false },
    });
    const off = { ...SETTINGS_DEFAULTS, navSound: false };
    expect(settingsAction(page, focus(0, 0), off, APPS)).toEqual({
      kind: "change",
      change: { kind: "flag", key: "navSound", value: true },
    });
  });

  it("reads the row's value as On or Off", () => {
    const def = GENERAL_DEFS[0];
    if (def === undefined) throw new Error("no defs");
    expect(settingValue(def, SETTINGS_DEFAULTS)).toBe("On");
    expect(settingValue(def, { ...SETTINGS_DEFAULTS, navSound: false })).toBe("Off");
  });

  it("shows the value over the description", () => {
    const page = settingsCategoryPage("general", SETTINGS_DEFAULTS, APPS);
    if (page === null) throw new Error("no general page");
    const detail = settingsDetail(page, focus(0, 0), SETTINGS_DEFAULTS, APPS);
    expect(detail.values).toEqual(["On"]);
    expect(detail.description).toBe(GENERAL_DEFS[0]?.description);
  });

  it("answers nothing for an unknown category or row", () => {
    expect(settingsCategoryPage("nope", SETTINGS_DEFAULTS, APPS)).toBeNull();
    expect(settingsPageFor("nope", SETTINGS_DEFAULTS, APPS)).toBeNull();
    const page = settingsCategoryPage("general", SETTINGS_DEFAULTS, APPS);
    if (page === null) throw new Error("no general page");
    expect(settingsAction(page, focus(0, 99), SETTINGS_DEFAULTS, APPS)).toBeNull();
    expect(settingsDetail(page, focus(0, 99), SETTINGS_DEFAULTS, APPS)).toEqual({
      values: [],
      description: "",
    });
  });
});

describe("advancing a level", () => {
  const VOLUME: LevelDef = {
    kind: "level",
    key: "musicVolume",
    title: "Volume",
    description: "How loud.",
    options: [0, 0.25, 0.5, 0.75, 1],
    format: (value) => `${Math.round(value * 100)}%`,
  };

  it("steps to the next preset and wraps", () => {
    expect(advanceLevel(VOLUME, 0.5)).toBe(0.75);
    expect(advanceLevel(VOLUME, 1)).toBe(0);
  });

  it("steps up from between presets, so A always visibly does something", () => {
    expect(advanceLevel(VOLUME, 0.6)).toBe(0.75);
  });

  it("formats the stored value, not the nearest preset", () => {
    expect(settingValue(VOLUME, { ...SETTINGS_DEFAULTS, musicVolume: 0.6 })).toBe("60%");
  });
});

describe("the hidden apps page", () => {
  it("lists every hidden app over its title, then Show All", () => {
    const page = settingsCategoryPage("hidden", hidden("youtube.leanback.v4", "gone"), APPS);
    expect(page?.groups[0]?.items).toEqual([
      { id: "hidden:youtube.leanback.v4", label: "YouTube" },
      { id: "hidden:gone", label: "gone" },
      { id: "show-all", label: SHOW_ALL_LABEL },
    ]);
  });

  it("brings one app back on A", () => {
    const page = settingsCategoryPage("hidden", hidden("youtube.leanback.v4"), APPS);
    if (page === null) throw new Error("no hidden page");
    expect(settingsAction(page, focus(0, 0), hidden("youtube.leanback.v4"), APPS)).toEqual({
      kind: "change",
      change: { kind: "app-hidden", appId: "youtube.leanback.v4", hidden: false },
    });
  });

  it("empties the whole list on Show All", () => {
    const page = settingsCategoryPage("hidden", hidden("youtube.leanback.v4"), APPS);
    if (page === null) throw new Error("no hidden page");
    expect(settingsAction(page, focus(0, 1), hidden("youtube.leanback.v4"), APPS)).toEqual({
      kind: "change",
      change: { kind: "hidden-clear" },
    });
  });

  it("describes the focused row", () => {
    const page = settingsCategoryPage("hidden", hidden("youtube.leanback.v4"), APPS);
    if (page === null) throw new Error("no hidden page");
    expect(settingsDetail(page, focus(0, 0), hidden("youtube.leanback.v4"), APPS).description).toBe(
      "Put YouTube back on its channel.",
    );
    expect(settingsDetail(page, focus(0, 1), hidden("youtube.leanback.v4"), APPS).description).toBe(
      "Put every hidden app back on its channel.",
    );
  });

  it("stays silent past the end of the list", () => {
    const page = settingsCategoryPage("hidden", hidden(), APPS);
    if (page === null) throw new Error("no hidden page");
    expect(settingsAction(page, focus(0, 5), hidden(), APPS)).toBeNull();
  });
});

describe("rebuilding pages", () => {
  it("resolves every page by its id", () => {
    expect(settingsPageFor("settings", SETTINGS_DEFAULTS, APPS)?.id).toBe("settings");
    expect(settingsPageFor("settings:general", SETTINGS_DEFAULTS, APPS)?.id).toBe(
      "settings:general",
    );
    expect(settingsPageFor("settings:hidden", SETTINGS_DEFAULTS, APPS)?.id).toBe("settings:hidden");
  });

  it("opens a page with the focus at the first row", () => {
    expect(ROOT_FOCUS).toEqual({ group: 0, item: 0 });
  });
});

describe("the list window", () => {
  it("stays at the top until the focus leaves it", () => {
    expect(settingsWindow(25, 0)).toBe(0);
    expect(settingsWindow(25, 9)).toBe(0);
    expect(settingsWindow(25, 10)).toBe(1);
  });

  it("never runs past the last row", () => {
    expect(settingsWindow(25, 24)).toBe(15);
    expect(settingsWindow(3, 2)).toBe(0);
  });
});

describe("hidden app rows", () => {
  it("carry the app's art when it has some", () => {
    const apps = [{ id: "a", title: "A", icon: "/media/a.png" }, ...APPS];
    const page = settingsCategoryPage("hidden", hidden("a", "youtube.leanback.v4"), apps);
    const items = page?.groups[0].items ?? [];
    expect(items[0]?.icon).toBe("hack/media/a.png");
    expect(items[1]?.icon).toBeUndefined();
  });

  it("says nothing is hidden on the Show All row of an empty list", () => {
    const page = settingsCategoryPage("hidden", SETTINGS_DEFAULTS, APPS);
    if (!page) throw new Error("no page");
    const detail = settingsDetail(page, focus(0, 0), SETTINGS_DEFAULTS, APPS);
    expect(detail.description).toMatch(/No apps are hidden/);
  });
});

describe("profile menu", () => {
  const page = profilePage();

  it("offers the gamertag and the avatar", () => {
    expect(page.groups[0].items.map((item) => item.label)).toEqual([
      "Gamertag",
      "Gamerscore",
      "Customize Avatar",
      "Run Setup",
    ]);
    expect(settingsPageFor("profile", SETTINGS_DEFAULTS, [])).toEqual(page);
  });

  it("edits the gamertag, showing the current one", () => {
    const settings = { ...SETTINGS_DEFAULTS, gamertag: "Matty" };
    expect(settingsAction(page, focus(0, 0), settings, [])).toEqual({
      kind: "edit",
      key: "gamertag",
    });
    expect(settingsDetail(page, focus(0, 0), settings, []).values).toEqual(["Matty"]);
  });

  it("edits the gamerscore, showing it grouped", () => {
    const settings = { ...SETTINGS_DEFAULTS, gamerscore: 12345 };
    expect(settingsAction(page, focus(0, 1), settings, [])).toEqual({
      kind: "edit",
      key: "gamerscore",
    });
    expect(settingsDetail(page, focus(0, 1), settings, []).values).toEqual(["12,345"]);
  });

  it("reads a typed gamerscore, or refuses it", () => {
    expect(parseGamerscore("12345")).toBe(12345);
    expect(parseGamerscore(" 12,345 ")).toBe(12345);
    expect(parseGamerscore("0")).toBe(0);
    expect(parseGamerscore("")).toBeNull();
    expect(parseGamerscore("-5")).toBeNull();
    expect(parseGamerscore("12a")).toBeNull();
    expect(parseGamerscore("99999999")).toBeNull();
  });

  it("opens 360sona in the TV's browser", () => {
    expect(settingsAction(page, focus(0, 2), SETTINGS_DEFAULTS, [])).toEqual({
      kind: "launch",
      id: BROWSER_APP,
      params: { target: AVATAR_EDITOR_URL },
    });
  });
});

describe("app descriptions", () => {
  const apps = [
    { id: "netflix", title: "Netflix" },
    { id: "org.example.app", title: "Example" },
  ] as never;

  it("lists every app on the descriptions page", () => {
    const page = settingsCategoryPage("descriptions", SETTINGS_DEFAULTS, apps);
    expect(page?.groups[0]?.items.map((item) => item.id)).toEqual([
      "description:netflix",
      "description:org.example.app",
    ]);
  });

  it("opens an edit for the focused app", () => {
    const page = settingsCategoryPage("descriptions", SETTINGS_DEFAULTS, apps)!;
    expect(settingsAction(page, focus(0, 1), SETTINGS_DEFAULTS, apps)).toEqual({
      kind: "edit",
      key: "description:org.example.app",
    });
  });

  it("shows the shipped line, or the user's over it", () => {
    const page = settingsCategoryPage("descriptions", SETTINGS_DEFAULTS, apps)!;
    expect(settingsDetail(page, focus(0, 0), SETTINGS_DEFAULTS, apps).values).toEqual([
      "Instantly watch TV episodes and movies",
    ]);
    const own = { ...SETTINGS_DEFAULTS, appDescriptions: { netflix: "Movie night" } };
    expect(settingsDetail(page, focus(0, 0), own, apps).values).toEqual(["Movie night"]);
  });
});
