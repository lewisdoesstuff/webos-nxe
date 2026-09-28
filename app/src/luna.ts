import type { LunaFailure } from "./types";

/**
 * A typed, transport-agnostic Luna client (PLAN §4).
 *
 * The hot path on the TV is a direct `PalmServiceBridge` call from the page.
 * Desktop Chrome has no bridge, so the same call sites run against a mock
 * transport — that is what makes `bun run dev` the daily driver.
 */

export type LunaParams = Record<string, unknown>;
export type LunaPayload = Record<string, unknown>;

export interface LunaTransport {
  /** Parsed payload on success; rejects with `LunaCallError` on failure. */
  request(uri: string, params: LunaParams): Promise<LunaPayload>;
}

export class LunaCallError extends Error {
  readonly uri: string;
  readonly code: string;

  constructor(uri: string, code: string, text: string) {
    super(`Luna call failed: ${uri} [${code}]${text ? ` ${text}` : ""}`);
    this.name = "LunaCallError";
    this.uri = uri;
    this.code = code;
  }
}

function isLunaFailure(payload: unknown): payload is LunaFailure {
  if (typeof payload !== "object" || payload === null) return false;
  const failure = payload as LunaFailure;
  // Some services report the code as a string, some as a number, and some only
  // as `returnValue: false`, so all three are treated as a failure.
  if (failure.errorCode !== undefined && failure.errorCode !== null) return true;
  return failure.returnValue === false;
}

/**
 * The production transport. `PalmServiceBridge` is injected by WAM on the TV;
 * it takes a JSON string and reports both results and errors through the same
 * callback, so the failure has to be sniffed out of the payload.
 */
export function createPalmTransport(): LunaTransport {
  return {
    request(uri, params) {
      return new Promise((resolve, reject) => {
        const Bridge = window.PalmServiceBridge;
        if (typeof Bridge !== "function") {
          reject(new LunaCallError(uri, "NO_BRIDGE", "PalmServiceBridge is not available"));
          return;
        }

        const bridge = new Bridge();
        let settled = false;

        const onPayload = (raw: string): void => {
          if (settled) return;
          settled = true;
          // Drop the handler, so a subscription-shaped reply cannot re-enter.
          bridge.onservicecallback = null;

          let payload: unknown;
          try {
            payload = JSON.parse(raw);
          } catch {
            reject(new LunaCallError(uri, "BAD_JSON", `unparseable payload: ${raw.slice(0, 200)}`));
            return;
          }

          if (isLunaFailure(payload)) {
            const code = payload.errorCode === undefined ? "FAILED" : String(payload.errorCode);
            reject(new LunaCallError(uri, code, payload.errorText ?? ""));
            return;
          }
          if (typeof payload !== "object" || payload === null) {
            reject(
              new LunaCallError(uri, "BAD_PAYLOAD", `expected an object, got ${typeof payload}`),
            );
            return;
          }
          resolve(payload as LunaPayload);
        };

        // Measured on webOS 9.2.4: the reply arrives on `onservicecallback` and
        // the callback argument is ignored. Other builds use the 3-arg form, so
        // wire both and settle on whichever fires first.
        bridge.onservicecallback = onPayload;
        bridge.call(uri, JSON.stringify(params), onPayload);
      });
    },
  };
}

let active: LunaTransport | null = null;

/** Called once at boot, after the transport has been chosen. */
export function setTransport(transport: LunaTransport): void {
  active = transport;
}

export function callLuna<T extends object = LunaPayload>(
  uri: string,
  params: LunaParams = {},
): Promise<T> {
  if (!active) {
    return Promise.reject(new LunaCallError(uri, "NO_TRANSPORT", "no transport configured"));
  }
  return active.request(uri, params) as unknown as Promise<T>;
}
