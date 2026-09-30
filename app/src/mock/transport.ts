import { LunaCallError, type LunaParams, type LunaPayload, type LunaTransport } from "../luna";
import { TV_GEN_PAGES } from "../tvKeys.generated";
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

const tvSettings: Record<string, string | number> = {
  "sound.soundOutput": "external_arc",
  "picture.pictureMode": "expert2",
};

/** A believable value for any generated key: kinds cycle so every control shows up. */
function seed(): void {
  let n = 0;
  for (const page of TV_GEN_PAGES) {
    for (const [category, key, kind] of page.keys) {
      const id = `${category}.${key}`;
      if (tvSettings[id] !== undefined) continue;
      n += 1;
      tvSettings[id] =
        kind === "b" ? (n % 2 === 0 ? "on" : "off") : kind === "r" ? (n * 7) % 100 : "mid";
    }
  }
}
seed();

const MOCK_KINDS = new Map<string, string>();
for (const page of TV_GEN_PAGES) {
  for (const [category, key, kind] of page.keys) MOCK_KINDS.set(`${category}.${key}`, kind);
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
    modelName: "OLED65G45LW.DEKQLJP",
    firmwareVersion: "23.23.30",
    serialNumber:
      (typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("serial")) ?? "MOCK00XNE2008",
  }),
  "com.webos.settingsservice/getSystemSettings": (params) => {
    const category = String(params["category"] ?? "");
    const keys = Array.isArray(params["keys"]) ? (params["keys"] as string[]) : [];
    const settings: Record<string, string | number> = {};
    for (const key of keys) {
      const value = tvSettings[`${category}.${key}`];
      if (value !== undefined) settings[key] = value;
    }
    return { returnValue: true, category, settings };
  },
  "com.webos.settingsservice/getSystemSettingValues": (params) => {
    const id = `${String(params["category"])}.${String(params["key"])}`;
    const list = MOCK_KINDS.get(id) === "e" ? ["low", "mid", "high", "expert1", "expert2"] : [];
    return {
      returnValue: true,
      vtype: "ArrayExt",
      values: {
        arrayExt: list.map((value, index) => ({ value, visible: index !== 3, active: true })),
      },
    };
  },
  "com.webos.settingsservice/getSystemSettingDesc": (params) => {
    const category = String(params["category"] ?? "");
    const keys = Array.isArray(params["keys"]) ? (params["keys"] as string[]) : [];
    return {
      returnValue: true,
      results: keys.map((key) => ({
        key,
        category,
        vtype: "Range",
        values: { range: { min: 0, max: 100, interval: 1 } },
      })),
    };
  },
  "com.webos.settingsservice/setSystemSettings": (params) => {
    const category = String(params["category"] ?? "");
    const settings = (params["settings"] ?? {}) as Record<string, string | number>;
    for (const [key, value] of Object.entries(settings)) tvSettings[`${category}.${key}`] = value;
    return { returnValue: true };
  },
  "com.webos.service.eim/getAllInputStatus": (_params) => ({
    returnValue: true,
    devices: [
      { port: 1, label: "HDMI 1", connected: false, hdmiSignalExist: false },
      { port: 2, label: "AVR-S760H", connected: true, hdmiSignalExist: false },
      { port: 3, label: "Switch", connected: true, hdmiSignalExist: true },
      { port: 4, label: "HDMI 4", connected: false, hdmiSignalExist: false },
    ],
  }),
  "com.webos.audio/getVolume": (_params) => ({ returnValue: true, volume: 9, muteStatus: false }),
  "com.webos.service.connectionmanager/getStatus": (_params) => ({
    returnValue: true,
    wifi: { state: "connected", ssid: "Mock Wi-Fi", ipAddress: "192.168.1.37" },
    wired: { state: "disconnected" },
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
