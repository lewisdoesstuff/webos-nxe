import { isInputAppId } from "./preview/inputs";
import { applyOrder, sectionForApp, type Settings, type SortMode } from "./settings";
import type { LaunchPoint } from "./types";

/**
 * Which blade a launch point goes on.
 *
 * Pure: no Vue, no DOM, no Luna, so the classification can be read and tested on
 * its own. The input is what Luna reports for an app, the output is the hub's
 * section list.
 *
 * NXE's own blades were Games, Media, My Xbox and the Marketplaces. Those were
 * a games console's sections. This is a television with a tuner, four HDMI
 * sockets, a settings app and a voice assistant, and the sources and the
 * settings belong on the hub as much as the content does, so the five blades
 * here are this project's choice rather than Microsoft's: Inputs, Apps, Games,
 * Media, System.
 */

export interface Section {
  readonly id: string;
  readonly label: string;
  /** The blade's plate colour, which the chrome keys its artwork to. */
  readonly tint: string;
  /**
   * The panel's one line of copy.
   *
   * Authored per section and never derived from the rows. The 2008 panel's copy
   * block was description rather than a listing, and a listing would repeat the
   * tile names back at the reader. A fixed string also cannot wrap, so the panel
   * layout is stable whatever the rows do.
   *
   * Must fit one line at 15px inside the plate's 348px of interior width, so
   * under about 44 characters once the face is measured. See DESIGN-PANEL.md 5.3.
   */
  readonly blurb: string;
}

/**
 * The blades, in ribbon order, and not a setting.
 *
 * The order is fixed because the chrome artwork and the ramp in `ribbon.ts` are
 * keyed to it, so a section moved would put one blade's plate against another's
 * picture. There are five of them against five ramp slots, so the ribbon is one
 * full lap and the whole hub is on screen at once.
 *
 * The colours are ours. The scene data carries no per-blade colour, only the hub
 * radial (`#0F0F0F` into `#81878D`), and these sit in that family as dark plates
 * under white blade labels.
 */
export const SECTIONS = [
  {
    id: "inputs",
    label: "Inputs",
    tint: "#1f5a6a",
    blurb: "The tuner and four HDMI sockets.",
  },
  {
    id: "apps",
    label: "Apps",
    tint: "#6a3a1f",
    blurb: "Everything installed on this TV.",
  },
  {
    id: "games",
    label: "Games",
    tint: "#3f6a1f",
    blurb: "Nothing here until a game arrives.",
  },
  {
    id: "friends",
    label: "Friends",
    tint: "#3a5a2f",
    blurb: "Your Steam friends, online first.",
  },
  { id: "media", label: "Media", tint: "#5a3a6e", blurb: "Video and music apps." },
  {
    id: "system",
    label: "System",
    tint: "#3a3a44",
    blurb: "Settings, setup and assistants.",
  },
  {
    id: "home",
    label: "Home",
    tint: "#2f4a6a",
    blurb: "The apps you pinned here.",
  },
] as const satisfies readonly [Section, ...Section[]];

export type SectionId = (typeof SECTIONS)[number]["id"];

/** The ids, in ribbon order, for a caller that keys something off them. */
export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((section) => section.id);

/**
 * The hub's channel list, top to bottom. The selected channel sits lowest and
 * the dashboard starts on the bottom one, so the most used goes last.
 */
export const CHANNEL_ORDER: readonly SectionId[] = [
  "system",
  "friends",
  "media",
  "games",
  "inputs",
  "apps",
  "home",
];

/** Whether the channel at `index` in the list is `id`. */
export function isChannel(index: number, id: SectionId): boolean {
  return CHANNEL_ORDER[index] === id;
}

/** The channel the hub starts on: the bottom of the list. */
export const START_CHANNEL = CHANNEL_ORDER.length - 1;

/**
 * The channel to start on: the stored one where it names a channel this build
 * has, else the bottom of the list.
 *
 * A stored id from another build is refused rather than honoured, the way an
 * unknown `appSection` override is: starting on Apps beats starting on a
 * channel that is not there.
 */
export function startChannel(lastChannel: string): number {
  const index = CHANNEL_ORDER.findIndex((id) => id === lastChannel);
  return index === -1 ? START_CHANNEL : index;
}

const SECTION_SET: ReadonlySet<string> = new Set(SECTION_IDS);

/** A section id this build has, which a stored document may not name. */
export function isSection(id: string): id is SectionId {
  return SECTION_SET.has(id);
}

