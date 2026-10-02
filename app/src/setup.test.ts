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

const none: SetupState = {
  homeArmed: null,
  bootHook: null,
  launchHook: null,
  nxeInstalled: false,
  nxeChosen: false,
  steamSignedIn: false,
};

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

  it("arms only after the confirm, and cancelling moves on", () => {
    expect(setupAction("setup:home", "confirm")).toEqual({ kind: "confirm" });
    expect(setupAction("setup:home", "arm")).toBeNull();
    expect(setupAction("setup:home-confirm", "arm")).toEqual({ kind: "arm" });
    expect(setupAction("setup:home-confirm", "skip")).toEqual({ kind: "next" });
    expect(nextSetupId("setup:home-confirm")).toBe("setup:launch");
  });

  it("skips the offer when the Home key is already ours", () => {
    const ids = (homeArmed: boolean | null) =>
      setupPage("home", { ...none, homeArmed, bootHook: true }).options.map((option) => option.id);
    expect(ids(true)).toEqual(["next"]);
    expect(ids(false)).toEqual(["confirm", "skip"]);
    expect(setupPage("home", { ...none, homeArmed: true }).options.map((o) => o.id)).toEqual([
      "boot",
      "skip",
    ]);
    expect(setupAction("setup:home", "boot")).toEqual({ kind: "boot" });
    expect(ids(null)).toEqual(["confirm", "skip"]);
  });

  it("offers open at boot until it is linked", () => {
    expect(setupPage("launch", none).options.map((o) => o.id)).toEqual(["launch", "skip"]);
    expect(setupPage("launch", { ...none, launchHook: true }).options.map((o) => o.id)).toEqual([
      "next",
    ]);
    expect(setupAction("setup:launch", "launch")).toEqual({ kind: "launch" });
    expect(nextSetupId("setup:launch")).toBe("setup:theme");
  });

  it("gives every page a back option it has and a body", () => {
    for (const step of [...SETUP_STEPS, "home-confirm" as const]) {
      for (const state of [
        none,
        {
          homeArmed: true,
          bootHook: true,
          launchHook: true,
          nxeInstalled: true,
          nxeChosen: true,
          steamSignedIn: true,
        },
      ]) {
        const page = setupPage(step, state);
        expect(page.options.some((option) => option.id === page.back)).toBe(true);
        expect(setupBody(step, state)).not.toBe("");
      }
    }
  });
});
