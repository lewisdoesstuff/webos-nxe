import { describe, expect, it } from "vitest";

import { isInputAppId, otherSlot, previewFileName, previewPath, previewUrl } from "./inputs";

describe("isInputAppId", () => {
  it("takes the tuner and the HDMI inputs", () => {
    expect(isInputAppId("com.webos.app.livetv")).toBe(true);
    expect(isInputAppId("com.webos.app.hdmi1")).toBe(true);
    expect(isInputAppId("com.webos.app.hdmi4")).toBe(true);
  });

  it("is not fooled by case", () => {
    expect(isInputAppId("com.webos.app.HDMI2")).toBe(true);
    expect(isInputAppId("com.webos.app.LiveTV")).toBe(true);
  });

  it("leaves installed apps alone, including ones with hdmi in the name", () => {
    expect(isInputAppId("netflix")).toBe(false);
    expect(isInputAppId("org.example.hdmi-manager")).toBe(false);
    expect(isInputAppId("com.example.hdmi2")).toBe(false);
    expect(isInputAppId("")).toBe(false);
  });

  it("matches the same prefix test the options panel uses, so a row and its options agree on what an input is", () => {
    // A prefix, not an exact id, because the tuner and the four HDMI apps are
    // one app with a different number.
    expect(isInputAppId("com.webos.app.hdmi")).toBe(true);
    expect(isInputAppId("com.webos.app.hdmi10")).toBe(true);
  });
});

describe("slots", () => {
  it("has exactly two, so a rejected attempt has somewhere to go that is not the picture being shown", () => {
    expect(otherSlot("a")).toBe("b");
    expect(otherSlot("b")).toBe("a");
  });
});

describe("preview paths", () => {
  it("names the file after the app id and the slot, inside our own origin", () => {
    expect(previewFileName("com.webos.app.hdmi2", "a")).toBe("preview-com.webos.app.hdmi2-a.jpg");
    // The capture service runs as root and the app directory is world writable,
    // so the only place we can both write and read a still is our own directory.
    expect(previewPath("com.webos.app.hdmi2", "b")).toBe(
      "/media/developer/apps/usr/palm/applications/ooo.lew.nxe/preview-com.webos.app.hdmi2-b.jpg",
    );
  });

  it("gives two slots different files, which is the point of having two", () => {
    expect(previewFileName("com.webos.app.hdmi2", "a")).not.toBe(
      previewFileName("com.webos.app.hdmi2", "b"),
    );
  });

  it("carries the capture time, because Chromium will not re-read a file url", () => {
    expect(previewUrl("com.webos.app.hdmi2", "a", 1700000000000)).toBe(
      "./preview-com.webos.app.hdmi2-a.jpg?v=1700000000000",
    );
  });
});
