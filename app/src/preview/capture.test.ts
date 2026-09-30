import { describe, expect, it, vi } from "vitest";

import { LunaCallError } from "../luna";
import {
  ATTEMPTS,
  MIN_FRAME_BYTES,
  SETTLE_MAX_CALLS,
  SETTLE_MS,
  captureStill,
  type CaptureOptions,
  type LunaCaller,
} from "./capture";

const APP = "com.webos.app.hdmi2";
const CAPTURE_URI = "luna://com.webos.service.capture/executeOneShot";
const FOREGROUND_URI = "luna://com.webos.applicationManager/getForegroundAppInfo";

/** A frame of a real source, and a frame of the input's own info card. Sizes
 *  measured on this TV; the two sets do not overlap. */
const A_PICTURE = 42_871;
const AN_INFO_CARD = 3_849;

function optionsFor(call: LunaCaller, over: Partial<CaptureOptions> = {}): CaptureOptions {
  return { call, settleMs: 60_000, maxCalls: 1, ...over };
}

/** Answers the settle with `foreground` and the shutter with `bytes`. */
function harness(foreground: string, bytes = A_PICTURE): LunaCaller {
  return vi.fn(async (uri: string) => {
    if (uri === FOREGROUND_URI) {
      return { returnValue: true, appId: foreground, processId: "", windowId: "" };
    }
    return { returnValue: true, writtenBytes: bytes };
  }) as unknown as LunaCaller;
}

/** A caller that always fails the way an ungranted app is failed. */
function denying(message: string): LunaCaller {
  return vi.fn(async (uri: string) => {
    if (uri === FOREGROUND_URI) return { returnValue: true, appId: APP };
    throw new LunaCallError(uri, "-1", message);
  }) as unknown as LunaCaller;
}

