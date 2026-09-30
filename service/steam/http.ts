import type { IncomingMessage, ServerResponse } from "node:http";

import { STEAM_METHODS, type SteamApi, type SteamMethod } from "../../app/src/steam/types";

/**
 * `/steam/<method>` over HTTP, for the dev server. `backendFor` picks the
 * backend per request, so a page can ask for the mock.
 */
export function steamHandler(
  backendFor: (request: IncomingMessage) => SteamApi,
): (request: IncomingMessage, response: ServerResponse, next: () => void) => void {
  return (request, response, next) => {
    const [path = "", query = ""] = (request.url ?? "").split("?");
    const method = path.replace(/^\//, "");
    const steamId = new URLSearchParams(query).get("steamId") ?? "";
    if (!(STEAM_METHODS as readonly string[]).includes(method)) return next();
    const api = backendFor(request);
    void (async () => {
      try {
        const result =
          method === "games"
            ? await api.games(steamId)
            : await api[method as Exclude<SteamMethod, "games">]();
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(result ?? null));
      } catch (error) {
        response.statusCode = 502;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }));
      }
    })();
  };
}
