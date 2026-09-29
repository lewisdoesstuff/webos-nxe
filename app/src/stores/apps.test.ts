import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setTransport, LunaCallError, type LunaPayload, type LunaTransport } from "../luna";
import { useAppsStore } from "./apps";

const LAUNCH = "luna://com.webos.applicationManager/launch";

function transportReturning(payload: LunaPayload) {
  const request = vi.fn(async () => payload);
  setTransport({ request } satisfies LunaTransport);
  return request;
}

/** Throws what the real transport throws, so the store's hints are exercised. */
function transportFailing(code: string) {
  const request = vi.fn(async () => {
    throw new LunaCallError("luna://com.webos.applicationManager/listLaunchPoints", code, "denied");
  });
  setTransport({ request } satisfies LunaTransport);
  return request;
}

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
});

describe("apps store", () => {
  it("draws the last list Luna gave before Luna answers, and replaces it with the answer", async () => {
    transportReturning({ returnValue: true, launchPoints: [{ id: "a", title: "Apple" }] });
    await useAppsStore().load();

    setActivePinia(createPinia());
    let answer = (_payload: LunaPayload) => {};
    setTransport({
      request: (uri: string) =>
        uri.endsWith("listLaunchPoints")
          ? new Promise<LunaPayload>((resolve) => (answer = resolve))
          : Promise.resolve({ returnValue: true }),
    });
    const apps = useAppsStore();
    const loading = apps.load();

    expect(apps.status).toBe("ready");
    expect(apps.launchPoints.map((point) => point.id)).toEqual(["a"]);

    answer({ returnValue: true, launchPoints: [{ id: "b", title: "Banana" }] });
    await loading;
    expect(apps.launchPoints.map((point) => point.id)).toEqual(["b"]);
  });

  it("keeps the last list when Luna refuses", async () => {
    transportReturning({ returnValue: true, launchPoints: [{ id: "a", title: "Apple" }] });
    await useAppsStore().load();

    setActivePinia(createPinia());
    transportFailing("-1");
    const apps = useAppsStore();
    await apps.load();

    expect(apps.status).toBe("ready");
    expect(apps.error).not.toBeNull();
    expect(apps.launchPoints.map((point) => point.id)).toEqual(["a"]);
  });

  it("keeps the device's order, which is the order the stock home shows", async () => {
    transportReturning({
      returnValue: true,
      launchPoints: [
        { id: "z", title: "Zebra", visible: true },
        { id: "a", title: "Apple", visible: true },
      ],
    });
    const apps = useAppsStore();

    await apps.load();

    expect(apps.status).toBe("ready");
    expect(apps.error).toBeNull();
    // Not alphabetical: the QML home inherited the device's order, and custom
    // ordering is the user's appOrder.
    expect(apps.visibleLaunchPoints.map((point) => point.title)).toEqual(["Zebra", "Apple"]);
  });

  it("hides entries marked not visible", async () => {
    transportReturning({
      returnValue: true,
      launchPoints: [
        { id: "a", title: "Shown", visible: true },
        { id: "b", title: "Hidden", visible: false },
      ],
    });
    const apps = useAppsStore();

    await apps.load();

    expect(apps.visibleLaunchPoints.map((point) => point.id)).toEqual(["a"]);
  });

  it("tolerates a payload with no launchPoints", async () => {
    transportReturning({ returnValue: true });
    const apps = useAppsStore();

    await apps.load();

    expect(apps.status).toBe("ready");
    expect(apps.launchPoints).toEqual([]);
  });

  it("surfaces a failed load with the ACL hint, since that is what the TV does before the grant", async () => {
    transportFailing("noPermissions");
    const apps = useAppsStore();

    await apps.load();

    expect(apps.status).toBe("error");
    expect(apps.error).toMatch(/homectl grant/);
  });

  it("launches by id with empty params", async () => {
    const request = transportReturning({ returnValue: true });
    const apps = useAppsStore();

    await apps.launch("netflix");

    expect(request).toHaveBeenCalledWith(LAUNCH, { id: "netflix", params: {} });
  });

  it("surfaces a failed launch without clearing the grid", async () => {
    transportFailing("notAllowed");
    const apps = useAppsStore();

    await apps.launch("netflix");

    expect(apps.error).not.toBeNull();
  });
});
