import { homedir } from "node:os";
import { join } from "node:path";

import { EAuthTokenPlatformType, LoginSession } from "steam-session";

import type { SteamApi } from "../../app/src/steam/types.ts";
import { createSteamBackend, type QrSession } from "./core.ts";
import { httpsFetch } from "./fetch.ts";
import { fileTokenStore } from "./store.ts";

/** The live backend: steam-session over the network, the token in `dataDir`. */
export function createLiveBackend(dataDir = join(homedir(), ".nxe")): SteamApi {
  return createSteamBackend({
    newSession: () => new LoginSession(EAuthTokenPlatformType.MobileApp) as unknown as QrSession,
    store: fileTokenStore(join(dataDir, "steam-token")),
    fetch: typeof fetch === "function" ? fetch : httpsFetch,
  });
}
