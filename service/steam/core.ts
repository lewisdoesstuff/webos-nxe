import type {
  PersonaState,
  QrPoll,
  SteamApi,
  SteamFriend,
  SteamGames,
  SteamStatus,
} from "../../app/src/steam/types.ts";

/** The part of steam-session's `LoginSession` this backend uses, so a test can stand in for it. */
export interface QrSession {
  readonly steamID: { getSteamID64(): string };
  accessToken: string;
  refreshToken: string;
  on(
    event: "remoteInteraction" | "authenticated" | "timeout" | "error",
    listener: (error?: Error) => void,
  ): unknown;
  startWithQR(): Promise<{ qrChallengeUrl?: string }>;
  refreshAccessToken(): Promise<void>;
  cancelLoginAttempt(): boolean;
}

export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string | null): Promise<void>;
}

export interface SteamDeps {
  readonly newSession: () => QrSession;
  readonly store: TokenStore;
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

const API = "https://api.steampowered.com";

/** `EFriendRelationship.Friend`; the list also carries requests and ignored accounts. */
const FRIEND = 3;

/** The most games one friend's list carries. */
const GAMES_SHOWN = 300;

const STATES: readonly PersonaState[] = [
  "offline",
  "online",
  "busy",
  "away",
  "snooze",
  "trade",
  "play",
];

interface Summary {
  steamid: string;
  personaname?: string;
  avatarfull?: string;
  personastate?: number;
  gameextrainfo?: string;
  gameid?: string;
  lastlogoff?: number;
  timecreated?: number;
}

/** The expiry of a JWT access token, in ms, or 0 when it cannot be read. */
export function tokenExpiry(token: string): number {
  try {
    const body = token.split(".")[1] ?? "";
    const json = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function toFriend(summary: Summary): SteamFriend {
  const base = {
    id: summary.steamid,
    name: summary.personaname ?? summary.steamid,
    avatar: summary.avatarfull ?? "",
    state: STATES[summary.personastate ?? 0] ?? "offline",
  };
  const extra = {
    ...(summary.lastlogoff ? { lastSeen: summary.lastlogoff * 1000 } : {}),
    ...(summary.timecreated ? { since: summary.timecreated * 1000 } : {}),
  };
  return summary.gameextrainfo
    ? {
        ...base,
        ...extra,
        state: "play",
        game: summary.gameextrainfo,
        ...(summary.gameid ? { gameId: summary.gameid } : {}),
      }
    : { ...base, ...extra };
}

interface Session {
  steamId: string;
  access: string;
  expires: number;
  name: string;
  avatar: string;
}

/**
 * Steam sign-in by QR and the friends list, with the refresh token kept here.
 * Nothing in a returned value is a credential.
 */
export function createSteamBackend(deps: SteamDeps): SteamApi {
  const now = deps.now ?? Date.now;
  let login: QrSession | null = null;
  let qr: QrPoll = { state: "error", message: "No sign-in is in progress." };
  let session: Session | null = null;
  let refresh: string | null = null;
  let restored: Promise<void> | null = null;

  async function openSession(refreshToken: string): Promise<void> {
    const fresh = deps.newSession();
    fresh.refreshToken = refreshToken;
    await fresh.refreshAccessToken();
    session = {
      steamId: fresh.steamID.getSteamID64(),
      access: fresh.accessToken,
      expires: tokenExpiry(fresh.accessToken),
      name: session?.name ?? "",
      avatar: session?.avatar ?? "",
    };
    refresh = refreshToken;
  }

  function restore(): Promise<void> {
    restored ??= (async () => {
      const token = await deps.store.read();
      if (token === null) return;
      try {
        await openSession(token);
      } catch {
        // A refused refresh token is a signed-out backend, not an error.
        await deps.store.write(null);
      }
    })();
    return restored;
  }

  async function accessToken(): Promise<Session> {
    await restore();
    if (session === null || refresh === null) throw new Error("Not signed in.");
    if (session.expires - now() < 60_000) await openSession(refresh);
    return session ?? Promise.reject(new Error("Not signed in."));
  }

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const { access } = await accessToken();
    const query = new URLSearchParams({ ...params, access_token: access });
    const response = await deps.fetch(`${API}${path}?${query}`);
    if (!response.ok) throw new Error(`Steam answered ${response.status} for ${path}.`);
    return (await response.json()) as T;
  }

  async function summaries(ids: readonly string[]): Promise<Summary[]> {
    const out: Summary[] = [];
    for (let at = 0; at < ids.length; at += 100) {
      const reply = await get<{ players?: Summary[] }>("/ISteamUserOAuth/GetUserSummaries/v1/", {
        steamids: ids.slice(at, at + 100).join(","),
      });
      out.push(...(reply.players ?? []));
    }
    return out;
  }

  return {
    async status(): Promise<SteamStatus> {
      await restore();
      if (session === null) return { state: "signedOut" };
      if (session.name === "") {
        const id = session.steamId;
        const all = await summaries([id]).catch(() => []);
        const me = all.find((entry) => entry.steamid === id);
        session.name = me?.personaname ?? id;
        session.avatar = me?.avatarfull ?? "";
      }
      return {
        state: "signedIn",
        steamId: session.steamId,
        name: session.name,
        ...(session.avatar ? { avatar: session.avatar } : {}),
      };
    },

    async beginQr(): Promise<QrPoll> {
      login?.cancelLoginAttempt();
      const next = deps.newSession();
      login = next;
      qr = { state: "pending" };
      next.on("remoteInteraction", () => {
        if (login === next) qr = { ...qr, state: "scanned" };
      });
      next.on("timeout", () => {
        if (login === next) qr = { state: "expired", message: "The code timed out." };
      });
      next.on("error", (error) => {
        if (login === next) qr = { state: "error", message: error?.message ?? "Steam failed." };
      });
      next.on("authenticated", () => {
        if (login !== next) return;
        const token = next.refreshToken;
        session = {
          steamId: next.steamID.getSteamID64(),
          access: next.accessToken,
          expires: tokenExpiry(next.accessToken),
          name: "",
          avatar: "",
        };
        refresh = token;
        restored = Promise.resolve();
        qr = { state: "signedIn" };
        login = null;
        void deps.store.write(token);
      });
      try {
        const started = await next.startWithQR();
        qr = { state: "pending", url: started.qrChallengeUrl ?? "" };
      } catch (error) {
        qr = { state: "error", message: error instanceof Error ? error.message : String(error) };
      }
      return qr;
    },

    async pollQr(): Promise<QrPoll> {
      return qr;
    },

    async friends(): Promise<readonly SteamFriend[]> {
      await accessToken();
      const list = await get<{
        response?: {
          friendslist?: { friends?: { ulfriendid: string; efriendrelationship: number }[] };
        };
      }>("/IFriendsListService/GetFriendsList/v1/", {});
      const ids = (list.response?.friendslist?.friends ?? [])
        .filter((friend) => friend.efriendrelationship === FRIEND)
        .map((friend) => friend.ulfriendid);
      return (await summaries(ids)).map(toFriend);
    },

    async games(steamId: string): Promise<SteamGames> {
      if (!/^\d{1,20}$/.test(steamId)) throw new Error("Not a Steam ID.");
      const reply = await get<{
        response?: {
          game_count?: number;
          games?: {
            appid: number;
            name?: string;
            img_icon_url?: string;
            playtime_forever?: number;
          }[];
        };
      }>("/IPlayerService/GetOwnedGames/v1/", {
        steamid: steamId,
        include_appinfo: "true",
        include_played_free_games: "true",
      });
      const body = reply.response ?? {};
      // A private profile answers with an empty object, a library of none with a count of 0.
      const hidden = body.game_count === undefined && body.games === undefined;
      const games = (body.games ?? [])
        .map((game) => ({
          id: String(game.appid),
          name: game.name ?? String(game.appid),
          icon: game.img_icon_url
            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
            : "",
          minutes: game.playtime_forever ?? 0,
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, GAMES_SHOWN);
      return { games, hidden };
    },

    async signOut(): Promise<void> {
      login?.cancelLoginAttempt();
      login = null;
      session = null;
      refresh = null;
      restored = Promise.resolve();
      qr = { state: "error", message: "No sign-in is in progress." };
      await deps.store.write(null);
    },
  };
}