/**
 * The answer the rules did not reach.
 *
 * First-class rather than a bucket, because "nothing here says" and "it belongs
 * over there" are different claims, and only one of them is worth acting on.
 */
export const UNCLASSIFIED = "unclassified";

export type Placement = SectionId | typeof UNCLASSIFIED;

/**
 * What Luna actually reports, which is more than `LaunchPoint` carries.
 *
 * The classification leans on fields the shared type does not have:
 * `systemApp`, the only thing on a launch point that says the app is the TV's
 * own, and `vendor`, which is where the content word lives for an app with an
 * opaque id (`cdp-30` is Plex). Both are additive, so a `LaunchPoint` is a
 * `Reported` with no change and the store's list can be passed straight in.
 */
export interface Reported extends LaunchPoint {
  readonly systemApp?: boolean;
  readonly vendor?: string;
  /** Builds that call the packaging `appType` and builds that call it `type`. */
  readonly type?: string;
}

/** The sources this TV has beyond the tuner and the four HDMI apps. */
const INPUT_ID_PREFIXES = [
  "com.webos.app.dp",
  "com.webos.app.usbc",
  "com.webos.app.externalinput.",
  "com.webos.app.hdmioptical",
];

/** The namespaces the TV keeps its own apps in. */
const STOCK_ID_PREFIXES = ["com.webos.", "com.lge.", "com.palm."];

/**
 * A storefront, or a content hub. Where you find things, rather than a thing
 * you use, so it is a blade of its own and not a row of something else.
 */
const STORE_WORDS = new Set([
  "discovery",
  "store",
  "storefront",
  "marketplace",
  "premium",
  "homeconnect",
  "homeoffice",
]);

/**
 * Video and audio, whether the TV's own surface (`mediadiscovery`, `livedmost`,
 * `recordings`, `lgchannels`, `music`) or a sideloaded app whose name or its
 * vendor's says so.
 *
 * This is a floor, not a ceiling. A word absent here does not put an app
 * anywhere in particular, it leaves it unclassified, and `appSection` is how the
 * user moves it.
 */
const MEDIA_WORDS = new Set([
  // the TV's own surfaces
  "mediadiscovery",
  "mediaplayer",
  "videoplayer",
  "livedmost",
  "livehbbtv",
  "dvrpopup",
  "recordings",
  "tvuserguide",
  "tvsimpleviewer",
  "photoalbum",
  "music",
  "radio",
  "lgchannels",
  // video services
  "netflix",
  "plex",
  "plexamp",
  "plexguide",
  "youtube",
  "twitch",
  "vimeo",
  "dailymotion",
  "disney",
  "hulu",
  "prime",
  "primevideo",
  "hbo",
  "peacock",
  "paramount",
  "vudu",
  "mubi",
  "crunchyroll",
  "hidive",
  "curiosity",
  "popcorn",
  "stremio",
  "tubi",
  "pluto",
  "kodi",
  "jellyfin",
  "emby",
  "videolan",
  "bittorrent",
  "itv",
  "iplayer",
  "bbc",
  "sony",
  "sonyliv",
  "hotstar",
  "willow",
  "zee",
  "voot",
  "cinemax",
  "streaming",
  // audio services
  "spotify",
  "tidal",
  "deezer",
  "pandora",
  "audible",
  "shazam",
  "bandsintown",
  "qobuz",
]);

/** The TV's own configuration, and the voice assistants that drive it. */
const SYSTEM_WORDS = new Set(["settings", "wizard", "diagnosis", "alexa", "siri", "assistant"]);

/**
 * The only two packagings webOS has ever used for a game: the NPDP container
 * (`crosspkg`) and Java ME (`j2me`). Nothing on this TV is packaged either way,
 * so the rule is dormant here and Games is empty until a title is.
 */
const GAME_PACKAGING = new Set(["crosspkg", "j2me"]);

/** How a rule is answered, everything a rule is allowed to look at. */
interface Facts {
  /** Lowercased, so a rule never has to think about case. */
  readonly id: string;
  /** Lowercased words out of the id, the title and the vendor. */
  readonly words: ReadonlySet<string>;
  /** The packaging, under whichever of the two names the build gives it. */
  readonly packaging: string;
  /** The TV's own app, by the flag it reports or by the namespace its id is in. */
  readonly stock: boolean;
}

/**
 * Split on everything that is not a letter or a digit, so `spotify-beehive` and
 * `Spotify - Music and Podcasts` both yield `spotify`, and `com.webos.app.hdmi1`
 * does not yield `hdmi1x`.
 */
function wordsOf(text: string | undefined): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

