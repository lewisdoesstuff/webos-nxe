import { LunaCallError, type LunaParams, type LunaPayload, type LunaTransport } from "../luna";
import { sampleLaunchPoints } from "./launchPoints";

/**
 * Dev-only transport: answers the handful of calls the UI makes, with a little
 * latency so loading states are actually visible. Loaded by dynamic import, so
 * it never reaches the bundle the TV runs (see `main.ts`).
 *
 * Append `?mockError=listLaunchPoints` to the dev URL to exercise the error
 * path — which is what an ungranted app sees on real hardware (PLAN §2).
 */

const LATENCY_MS = 150;

/** A believable subset: enough inputs to exercise discovery, and no more. */
const INPUT_TITLES: Record<string, string> = {
  "com.webos.app.livetv": "Live TV",
  "com.webos.app.hdmi1": "HDMI 1",
  "com.webos.app.hdmi2": "HDMI 2",
};

const NOT_FOUND = { returnValue: false, errorCode: "notFound", errorText: "no such app" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const handlers: Record<string, (params: LunaParams) => unknown> = {
  // Keys are the URI path exactly as `callLuna` receives it, minus `luna://`.
  "com.webos.applicationManager/listLaunchPoints": (_params) => ({
    returnValue: true,
    launchPoints: sampleLaunchPoints,
  }),
  "com.webos.applicationManager/getAppInfo": (params) => {
    const id = String(params["id"] ?? "");
    const title = INPUT_TITLES[id];
    return title ? { returnValue: true, id, title } : NOT_FOUND;
  },
  // `?serial=` previews another set's floor rings.
  "com.webos.service.tv.systemproperty/getSystemInfo": (_params) => ({
    returnValue: true,
    serialNumber:
      (typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("serial")) ?? "MOCK00XNE2008",
  }),
  "com.webos.applicationManager/launch": (params) => ({
    returnValue: true,
    appId: params["id"],
    params: params["params"] ?? {},
  }),
};

function shouldFail(uri: string): boolean {
  if (typeof window === "undefined") return false;
  const forced = new URLSearchParams(window.location.search).get("mockError");
  return forced !== null && uri.includes(forced);
}

export const mockTransport: LunaTransport = {
  async request(uri, params): Promise<LunaPayload> {
    const key = uri.replace(/^luna:\/\//, "");
    const handler = handlers[key];

    if (!handler) {
      throw new LunaCallError(uri, "MOCK_MISS", "no mock handler for this uri");
    }
    if (shouldFail(uri)) {
      // Deliberately shaped like the real denial an ungranted app gets on the
      // TV (PLAN §2), so the dev switch previews the ACL path — hint and all.
      throw new LunaCallError(uri, "noPermissions", "forced failure for dev");
    }

    const result = handler(params);
    await sleep(LATENCY_MS);
    return result as LunaPayload;
  },
};
