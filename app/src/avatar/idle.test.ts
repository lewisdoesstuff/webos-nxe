import { describe, expect, it } from "vitest";

import { firstIdle, nextIdle, planIdle, REST_LOOPS_MAX, REST_LOOPS_MIN } from "./idle";

const EXPORT = ["GenericStand5", "IdleLooksAround", "GenericWave", "IdleShiftsWeight"];

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe("planIdle", () => {
  it("rests on GenericStand5 and idles on the rest", () => {
    expect(planIdle(EXPORT)).toEqual({
      rest: "GenericStand5",
      idles: ["IdleLooksAround", "IdleShiftsWeight", "GenericWave"],
    });
  });

  it("matches the console's keys inside longer names", () => {
    const plan = planIdle(["anim_GenericStand5_m", "anim_GenericWave_m"]);
    expect(plan).toEqual({ rest: "anim_GenericStand5_m", idles: ["anim_GenericWave_m"] });
  });

  it("falls back to the first clip and the others when nothing is known", () => {
    expect(planIdle(["a", "b", "c"])).toEqual({ rest: "a", idles: ["b", "c"] });
  });

  it("has no plan without clips", () => {
    expect(planIdle([])).toBeNull();
  });

  it("never idles on the rest loop", () => {
    expect(planIdle(["GenericStand6"])).toEqual({ rest: "GenericStand6", idles: [] });
  });
});

describe("nextIdle", () => {
  const plan = planIdle(EXPORT)!;

  it("starts resting within the loop bounds", () => {
    for (const r of [0, 0.5, 0.999]) {
      const step = firstIdle(plan, () => r);
      expect(step.clip).toBe("GenericStand5");
      expect(step.restsLeft).toBeGreaterThanOrEqual(REST_LOOPS_MIN);
      expect(step.restsLeft).toBeLessThanOrEqual(REST_LOOPS_MAX);
    }
  });

  it("counts rests down, then plays one idle, then rests again", () => {
    const random = sequence([0]);
    let step = { clip: plan.rest, restsLeft: 2 };
    step = nextIdle(plan, step, random);
    expect(step).toEqual({ clip: "GenericStand5", restsLeft: 1 });
    step = nextIdle(plan, step, random);
    expect(step).toEqual({ clip: "IdleLooksAround", restsLeft: 0 });
    step = nextIdle(plan, step, random);
    expect(step.clip).toBe("GenericStand5");
    expect(step.restsLeft).toBe(REST_LOOPS_MIN);
  });

  it("does not repeat the last idle", () => {
    const step = nextIdle(plan, { clip: plan.rest, restsLeft: 1 }, () => 0, "IdleLooksAround");
    expect(step.clip).toBe("IdleShiftsWeight");
  });

  it("only rests when there is nothing else", () => {
    const lone = planIdle(["GenericStand5"])!;
    expect(nextIdle(lone, { clip: lone.rest, restsLeft: 1 }, () => 0).clip).toBe("GenericStand5");
  });
});
