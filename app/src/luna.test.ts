import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LunaCallError, callLuna, createPalmTransport, setTransport } from "./luna";

/**
 * Stands in for the WAM-injected bridge as measured on the TV: the reply is
 * delivered on `onservicecallback`, and `call` ignores any callback argument.
 * `respondLegacy` covers the documented 3-arg form other builds use.
 */
class FakeBridge {
  static instances: FakeBridge[] = [];

  constructor() {
    FakeBridge.instances.push(this);
  }

  callArgs: { uri: string; params: string } | null = null;
  onservicecallback: ((raw: string) => void) | null = null;
  private legacyCallback: ((raw: string) => void) | null = null;

  call(uri: string, params: string, onResponse?: (raw: string) => void): void {
    this.callArgs = { uri, params };
    this.legacyCallback = onResponse ?? null;
  }

  cancel(): void {
    this.onservicecallback = null;
    this.legacyCallback = null;
  }

  /** How webOS 9.2.4 actually responds. */
  respond(payload: unknown): void {
    this.onservicecallback?.(JSON.stringify(payload));
  }

  /** Deliver a raw string, so a genuinely unparseable payload can be tested. */
  respondRaw(raw: string): void {
    this.onservicecallback?.(raw);
  }

  /** How builds using the documented 3-arg form respond. */
  respondLegacy(payload: unknown): void {
    this.legacyCallback?.(JSON.stringify(payload));
  }
}

function installBridge(): void {
  window.PalmServiceBridge = FakeBridge as unknown as NonNullable<Window["PalmServiceBridge"]>;
}

function lastBridge(): FakeBridge {
  const bridge = FakeBridge.instances.at(-1);
  if (!bridge) throw new Error("no bridge was constructed");
  return bridge;
}

beforeEach(() => {
  FakeBridge.instances = [];
  installBridge();
});

afterEach(() => {
  delete window.PalmServiceBridge;
});

describe("createPalmTransport", () => {
  it("delivers via onservicecallback, which is how the TV actually responds", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", { a: 1 });

    expect(lastBridge().callArgs).toEqual({ uri: "luna://x/y", params: '{"a":1}' });

    lastBridge().respond({ returnValue: true });
    await expect(pending).resolves.toEqual({ returnValue: true });
  });

  it("also settles via the 3-arg callback, for builds that use the documented shape", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", {});

    lastBridge().respondLegacy({ returnValue: true, legacy: true });

    await expect(pending).resolves.toEqual({ returnValue: true, legacy: true });
  });

  it("settles once even though both response channels are wired", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", {});

    lastBridge().respond({ order: "first" });
    lastBridge().respondLegacy({ order: "second" });

    await expect(pending).resolves.toEqual({ order: "first" });
  });

  it("rejects when the payload carries an errorCode, since Luna reports errors in-band", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", {});

    lastBridge().respond({ errorCode: "noPermissions", errorText: "denied" });

    await expect(pending).rejects.toBeInstanceOf(LunaCallError);
    await expect(pending).rejects.toThrow(/\[noPermissions\] denied/);
  });

  it("rejects on an unparseable payload", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", {});

    lastBridge().respondRaw("not json at all");

    await expect(pending).rejects.toThrow(/BAD_JSON/);
  });

  it("rejects when the code comes back as a number", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", {});

    lastBridge().respond({ returnValue: false, errorCode: -1, errorText: "Denied method call" });

    await expect(pending).rejects.toBeInstanceOf(LunaCallError);
    await expect(pending).rejects.toThrow(/\[-1\] Denied method call/);
  });

  it("rejects on returnValue false with no code at all", async () => {
    const transport = createPalmTransport();
    const pending = transport.request("luna://x/y", {});

    lastBridge().respond({ returnValue: false });

    await expect(pending).rejects.toThrow(/\[FAILED\]/);
  });

  it("rejects when no bridge is present, rather than hanging", async () => {
    delete window.PalmServiceBridge;

    await expect(createPalmTransport().request("luna://x/y", {})).rejects.toThrow(/NO_BRIDGE/);
  });
});

describe("callLuna", () => {
  it("routes through the active transport", async () => {
    const request = vi.fn(async () => ({ returnValue: true }));
    setTransport({ request });

    await expect(callLuna("luna://x/y", {})).resolves.toEqual({ returnValue: true });
    expect(request).toHaveBeenCalledWith("luna://x/y", {});
  });
});
