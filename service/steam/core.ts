import type {
  PersonaState,
  QrPoll,
  SteamApi,
  SteamFriend,
  SteamStatus,
} from "../../app/src/steam/types";

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
  return summary.gameextrainfo ? { ...base, state: "play", game: summary.gameextrainfo } : base;
}

interface Session {
  steamId: string;
  access: string;
  expires: number;
  name: string;
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
    if (!response.ok) throw new Error(`Steam answered ${response.status}.`);
    return (await response.json()) as T;
  }

  async function summaries(ids: readonly string[]): Promise<Summary[]> {
    const out: Summary[] = [];
    for (let at = 0; at < ids.length; at += 100) {
      const reply = await get<{ response?: { players?: Summary[] } }>(
        "/ISteamUser/GetPlayerSummaries/v2/",
        { steamids: ids.slice(at, at + 100).join(",") },
      );
      out.push(...(reply.response?.players ?? []));
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
        session.name = all.find((entry) => entry.steamid === id)?.personaname ?? id;
      }
      return { state: "signedIn", steamId: session.steamId, name: session.name };
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
      const { steamId } = await accessToken();
      const list = await get<{ friendslist?: { friends?: { steamid: string }[] } }>(
        "/ISteamUser/GetFriendList/v1/",
        { steamid: steamId, relationship: "friend" },
      );
      const ids = (list.friendslist?.friends ?? []).map((friend) => friend.steamid);
      return (await summaries(ids)).map(toFriend);
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
