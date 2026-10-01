import { homedir } from "node:os";
import { join } from "node:path";

import { EAuthTokenPlatformType, LoginSession } from "steam-session";

import type { SteamApi } from "../../app/src/steam/types.ts";
import { createSteamBackend, type QrSession } from "./core.ts";
import { httpsFetch } from "./fetch.ts";
import { fileTokenStore } from "./store.ts";

/**
 * A QR login is a web login, so it is made as one: the browser platform with a
 * browser's own User-Agent. The mobile platform reports one fixed phone for every
 * user, and a QR code cannot sign in a phone app, which Steam treats as suspect.
 */
const BROWSER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

/** The live backend: steam-session over the network, the token in `dataDir`. */
export function createLiveBackend(dataDir = join(homedir(), ".nxe")): SteamApi {
  return createSteamBackend({
    newSession: () =>
      new LoginSession(EAuthTokenPlatformType.WebBrowser, {
        userAgent: BROWSER_AGENT,
      }) as unknown as QrSession,
    store: fileTokenStore(join(dataDir, "steam-token")),
    fetch: typeof fetch === "function" ? fetch : httpsFetch,
  });
}