function factsOf(point: Reported): Facts {
  const id = point.id.toLowerCase();
  return {
    id,
    words: new Set([...wordsOf(point.id), ...wordsOf(point.title), ...wordsOf(point.vendor)]),
    packaging: (point.appType ?? point.type ?? "").toLowerCase(),
    stock: point.systemApp === true || STOCK_ID_PREFIXES.some((prefix) => id.startsWith(prefix)),
  };
}

interface Rule {
  readonly section: Placement;
  /** Why the rule is there, in a line, so the table reads as a set of claims. */
  readonly why: string;
  readonly match: (facts: Facts) => boolean;
}

/** A rule that claims an app whose id, title or vendor says one of these words. */
function says(list: ReadonlySet<string>): (facts: Facts) => boolean {
  return (facts) => {
    for (const word of facts.words) {
      if (list.has(word)) return true;
    }
    return false;
  };
}

const isStore = says(STORE_WORDS);
const isMedia = says(MEDIA_WORDS);
const isSystemWord = says(SYSTEM_WORDS);

/**
 * The rules, in the order they get to claim an app. First one wins.
 *
 * The order is a claim about confidence, not about size. An input is an input
 * whatever else it is, and the sources share their ids with the rest of the
 * built-ins. A storefront is more specific than the content it fronts. A content
 * word outranks "the TV's own app", or the TV's own Media Player and its own
 * channel lineup would both be filed as configuration. Packaging is the weakest
 * signal of the lot and goes last, so an app that says what it is beats a claim
 * about how it was shipped.
 */
const RULES: readonly Rule[] = [
  {
    section: "inputs",
    why: "A source is an input whatever else its id looks like.",
    match: (facts) =>
      isInputAppId(facts.id) || INPUT_ID_PREFIXES.some((prefix) => facts.id.startsWith(prefix)),
  },
  { section: "apps", why: "A storefront is a place, not a thing you use.", match: isStore },
  {
    section: "media",
    why: "Video and audio, by the app's own name or its vendor's.",
    match: isMedia,
  },
  {
    section: "games",
    why: "A game, and the only evidence a TV has is the packaging.",
    match: (facts) => GAME_PACKAGING.has(facts.packaging),
  },
  {
    section: "system",
    why: "The TV's own apps that nothing above claimed are configuration and behaviour.",
    match: (facts) => facts.stock || isSystemWord(facts),
  },
];

/**
 * Where the rules put an app, or `UNCLASSIFIED` when they have nothing to say.
 *
 * A television is not a games console and this one has no game library, so Games
 * is empty and is meant to be: an empty blade is a truthful report, and filling
 * it by putting a game streaming client in it would not be. What the rules do
 * not recognise, they do not guess at.
 */
export function classify(point: Reported): Placement {
  const facts = factsOf(point);
  for (const rule of RULES) {
    if (rule.match(facts)) return rule.section;
  }
  return UNCLASSIFIED;
}

/**
 * The section an app goes on: the user's choice where they have made one, else
 * the rules.
 *
 * An override naming a section this build does not have is refused rather than
 * honoured, so a document left over from another build drops the app back to
 * where the rules put it instead of losing it off the hub entirely.
 */
export function sectionFor(point: Reported, appSection: Record<string, string>): Placement {
  const chosen = sectionForApp(point.id, appSection, UNCLASSIFIED);
  return isSection(chosen) && chosen !== "home" ? chosen : classify(point);
}

/** One bucket per section, keyed by id. */
export type SectionRows = { [K in SectionId]: LaunchPoint[] };

function emptyRows(): SectionRows {
  const rows: Record<string, LaunchPoint[]> = {};
  for (const section of SECTIONS) rows[section.id] = [];
  return rows as SectionRows;
}

/** Whether the hub shows this app at all. */
function isShown(point: Reported, settings: Settings): boolean {
  return point.visible !== false && !settings.hiddenApps.includes(point.id);
}

/**
 * The blade an app is shown on.
 *
 * Unclassified apps are folded into Apps rather than dropped, because a hub that
 * hides an app the user installed is a bug, and because the ribbon is fixed at
 * five blades so there is nowhere else to put them. `classify` still reports them
 * separately and `unclassifiedRows` hands them back on their own, for a screen
 * that wants to show what the rules did not recognise.
 */
function bladeFor(placement: Placement): SectionId {
  return placement === UNCLASSIFIED ? "apps" : placement;
}