function callsOf(call: LunaCaller): unknown[][] {
  return (call as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

function urisOf(call: LunaCaller): string[] {
  return callsOf(call).map(([uri]) => String(uri));
}

function shotsOf(call: LunaCaller): string[] {
  return callsOf(call)
    .filter(([uri]) => uri === CAPTURE_URI)
    .map(([, params]) => String((params as Record<string, unknown> | undefined)?.["path"]));
}

describe("captureStill", () => {
  it("settles before the shutter, because a backgrounded page runs no timers", async () => {
    const call = harness(APP);

    await captureStill(APP, "a", optionsFor(call, { maxCalls: 5 }));

    const uris = urisOf(call);
    expect(uris.filter((uri) => uri === FOREGROUND_URI)).toHaveLength(5);
    expect(uris.at(-1)).toBe(CAPTURE_URI);
  });

  it("asks for the panel as a 480x270 jpeg, the only combination measured to return a picture of an input", async () => {
    const call = harness(APP);

    await captureStill(APP, "a", optionsFor(call));

    expect(call).toHaveBeenCalledWith(CAPTURE_URI, {
      path: "/media/developer/apps/usr/palm/applications/ooo.lew.nxe/preview-com.webos.app.hdmi2-a.jpg",
      method: "screen",
      width: 480,
      height: 270,
      format: "jpeg",
    });
  });

  it("reports the byte count and the time of a frame that is a picture", async () => {
    const call = harness(APP);

    await expect(captureStill(APP, "a", optionsFor(call, { now: () => 1700 }))).resolves.toEqual({
      ok: true,
      bytes: A_PICTURE,
      at: 1700,
    });
  });

  it("refuses the input's own info card and tries again, because a capture that worked is not a capture that is a picture", async () => {
    const call = harness(APP, AN_INFO_CARD);

    const outcome = await captureStill(APP, "a", optionsFor(call, { attempts: 3 }));

    expect(outcome).toEqual({ ok: false, reason: "blank" });
    // Three attempts, so three settles and three shutters.
    expect(urisOf(call).filter((uri) => uri === CAPTURE_URI)).toHaveLength(3);
  });

  it("stops at the first frame that is a picture", async () => {
    const call = vi.fn(async (uri: string) => {
      if (uri === FOREGROUND_URI) return { returnValue: true, appId: APP };
      const shots = call.mock.calls.filter(([seen]) => seen === CAPTURE_URI).length;
      return { returnValue: true, writtenBytes: shots === 1 ? AN_INFO_CARD : A_PICTURE };
    }) as unknown as LunaCaller & { mock: { calls: unknown[][] } };

    const outcome = await captureStill(APP, "a", optionsFor(call, { attempts: 5 }));

    expect(outcome.ok).toBe(true);
    expect(urisOf(call).filter((uri) => uri === CAPTURE_URI)).toHaveLength(2);
  });

  it("puts the size line between the two measured groups, with room on both sides", () => {
    expect(MIN_FRAME_BYTES).toBeGreaterThan(AN_INFO_CARD);
    expect(MIN_FRAME_BYTES).toBeLessThan(22_968);
  });

  it("takes nothing when the launcher is the thing on the panel, rather than photographing Blades", async () => {
    const call = harness("ooo.lew.nxe");

    await expect(captureStill(APP, "a", optionsFor(call, { maxCalls: 3 }))).resolves.toEqual({
      ok: false,
      reason: "not-foreground",
    });
    expect(urisOf(call)).not.toContain(CAPTURE_URI);
  });

  it("calls a capture that wrote nothing a different thing to one that wrote a black frame", async () => {
    const empty = harness(APP, 0);
    await expect(captureStill(APP, "a", optionsFor(empty, { attempts: 1 }))).resolves.toEqual({
      ok: false,
      reason: "no-bytes",
    });

    const noSize = vi.fn(async (uri: string) => {
      if (uri === FOREGROUND_URI) return { returnValue: true, appId: APP };
      return { returnValue: true };
    }) as unknown as LunaCaller;
    await expect(captureStill(APP, "a", optionsFor(noSize, { attempts: 1 }))).resolves.toEqual({
      ok: false,
      reason: "no-bytes",
    });
  });

  it("says denied when the ACL grant is missing, which is what an ungranted app gets, and does not keep retrying", async () => {
    const call = denying('Denied method call "executeOneShot" for category "/"');

    await expect(captureStill(APP, "a", optionsFor(call, { attempts: 3 }))).resolves.toEqual({
      ok: false,
      reason: "denied",
    });
    expect(urisOf(call).filter((uri) => uri === CAPTURE_URI)).toHaveLength(1);
  });

  it("reports any other failure as a failure rather than throwing at the caller", async () => {
    const call = denying("REFUSED_NO_SIGNAL");

    await expect(captureStill(APP, "a", optionsFor(call))).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("gives up on a settle when a round trip is refused, rather than spinning", async () => {
    let settles = 0;
    const call = vi.fn(async (uri: string) => {
      if (uri === FOREGROUND_URI) {
        settles += 1;
        if (settles > 2) throw new Error("hub went away");
        return { returnValue: true, appId: APP };
      }
      return { returnValue: true, writtenBytes: A_PICTURE };
    }) as unknown as LunaCaller;

    await expect(captureStill(APP, "a", optionsFor(call, { maxCalls: 500 }))).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(settles).toBe(3);
  });

  it("stops on elapsed time, spending only the one call that says whether the input is up", async () => {
    let settles = 0;
    const call = vi.fn(async (uri: string) => {
      if (uri === FOREGROUND_URI) {
        settles += 1;
        return { returnValue: true, appId: APP };
      }
      return { returnValue: true, writtenBytes: A_PICTURE };
    }) as unknown as LunaCaller;

    await captureStill(APP, "a", optionsFor(call, { settleMs: 0, maxCalls: SETTLE_MAX_CALLS }));

    expect(settles).toBe(1);
  });

  it("writes every attempt to the slot it was given, so the other still is untouched", async () => {
    const call = harness(APP, AN_INFO_CARD);

    await captureStill(APP, "b", optionsFor(call, { attempts: 2 }));

    expect(shotsOf(call)).toEqual([
      "/media/developer/apps/usr/palm/applications/ooo.lew.nxe/preview-com.webos.app.hdmi2-b.jpg",
      "/media/developer/apps/usr/palm/applications/ooo.lew.nxe/preview-com.webos.app.hdmi2-b.jpg",
    ]);
  });

  it("settles for six seconds and tries five times, both measured rather than guessed", () => {
    const MS_PER_CALL = 2.4;
    expect(SETTLE_MS).toBe(6000);
    expect(ATTEMPTS).toBe(5);
    // Enough headroom that the elapsed budget, not the ceiling, is what a real
    // settle spends: 6 s at 2.4 ms a call is about 2500 of the 6000 allowed.
    expect(SETTLE_MAX_CALLS).toBeGreaterThan((SETTLE_MS / MS_PER_CALL) * 1.5);
  });
});
