import { describe, expect, it } from "vitest";

import { BLADE_COUNT } from "./ribbon";
import {
  CHANNEL_ORDER,
  classify,
  groupRows,
  recentlyLaunched,
  SECTION_IDS,
  SECTIONS,
  type SectionId,
  sectionFor,
  sectionRows,
  isChannel,
  startChannel,
  START_CHANNEL,
  unclassifiedRows,
  UNCLASSIFIED,
  type Reported,
} from "./sections";
import { SETTINGS_DEFAULTS, type Settings, type SortMode } from "./settings";

/**
 * What this TV reported for `listLaunchPoints`, plus the five sources the store
 * probes for by id. Read over CDP on 2026-09-28, with the `systemApp` and
 * `vendor` flags the payload carried, because those are what the classification
 * reads and a hand-written id list would not carry them.
 */
const TV: Reported[] = [
  { id: "com.webos.app.discovery", title: "Apps", systemApp: true },
  { id: "youtube.leanback.v4", title: "YouTube AdFree" },
  { id: "cdp-30", title: "Plex" },
  { id: "tv.twitch.tv.starshot.lg", title: "Twitch" },
  { id: "com.collegehumor.chdropout", title: "Dropout", vendor: "Vimeo OTT" },
  { id: "spotify-beehive", title: "Spotify - Music and Podcasts" },
  { id: "com.limelight.webos", title: "Moonlight" },
  { id: "org.webosbrew.hbchannel", title: "Homebrew Channel" },
  { id: "com.webos.app.lgchannels", title: "LG Channels", systemApp: true },
  { id: "com.webos.app.sportsteamsettings", title: "Sports", systemApp: true },
  { id: "com.webos.app.homeconnect", title: "Home Hub", systemApp: true },
  { id: "com.webos.app.lifeonscreen", title: "Always Ready", systemApp: true },
  { id: "com.webos.app.browser", title: "Web Browser", systemApp: true },
  { id: "com.webos.app.mediadiscovery", title: "Media Player", systemApp: true },
  { id: "amazon.alexa.view", title: "Amazon Alexa" },
  { id: "com.webos.app.camera", title: "Camera", systemApp: true },
  { id: "com.pirate.refresh", title: "Auto Token Refresh" },
  { id: "org.webosbrew.custom-screensaver", title: "Custom Screensaver" },
  { id: "ooo.lew.lifesgoodwithoutspying", title: "Life's Good Without Spying" },
  { id: "webos.day", title: "LG Streaming Week" },
  { id: "netflix", title: "Netflix" },
  { id: "ooo.lew.lemmonlauncher", title: "LemmonLauncher" },
  { id: "ooo.lew.blades", title: "Blades" },
  { id: "org.local.openxmb.c5", title: "Home" },
  { id: "ooo.lew.nxe", title: "NXE" },
  { id: "com.webos.app.livetv", title: "Live TV" },
  { id: "com.webos.app.hdmi1", title: "HDMI 1" },
  { id: "com.webos.app.hdmi2", title: "HDMI 2" },
  { id: "com.webos.app.hdmi3", title: "HDMI 3" },
  { id: "com.webos.app.hdmi4", title: "HDMI 4" },
];

/** Apps a build that has them would report, to widen the property test. */
const SYNTHETIC: Reported[] = [
  { id: "com.webos.app.dp1", title: "DisplayPort" },
  { id: "com.webos.app.usbc2", title: "USB-C" },
  { id: "com.webos.app.photoviewer", title: "Photo Viewer", systemApp: true },
  { id: "com.palm.app.settings", title: "Settings", systemApp: true },
  { id: "com.example.retrogame", title: "Retro Game", appType: "crosspkg" },
  { id: "com.example.hueshift", title: "Hue Shift", appType: "j2me" },
  { id: "com.example.empty", title: "" },
  { id: "", title: "" },
];

const POOL = [...TV, ...SYNTHETIC];

