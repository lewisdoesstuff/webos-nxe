import { callLuna } from "../luna";
import { STEAM_METHODS, type SteamApi, type SteamMethod } from "./types";

/** The Luna service the TV runs the backend as. */
export const STEAM_SERVICE = "luna://ooo.lew.nxe.steam";

interface Reply {
  result?: unknown;
}

function build(call: (method: SteamMethod) => Promise<unknown>): SteamApi {
  const api: Partial<Record<SteamMethod, () => Promise<unknown>>> = {};
  for (const method of STEAM_METHODS) api[method] = () => call(method);
  return api as unknown as SteamApi;
}

/** The backend service on the TV, reached over Luna. */
export function lunaSteam(): SteamApi {
  return build(async (method) => {
    const reply = await callLuna<Reply>(`${STEAM_SERVICE}/${method}`, {});
    return reply.result;
  });
}

/** The dev server's `/steam/*`. `mock` asks it for the backend that never leaves the machine. */
export function httpSteam(mock: boolean): SteamApi {
  return build(async (method) => {
    const response = await fetch(
      `/steam/${method}`,
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
