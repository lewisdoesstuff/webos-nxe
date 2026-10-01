import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prepareArt, shownArt } from "./artCache";

describe("shownArt", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has nothing to show for no art", () => {
    expect(shownArt(null)).toBeNull();
  });

  it("shows the source until a scaled copy exists", () => {
    expect(shownArt("hack/usr/palm/applications/x/icon.png")).toBe(
      "hack/usr/palm/applications/x/icon.png",
    );
  });

  it("keeps the source when scaling cannot run", async () => {
    await prepareArt("hack/missing.png");
    expect(shownArt("hack/missing.png")).toBe("hack/missing.png");
  });
});
