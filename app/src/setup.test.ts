import { describe, expect, it } from "vitest";

import {
  nextSetupId,
  setupAction,
  setupBody,
  setupPage,
  SETUP_ROOT,
  SETUP_STEPS,
  type SetupState,
} from "./setup";

const labels = (state: SetupState) => setupPage("theme", state).options.map((option) => option.id);

const none: SetupState = { nxeInstalled: false, nxeChosen: false, steamSignedIn: false };

describe("setup", () => {
  it("walks the steps in order and ends after the last", () => {
    let id: string | null = SETUP_ROOT;
    const seen: string[] = [];
    while (id !== null) {
      seen.push(id);
      id = nextSetupId(id);
    }
    expect(seen).toEqual(SETUP_STEPS.map((step) => `setup:${step}`));
  });

  it("offers the theme only when it is installed and not yet chosen", () => {
    expect(labels(none)).toEqual(["next"]);
    expect(labels({ ...none, nxeInstalled: true })).toEqual(["use", "skip"]);
    expect(labels({ ...none, nxeInstalled: true, nxeChosen: true })).toEqual(["next"]);
  });

  it("picks the theme, and finishes on the last step", () => {
    expect(setupAction("setup:theme", "use")).toEqual({ kind: "theme", id: "nxe" });
    expect(setupAction("setup:avatar", "customize")).toEqual({ kind: "avatar" });
    expect(setupAction("setup:steam", "signin")).toEqual({ kind: "steam" });
    expect(setupAction("setup:steam", "skip")).toEqual({ kind: "done" });
    expect(setupAction("setup:home", "next")).toEqual({ kind: "next" });
    expect(setupAction("setup:home", "use")).toBeNull();
  });

  it("gives every page a back option it has and a body", () => {
    for (const step of SETUP_STEPS) {
      for (const state of [none, { nxeInstalled: true, nxeChosen: true, steamSignedIn: true }]) {
        const page = setupPage(step, state);
        expect(page.options.some((option) => option.id === page.back)).toBe(true);
        expect(setupBody(step, state)).not.toBe("");
      }
    }
  });
});
