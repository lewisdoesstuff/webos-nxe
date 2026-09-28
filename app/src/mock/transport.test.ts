import { describe, expect, it } from "vitest";

import { sampleLaunchPoints } from "./launchPoints";
import { mockTransport } from "./transport";

/**
 * The mock is keyed on the exact URI the app calls. A typo'd key is invisible
 * until the UI is opened in a browser, and then only as a MOCK_MISS error — so
 * pin the real URIs here.
 */
describe("mock transport", () => {
  it("answers listLaunchPoints", async () => {
    const result = await mockTransport.request(
      "luna://com.webos.applicationManager/listLaunchPoints",
      {},
    );

    expect(result["returnValue"]).toBe(true);
    expect(result["launchPoints"]).toBe(sampleLaunchPoints);
  });

  it("answers launch", async () => {
    await expect(
      mockTransport.request("luna://com.webos.applicationManager/launch", { id: "netflix" }),
    ).resolves.toMatchObject({ returnValue: true, appId: "netflix" });
  });

  it("fails loudly on an unmapped uri rather than returning undefined", async () => {
    await expect(
      mockTransport.request("luna://com.webos.applicationManager/getForegroundAppInfo", {}),
    ).rejects.toThrow(/MOCK_MISS/);
  });

  it("?mockError= simulates the TV's real ACL denial, so the hint path is previewable", async () => {
    window.history.replaceState(null, "", "/?mockError=listLaunchPoints");
    try {
      await expect(
        mockTransport.request("luna://com.webos.applicationManager/listLaunchPoints", {}),
      ).rejects.toThrow(/noPermissions/);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
