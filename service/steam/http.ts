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
    const method = (request.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "";
    if (!(STEAM_METHODS as readonly string[]).includes(method)) return next();
    const api = backendFor(request);
    void (async () => {
      try {
        const result = await api[method as SteamMethod]();
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
