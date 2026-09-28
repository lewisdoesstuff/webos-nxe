import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setTransport, LunaCallError, type LunaPayload, type LunaTransport } from "../luna";
import { useAppsStore } from "../stores/apps";
import { useSettingsStore } from "../stores/settings";
import { resetStills, stillAt } from "./stills";
import { usePreviewStore } from "./store";

const LAUNCH = "luna://com.webos.applicationManager/launch";
const FOREGROUND_URI = "luna://com.webos.applicationManager/getForegroundAppInfo";
const CAPTURE_URI = "luna://com.webos.service.capture/executeOneShot";
const HDMI = "com.webos.app.hdmi2";

/** A frame of a real source, and the input's own info card, by measured size. */
const A_PICTURE = 42_871;
const AN_INFO_CARD = 3_849;

interface Handlers {
  foreground?: string;
  bytes?: number;
}

/** Answers the boot calls, the settle, and the shutter. */
function transport({ foreground = HDMI, bytes = A_PICTURE }: Handlers = {}) {
  const request = vi.fn(
    async (uri: string, _params?: Record<string, unknown>): Promise<LunaPayload> => {
      if (uri === LAUNCH) return { returnValue: true };
      if (uri === FOREGROUND_URI) return { returnValue: true, appId: foreground };
      if (uri === CAPTURE_URI) return { returnValue: true, writtenBytes: bytes };
      if (uri.includes("listLaunchPoints")) return { returnValue: true, launchPoints: [] };
      if (uri.includes("getAppInfo")) return { returnValue: false, errorCode: "notFound" };
      if (uri.includes("listApps")) return { returnValue: true, apps: [] };
      throw new LunaCallError(uri, "MOCK_MISS", "no mock handler");
    },
  );
  setTransport({ request } satisfies LunaTransport);
  return request;
}

function urisOf(request: { mock: { calls: unknown[][] } }): string[] {
  return request.mock.calls.map(([uri]) => String(uri));
}

function shotsOf(request: { mock: { calls: unknown[][] } }): string[] {
  return request.mock.calls
    .filter(([uri]) => uri === CAPTURE_URI)
    .map(([, params]) => String((params as Record<string, unknown> | undefined)?.["path"]));
}

beforeEach(() => {
  setActivePinia(createPinia());
  resetStills();
  window.localStorage.clear();
});

describe("preview store", () => {
  it("remembers a capture that worked, with the slot the good frame is in", async () => {
    transport();
    const previews = usePreviewStore();

    await previews.capture(HDMI);

    expect(previews.lastOutcome).toEqual({
      ok: true,
      bytes: A_PICTURE,
      at: expect.any(Number),
    });
    expect(stillAt(HDMI)).toEqual({ at: expect.any(Number), slot: "a" });
  });

  it("photographs nothing when input previews are switched off", async () => {
    const request = transport();
    useSettingsStore().updateSetting("previews", false);
    const previews = usePreviewStore();

    const outcome = await previews.capture(HDMI);

    expect(outcome).toEqual({ ok: false, reason: "disabled" });
    expect(shotsOf(request)).toEqual([]);
    expect(stillAt(HDMI)).toBeUndefined();
    expect(previews.lastOutcome).toBeNull();
  });

  it("writes a later visit into the slot it is not showing, so a rejected attempt cannot land on the picture being drawn", async () => {
    transport();
    const previews = usePreviewStore();
    await previews.capture(HDMI);
    expect(stillAt(HDMI)?.slot).toBe("a");

    const request = transport();
    await previews.capture(HDMI);

    expect(shotsOf(request).every((path) => path.endsWith("-b.jpg"))).toBe(true);
    expect(stillAt(HDMI)?.slot).toBe("b");
  });

  it("leaves the last good still alone when a capture fails, because no signal is not the same as no picture", async () => {
    transport();
    const previews = usePreviewStore();
    await previews.capture(HDMI);
    const good = stillAt(HDMI);

    setTransport({
      request: vi.fn(async (uri: string) => {
        if (uri === FOREGROUND_URI) return { returnValue: true, appId: HDMI };
        throw new LunaCallError(uri, "11", "REFUSED_NO_SIGNAL");
      }),
    } satisfies LunaTransport);
    const second = await previews.capture(HDMI);

    expect(second).toEqual({ ok: false, reason: "failed" });
    expect(stillAt(HDMI)).toEqual(good);
  });

  it("leaves the last good still alone when the frame is the input's own info card, which is the case that would otherwise show a void", async () => {
    transport();
    const previews = usePreviewStore();
    await previews.capture(HDMI);
    const good = stillAt(HDMI);

    transport({ bytes: AN_INFO_CARD });
    const second = await previews.capture(HDMI);

    expect(second).toEqual({ ok: false, reason: "blank" });
    expect(stillAt(HDMI)).toEqual(good);
  });

  it("does not stack two captures behind one input", async () => {
    transport();
    const previews = usePreviewStore();

    const first = previews.capture(HDMI);
    const second = await previews.capture(HDMI);
    await first;

    expect(second.ok).toBe(false);
    expect(previews.inFlight[HDMI]).toBeUndefined();
  });

  it("clears the in flight mark after a failure, so a later visit can try again", async () => {
    transport({ foreground: "ooo.lew.xne" });
    const previews = usePreviewStore();

    await previews.capture(HDMI);

    expect(previews.lastOutcome).toEqual({ ok: false, reason: "not-foreground" });
    expect(previews.inFlight[HDMI]).toBeUndefined();
  });
});

describe("apps store launch", () => {
  it("photographs an input it has just launched", async () => {
    const request = transport();
    const apps = useAppsStore();

    await apps.launch(HDMI);
    await vi.waitFor(() => expect(urisOf(request)).toContain(CAPTURE_URI));

    expect(request).toHaveBeenCalledWith(LAUNCH, { id: HDMI, params: {} });
  });

  it("leaves an ordinary app alone, since there is nothing to photograph", async () => {
    const request = transport();
    const apps = useAppsStore();

    await apps.launch("netflix");
    await Promise.resolve();

    expect(urisOf(request)).not.toContain(CAPTURE_URI);
  });

  it("does not photograph anything when the launch itself failed", async () => {
    const request = vi.fn(async (uri: string) => {
      if (uri === LAUNCH) throw new LunaCallError(uri, "notAllowed", "denied");
      return { returnValue: true, appId: HDMI };
    });
    setTransport({ request } satisfies LunaTransport);
    const apps = useAppsStore();

    await apps.launch(HDMI);
    await Promise.resolve();

    expect(apps.error).not.toBeNull();
    expect(urisOf(request)).not.toContain(CAPTURE_URI);
  });
});