/** Rank for an id in a list, with everything absent ranked last and level. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

function rankOf(rank: ReadonlyMap<string, number>, id: string): number {
  return rank.get(id) ?? UNRANKED;
}

/** Case-insensitive, and not `localeCompare`, so the order is the same everywhere. */
function compareNames(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * The sort mode's own order, before anything the user arranged by hand.
 *
 * `default` is the order the device reports, which is the order the stock home
 * shows and the one the loader deliberately leaves alone. `recent` puts the apps
 * in the history first and leaves the rest where the device had them, so a
 * launch history never shuffles an app nobody has run. Ties keep the device's
 * order in both name directions, so A-Z and Z-A differ only in the name.
 */
function sortRows(rows: readonly LaunchPoint[], mode: SortMode, settings: Settings): LaunchPoint[] {
  const sorted = [...rows];
  if (mode === "name-asc" || mode === "name-desc") {
    const sign = mode === "name-desc" ? -1 : 1;
    sorted.sort((a, b) => sign * compareNames(a.title, b.title));
    return sorted;
  }
  if (mode === "recent") {
    const rank = new Map(settings.recentApps.map((id, index) => [id, index]));
    sorted.sort((a, b) => rankOf(rank, a.id) - rankOf(rank, b.id));
  }
  return sorted;
}

/**
 * The mode first, then `appOrder` over the top: an arrangement the user made by
 * hand is a more specific statement than a mode they picked once, so it wins, and
 * the mode still orders whatever the order does not name.
 */
function order(rows: readonly LaunchPoint[], mode: SortMode, settings: Settings): LaunchPoint[] {
  const byId = new Map(rows.map((point) => [point.id, point]));
  const ids = applyOrder(
    sortRows(rows, mode, settings).map((point) => point.id),
    settings.appOrder,
  );
  return ids.map((id) => byId.get(id)).filter((row): row is LaunchPoint => row !== undefined);
}

/**
 * Every blade's rows, hidden-filtered and ordered, in ribbon order.
 *
 * The whole hub in one pass, so a caller that needs two blades does not classify
 * the same app twice, and the fold of the unclassified apps into Apps is applied
 * once here rather than by whoever asks.
 */
export function groupRows(points: readonly Reported[], settings: Settings): SectionRows {
  const rows = emptyRows();
  const seen = new Set<string>();
  const shown = new Map<string, Reported>();
  for (const point of points) {
    // An id the device reports twice is one app, and a second row for it is a
    // row that launches the same thing again.
    if (!isShown(point, settings) || seen.has(point.id)) continue;
    seen.add(point.id);
    shown.set(point.id, point);
    rows[bladeFor(sectionFor(point, settings.appSection))].push(point);
  }
  for (const section of SECTIONS) {
    const id = section.id;
    if (id === "home") continue;
    rows[id] = order(rows[id], settings.sortModes[id] ?? "default", settings);
  }
  // Home is a pin list, so it takes an app's place in the list rather than its
  // sort, and an app that was uninstalled or hidden simply drops out of it.
  rows.home = [...new Set(settings.homeApps)]
    .map((id) => shown.get(id))
    .filter((point): point is Reported => point !== undefined);
  return rows;
}

/** One blade's rows, hidden-filtered and ordered. */
export function sectionRows(
  section: SectionId,
  points: readonly Reported[],
  settings: Settings,
): LaunchPoint[] {
  return groupRows(points, settings)[section];
}

/**
 * The apps no rule claimed, on their own rather than folded into Apps.
 *
 * In the device's order, and hidden-filtered, so a settings screen can show what
 * the classification is guessing at and offer to pin each one.
 */
export function unclassifiedRows(points: readonly Reported[], settings: Settings): LaunchPoint[] {
  const rows = points.filter(
    (point) => isShown(point, settings) && sectionFor(point, settings.appSection) === UNCLASSIFIED,
  );
  return order(rows, "default", settings);
}

/** What the recent affordance shows. The store keeps a longer history than this. */
const RECENT_ROWS = 8;

/**
 * The recently launched apps, newest first.
 *
 * Ids the device no longer has, and apps the user has hidden, are dropped rather
 * than drawn as a row that cannot be launched.
 */
export function recentlyLaunched(
  points: readonly Reported[],
  settings: Settings,
  limit: number = RECENT_ROWS,
): LaunchPoint[] {
  const byId = new Map(points.map((point) => [point.id, point]));
  const seen = new Set<string>();
  const rows: LaunchPoint[] = [];
  for (const id of settings.recentApps) {
    if (rows.length >= limit) break;
    const point = byId.get(id);
    if (point === undefined || seen.has(id) || !isShown(point, settings)) continue;
    seen.add(id);
    rows.push(point);
  }
  return rows;
}
