import { callLuna } from "../luna";
import { STEAM_METHODS, type SteamApi, type SteamMethod } from "./types";

/** The Luna service the TV runs the backend as. */
export const STEAM_SERVICE = "luna://ooo.lew.nxe.steam";

interface Reply {
  result?: unknown;
}

type Call = (method: SteamMethod, args: Record<string, string>) => Promise<unknown>;

function build(call: Call): SteamApi {
  const api: Partial<Record<SteamMethod, (steamId?: string) => Promise<unknown>>> = {};
  for (const method of STEAM_METHODS) {
    api[method] = (steamId) => call(method, steamId === undefined ? {} : { steamId });
  }
  return api as unknown as SteamApi;
}

/** The backend service on the TV, reached over Luna. */
export function lunaSteam(): SteamApi {
  return build(async (method, args) => {
    const reply = await callLuna<Reply>(`${STEAM_SERVICE}/${method}`, args);
    return reply.result;
  });
}

/** The dev server's `/steam/*`. `mock` asks it for the backend that never leaves the machine. */
export function httpSteam(mock: boolean): SteamApi {
  return build(async (method, args) => {
    const query = new URLSearchParams(args).toString();
    const response = await fetch(
      `/steam/${method}${query ? `?${query}` : ""}`,
      mock ? { headers: { "x-steam-mock": "1" } } : {},
    );
    const body: unknown = await response.json();
    if (!response.ok) throw new Error((body as { error?: string }).error ?? "Steam failed");
    return body;
  });
}

/** Whichever backend this page has: Luna on the TV, the dev server elsewhere. `?steam=mock` picks the mock. */
export function pickSteam(): SteamApi {
  if (typeof window.PalmServiceBridge === "function") return lunaSteam();
  return httpSteam(new URLSearchParams(window.location.search).get("steam") === "mock");
}