function ids(rows: readonly { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

function count(section: SectionId, points: readonly Reported[] = TV): number {
  return sectionRows(section, points, SETTINGS_DEFAULTS).length;
}

describe("the section list", () => {
  it("is in the order the chrome artwork and the ramp are keyed to", () => {
    expect(SECTION_IDS).toEqual(["inputs", "apps", "games", "friends", "media", "system", "home"]);
  });

  it("has the Guide's blades, Home and Friends", () => {
    expect(SECTIONS).toHaveLength(BLADE_COUNT + 2);
  });

  it("gives every section a label and a plate colour to key artwork to", () => {
    for (const section of SECTIONS) {
      expect(section.label).not.toBe("");
      expect(section.tint).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(SECTIONS.map((section) => section.label)).size).toBe(SECTIONS.length);
  });
});

describe("isChannel", () => {
  it("names the channel at a place in the list", () => {
    expect(isChannel(CHANNEL_ORDER.indexOf("home"), "home")).toBe(true);
    expect(isChannel(CHANNEL_ORDER.indexOf("apps"), "home")).toBe(false);
    expect(isChannel(-1, "home")).toBe(false);
  });
});

describe("startChannel", () => {
  it("resumes the stored channel", () => {
    expect(startChannel("games")).toBe(CHANNEL_ORDER.indexOf("games"));
    expect(startChannel("home")).toBe(START_CHANNEL);
  });

  it("starts on Apps for anything it does not recognise", () => {
    for (const stored of ["nope", "", "welcome"]) {
      expect(startChannel(stored), stored).toBe(START_CHANNEL);
    }
  });
});

describe("classify", () => {
  it("takes a source off the shared input test, and the sources it does not know", () => {
    expect(classify({ id: "com.webos.app.livetv", title: "Live TV" })).toBe("inputs");
    expect(classify({ id: "com.webos.app.hdmi2", title: "HDMI 2" })).toBe("inputs");
    expect(classify({ id: "com.webos.app.dp1", title: "DisplayPort" })).toBe("inputs");
    expect(classify({ id: "com.webos.app.externalinput.scart", title: "SCART" })).toBe("inputs");
  });

  it("reads the TV's own apps as its own, and not as content", () => {
    expect(
      classify({ id: "com.webos.app.sportsteamsettings", title: "Sports", systemApp: true }),
    ).toBe("system");
    expect(classify({ id: "com.palm.app.settings", title: "Settings" })).toBe("system");
    expect(classify({ id: "amazon.alexa.view", title: "Amazon Alexa" })).toBe("system");
  });

  it("reads the TV's own content surfaces as content, not as configuration", () => {
    expect(
      classify({ id: "com.webos.app.mediadiscovery", title: "Media Player", systemApp: true }),
    ).toBe("media");
    expect(
      classify({ id: "com.webos.app.lgchannels", title: "LG Channels", systemApp: true }),
    ).toBe("media");
  });

  it("trusts a content word over the namespace the app sits in", () => {
    expect(classify({ id: "com.webos.netflix.player", title: "Netflix" })).toBe("media");
  });

  it("takes a storefront for a place rather than a thing to use", () => {
    expect(classify({ id: "com.webos.app.discovery", title: "Apps", systemApp: true })).toBe(
      "apps",
    );
    expect(classify({ id: "com.webos.app.homeconnect", title: "Home Hub" })).toBe("apps");
    expect(classify({ id: "com.example.mystore", title: "My Store" })).toBe("apps");
  });

  it("finds a content word in the title, the id or the vendor", () => {
    expect(classify({ id: "cdp-30", title: "Plex" })).toBe("media");
    expect(classify({ id: "youtube.leanback.v4", title: "YouTube AdFree" })).toBe("media");
    expect(
      classify({ id: "com.collegehumor.chdropout", title: "Dropout", vendor: "Vimeo OTT" }),
    ).toBe("media");
  });

  it("leaves Games empty rather than inventing a game", () => {
    expect(count("games")).toBe(0);
    expect(classify({ id: "com.limelight.webos", title: "Moonlight" })).not.toBe("games");
    expect(classify({ id: "com.webos.app.gamehome", title: "Game Home" })).not.toBe("games");
  });

  it("takes a game from the packaging, under either name a build gives it", () => {
    expect(classify({ id: "com.example.retro", title: "Retro", appType: "crosspkg" })).toBe(
      "games",
    );
    expect(classify({ id: "com.example.puzzle", title: "Puzzle", type: "j2me" })).toBe("games");
  });

  it("says it does not know rather than guessing", () => {
    expect(classify({ id: "org.webosbrew.hbchannel", title: "Homebrew Channel" })).toBe(
      UNCLASSIFIED,
    );
    expect(classify({ id: "", title: "" })).toBe(UNCLASSIFIED);
    expect(classify({ id: "com.example.thing", title: "Thing", vendor: "Nobody" })).toBe(
      UNCLASSIFIED,
    );
  });
});

describe("sectionFor", () => {
  it("prefers the user's section to the heuristic", () => {
    expect(sectionFor({ id: "netflix", title: "Netflix" }, { netflix: "system" })).toBe("system");
    expect(
      sectionFor(
        { id: "com.webos.app.hdmi1", title: "HDMI 1" },
        { "com.webos.app.hdmi1": "media" },
      ),
    ).toBe("media");
  });

  it("falls back to the heuristic where the user has not chosen", () => {
    expect(sectionFor({ id: "netflix", title: "Netflix" }, {})).toBe("media");
  });

  it("refuses a stored section this build has not got, rather than losing the app", () => {
    expect(sectionFor({ id: "netflix", title: "Netflix" }, { netflix: "marketplace" })).toBe(
      "media",
    );
    expect(
      sectionFor(
        { id: "org.webosbrew.hbchannel", title: "Homebrew Channel" },
        { "org.webosbrew.hbchannel": "nope" },
      ),
    ).toBe(UNCLASSIFIED);
  });
});

describe("groupRows", () => {
  it("puts every launch point on exactly one blade, and loses none", () => {
    const rows = groupRows(TV, SETTINGS_DEFAULTS);
    const shown = SECTIONS.flatMap((section) => rows[section.id]);
    expect(shown).toHaveLength(TV.length);
    expect(new Set(ids(shown)).size).toBe(TV.length);
  });

  it("reads this TV the way the hardware says it is", () => {
    const rows = groupRows(TV, SETTINGS_DEFAULTS);
    expect(ids(rows.inputs)).toEqual([
      "com.webos.app.livetv",
      "com.webos.app.hdmi1",
      "com.webos.app.hdmi2",
      "com.webos.app.hdmi3",
      "com.webos.app.hdmi4",
    ]);
    expect(count("media")).toBe(9);
    expect(count("system")).toBe(5);
    expect(count("apps")).toBe(11);
    expect(count("games")).toBe(0);
  });

  it("copes with nothing installed", () => {
    expect(groupRows([], SETTINGS_DEFAULTS)).toEqual({
      inputs: [],
      apps: [],
      games: [],
      friends: [],
      media: [],
      system: [],
      home: [],
    });
  });

  it("draws an id the device reported twice as one row", () => {
    const doubled: Reported[] = [
      { id: "netflix", title: "Netflix" },
      { id: "netflix", title: "Netflix" },
    ];
    expect(sectionRows("media", doubled, SETTINGS_DEFAULTS)).toHaveLength(1);
  });
});

describe("the unclassified apps", () => {
  it("fold into Apps, so an installed app is never off the hub", () => {
    expect(ids(sectionRows("apps", TV, SETTINGS_DEFAULTS))).toContain("org.webosbrew.hbchannel");
    expect(ids(sectionRows("apps", TV, SETTINGS_DEFAULTS))).toContain("ooo.lew.nxe");
  });

  it("come back on their own, for a screen that wants to show what was not recognised", () => {
    expect(ids(unclassifiedRows(TV, SETTINGS_DEFAULTS))).toEqual([
      "com.limelight.webos",
      "org.webosbrew.hbchannel",
      "com.pirate.refresh",
      "org.webosbrew.custom-screensaver",
      "ooo.lew.lifesgoodwithoutspying",
      "ooo.lew.lemmonlauncher",
      "ooo.lew.blades",
      "org.local.openxmb.c5",
      "ooo.lew.nxe",
    ]);
  });

  it("leave the residual when the user has given them a section", () => {
    const settings = { ...SETTINGS_DEFAULTS, appSection: { "ooo.lew.nxe": "system" } };
    expect(ids(unclassifiedRows(TV, settings))).not.toContain("ooo.lew.nxe");
    expect(ids(sectionRows("system", TV, settings))).toContain("ooo.lew.nxe");
  });
});

describe("hidden and invisible apps", () => {
  it("drops the apps the user hid", () => {
    const settings = { ...SETTINGS_DEFAULTS, hiddenApps: ["netflix", "cdp-30"] };
    expect(count("media", TV)).toBe(9);
    expect(ids(sectionRows("media", TV, settings))).not.toContain("netflix");
    expect(sectionRows("media", TV, settings)).toHaveLength(7);
  });

  it("drops the apps the device marked invisible", () => {
    const hidden: Reported[] = [{ id: "netflix", title: "Netflix", visible: false }];
    expect(sectionRows("media", hidden, SETTINGS_DEFAULTS)).toEqual([]);
  });

  it("keeps a hidden app out of the recent list too", () => {
    const settings = { ...SETTINGS_DEFAULTS, recentApps: ["netflix"], hiddenApps: ["netflix"] };
    expect(recentlyLaunched(TV, settings)).toEqual([]);
  });
});

describe("ordering", () => {
  const MEDIA = [
    "youtube.leanback.v4",
    "cdp-30",
    "tv.twitch.tv.starshot.lg",
    "com.collegehumor.chdropout",
    "spotify-beehive",
    "com.webos.app.lgchannels",
    "com.webos.app.mediadiscovery",
    "webos.day",
    "netflix",
  ];

  it("leaves the device's order alone by default", () => {
    expect(ids(sectionRows("media", TV, SETTINGS_DEFAULTS))).toEqual(MEDIA);
  });

  it("sorts by name in either direction, ties keeping the device's order", () => {
    const ascending = { ...SETTINGS_DEFAULTS, sortModes: { media: "name-asc" as const } };
    expect(ids(sectionRows("media", TV, ascending))).toEqual([
      "com.collegehumor.chdropout",
      "com.webos.app.lgchannels",
      "webos.day",
      "com.webos.app.mediadiscovery",
      "netflix",
      "cdp-30",
      "spotify-beehive",
      "tv.twitch.tv.starshot.lg",
      "youtube.leanback.v4",
    ]);

    const descending = { ...SETTINGS_DEFAULTS, sortModes: { media: "name-desc" as const } };
    expect(ids(sectionRows("media", TV, descending))).toEqual([
      "youtube.leanback.v4",
      "tv.twitch.tv.starshot.lg",
      "spotify-beehive",
      "cdp-30",
      "netflix",
      "com.webos.app.mediadiscovery",
      "webos.day",
      "com.webos.app.lgchannels",
      "com.collegehumor.chdropout",
    ]);
  });

  it("puts the launch history first and leaves the rest where the device had it", () => {
    const settings = {
      ...SETTINGS_DEFAULTS,
      sortModes: { media: "recent" as const },
      recentApps: ["spotify-beehive", "netflix"],
    };
    expect(ids(sectionRows("media", TV, settings))).toEqual([
      "spotify-beehive",
      "netflix",
      "youtube.leanback.v4",
      "cdp-30",
      "tv.twitch.tv.starshot.lg",
      "com.collegehumor.chdropout",
      "com.webos.app.lgchannels",
      "com.webos.app.mediadiscovery",
      "webos.day",
    ]);
  });

  it("reads a missing sort mode as the default rather than as an error", () => {
    const settings = { ...SETTINGS_DEFAULTS, sortModes: { inputs: "nonsense" as SortMode } };
    expect(ids(sectionRows("media", TV, settings))).toEqual(MEDIA);
  });

  it("puts the named apps first, in that order, and the rest in the device's order", () => {
    const settings = { ...SETTINGS_DEFAULTS, appOrder: ["netflix", "cdp-30", "not-installed"] };
    expect(ids(sectionRows("media", TV, settings))).toEqual([
      "netflix",
      "cdp-30",
      "youtube.leanback.v4",
      "tv.twitch.tv.starshot.lg",
      "com.collegehumor.chdropout",
      "spotify-beehive",
      "com.webos.app.lgchannels",
      "com.webos.app.mediadiscovery",
      "webos.day",
    ]);
  });

  it("lets a hand-made order win over a mode, which still orders what it does not name", () => {
    const settings = {
      ...SETTINGS_DEFAULTS,
      sortModes: { media: "name-asc" as const },
      appOrder: ["cdp-30"],
    };
    expect(ids(sectionRows("media", TV, settings))).toEqual([
      "cdp-30",
      "com.collegehumor.chdropout",
      "com.webos.app.lgchannels",
      "webos.day",
      "com.webos.app.mediadiscovery",
      "netflix",
      "spotify-beehive",
      "tv.twitch.tv.starshot.lg",
      "youtube.leanback.v4",
    ]);
  });

  it("applies an order written for one section without disturbing another", () => {
    const settings = { ...SETTINGS_DEFAULTS, appOrder: ["netflix", "com.webos.app.livetv"] };
    expect(ids(sectionRows("media", TV, settings))[0]).toBe("netflix");
    expect(ids(sectionRows("inputs", TV, settings))).toEqual([
      "com.webos.app.livetv",
      "com.webos.app.hdmi1",
      "com.webos.app.hdmi2",
      "com.webos.app.hdmi3",
      "com.webos.app.hdmi4",
    ]);
  });
});

describe("recentlyLaunched", () => {
  it("reads the history newest first and drops what the device no longer has", () => {
    const settings = {
      ...SETTINGS_DEFAULTS,
      recentApps: ["ooo.lew.nxe", "com.webos.app.hdmi1", "netflix", "com.example.gone"],
    };
    expect(ids(recentlyLaunched(TV, settings))).toEqual([
      "ooo.lew.nxe",
      "com.webos.app.hdmi1",
      "netflix",
    ]);
  });

  it("caps the list, and an empty cap is an empty list rather than all of them", () => {
    const settings = { ...SETTINGS_DEFAULTS, recentApps: ids(TV) };
    expect(recentlyLaunched(TV, settings)).toHaveLength(8);
    expect(recentlyLaunched(TV, settings, 3)).toHaveLength(3);
    expect(recentlyLaunched(TV, settings, 0)).toEqual([]);
  });

  it("copes with no history and no apps", () => {
    expect(recentlyLaunched(TV, SETTINGS_DEFAULTS)).toEqual([]);
    expect(recentlyLaunched([], SETTINGS_DEFAULTS)).toEqual([]);
  });
});

/**
 * Settings documents at random, off one seed so a failure is reproducible. Every
 * document is a legal one: hidden ids that are installed, orders and section
 * choices that name real apps, and a sort mode per section.
 */
function documents(
  pool: readonly Reported[],
  howMany: number,
): { pool: Reported[]; settings: Settings }[] {
  let state = 20260928;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
  const some = <T>(list: readonly T[]): T[] => list.filter(() => next() < 0.3);

  const out: { pool: Reported[]; settings: Settings }[] = [];
  for (let i = 0; i < howMany; i += 1) {
    const poolShuffled = [...pool].sort(() => next() - 0.5);
    const appSection: Record<string, string> = {};
    for (const section of SECTION_IDS) {
      if (next() < 0.2) appSection[pick(ids(poolShuffled))] = section;
    }
    const sortModes: Record<string, SortMode> = {};
    for (const section of SECTION_IDS) {
      if (next() < 0.5) sortModes[section] = pick(["default", "recent", "name-asc", "name-desc"]);
    }
    out.push({
      pool: poolShuffled,
      settings: {
        ...SETTINGS_DEFAULTS,
        appOrder: some(ids(poolShuffled)),
        hiddenApps: some(ids(poolShuffled)),
        appSection,
        sortModes,
        recentApps: some(ids(poolShuffled)),
      },
    });
  }
  return out;
}

describe("no app is ever assigned twice", () => {
  const cases = documents(POOL, 300);

  it("holds for three hundred settings documents over the real and the synthetic apps", () => {
    for (const { pool, settings } of cases) {
      const shownIds = ids(SECTIONS.flatMap((section) => groupRows(pool, settings)[section.id]));
      expect(new Set(shownIds).size).toBe(shownIds.length);
    }
  });

  it("puts every app the settings do not hide somewhere, and none of them twice", () => {
    for (const { pool, settings } of cases) {
      const shownIds = ids(SECTIONS.flatMap((section) => groupRows(pool, settings)[section.id]));
      const expected = pool.filter(
        (point) => point.visible !== false && !settings.hiddenApps.includes(point.id),
      );
      expect(shownIds).toHaveLength(expected.length);
    }
  });

  it("agrees with the placement it computed for each app on its own", () => {
    for (const { pool, settings } of cases) {
      const rows = groupRows(pool, settings);
      for (const point of pool) {
        if (point.visible === false || settings.hiddenApps.includes(point.id)) continue;
        const placement = sectionFor(point, settings.appSection);
        const blade = placement === UNCLASSIFIED ? "apps" : placement;
        expect(ids(rows[blade])).toContain(point.id);
      }
    }
  });

  it("hands every shown app to exactly one section, and every hidden one to none", () => {
    for (const { pool, settings } of cases) {
      const rows = groupRows(pool, settings);
      const perSection = SECTION_IDS.map((section) => new Set(ids(rows[section])));
      for (const point of pool) {
        const blades = perSection.filter((set) => set.has(point.id)).length;
        const shown = point.visible !== false && !settings.hiddenApps.includes(point.id);
        expect(blades).toBe(shown ? 1 : 0);
      }
    }
  });
});
