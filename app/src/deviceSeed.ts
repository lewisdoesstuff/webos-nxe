import { callLuna } from "./luna";
import { FALLBACK_SEED } from "./ripples";

/**
 * Something unique to this TV, read once before the app mounts. Only its hash
 * is ever used; it is never stored or shown.
 */

const SYSTEM_INFO = "luna://com.webos.service.tv.systemproperty/getSystemInfo";
const WAIT_MS = 400;

let seed = FALLBACK_SEED;

export function deviceSeed(): string {
  return seed;
}

export async function loadDeviceSeed(): Promise<void> {
  const reply = callLuna<{ serialNumber?: unknown }>(SYSTEM_INFO, { keys: ["serialNumber"] });
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
  try {
    const info = await Promise.race([reply, late]);
    const serial = info?.serialNumber;
    if (typeof serial === "string" && serial !== "") seed = serial;
  } catch {
    seed = FALLBACK_SEED;
  }
}
