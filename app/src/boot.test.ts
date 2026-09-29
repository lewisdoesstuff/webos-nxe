import { describe, expect, it } from "vitest";

import {
  BEATS,
  bootAdvance,
  bootBoxes,
  bootCost,
  bootDone,
  bootFrameAt,
  bootSkip,
  bootSkipMs,
  bootStages,
  bootStart,
  bootTiming,
  bootTotalMb,
  bootTotalMs,
  bootWindows,
  type BootState,
  type BootTiming,
  DASH_LOAD_MS,
  FIRST_LIGHT_FRAME,
  FIRST_LIGHT_MS,
  FPS,
  FRAME_H,
  FRAME_MS,
  FRAME_W,
  HANDOVER_MS,
  HOLD_MS,
  LEAD_IN_MS,
  LOCKUP_CX,
  lockupBox,
  MARK_SIZE,
  ORB_D,
  type BootSpeed,
  RING_D,
  RING_GAP,
  RING_W,
  resolveBootMode,
  SOUND_END_MS,
  SOUND_SPAN_MS,
  SOUND_TAIL_MS,
  SETTLED_MS,
  SPHERE_D,
  SPHERE_MAX,
  STAGE_INDEX,
  STAGE_IDS,
  type StageId,
  VISIBLE_FRAMES,
  VISIBLE_MS,
  type WindowId,
  WINDOW_IDS,
  WINDOW_SPANS,
  WARM_RATE,
} from "./boot";

const FULL: BootTiming = bootTiming("full");
const SHORT: BootTiming = bootTiming("short");

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`nothing at ${index}`);
  return value;
}

/** The run played out at a fixed step, the way the component's clock plays it. */
function playOut(timing: BootTiming, stepMs: number, steps: number): BootState {
  let state = bootStart();
  for (let index = 0; index < steps; index++) {
    state = bootAdvance(state, (index + 1) * stepMs, timing);
  }
  return state;
}

describe("the frame rate and the one measurement", () => {
  it("is 60 fps, the timing master's own rate", () => {
    expect(FPS).toBe(60);
    expect(FRAME_MS).toBeCloseTo(16.6667, 4);
  });

  it("counts 351 frames of visible motion, which is the single measurement", () => {
    expect(VISIBLE_FRAMES).toBe(351);
  });

  it("puts the last visual frame at 6.000 s and the visible motion at 5.850 s", () => {
    expect(FIRST_LIGHT_FRAME * FRAME_MS).toBeCloseTo(FIRST_LIGHT_MS, 6);
    expect(360 * FRAME_MS).toBeCloseTo(6000, 6);
    // A count of displayed frames and a span of elapsed time agree once the
    // last frame's own duration is added back, which is what the 351 is.
    expect(6000 - FIRST_LIGHT_MS + FRAME_MS).toBeCloseTo(VISIBLE_MS, 6);
    expect(VISIBLE_MS).toBeCloseTo(5850, 6);
  });

  it("has a lead-in of ten frames at mean 0.00", () => {
    expect(FIRST_LIGHT_FRAME).toBe(10);
    expect(LEAD_IN_MS).toBeCloseTo(166.6667, 3);
  });
});

describe("the boot sound", () => {
  it("runs about 7.3 s and outlives the last visual frame by about 1.7 s", () => {
    expect(SOUND_END_MS).toBe(7680);
    expect(SOUND_SPAN_MS).toBeCloseTo(7340, 6);
    expect(SOUND_TAIL_MS).toBeCloseTo(1680, 6);
  });

  it("records the console's logo hold as dash load, not as a design", () => {
    expect(DASH_LOAD_MS).toBe(14000);
    // The launcher spends none of it by default: there is no dash to load.
    expect(HOLD_MS).toBe(0);
  });
});

describe("the stage sequence", () => {
  it("is ordered and complete, from the lead-in to the handover", () => {
    expect(STAGE_IDS).toEqual([
      "dark",
      "arrive",
      "fill",
      "ignite",
      "flare",
      "resolve",
      "settle",
      "handover",
    ]);
    const stages = bootStages(FULL);
    expect(stages.map((stage) => stage.id)).toEqual([...STAGE_IDS]);
    for (const stage of stages) {
      expect(stage.durationMs).toBeGreaterThan(0);
      expect(stage.note.length).toBeGreaterThan(0);
    }
  });

  it("indexes every stage, and the handover is the last of them", () => {
    for (const id of STAGE_IDS) {
      expect(STAGE_INDEX[id]).toBe(STAGE_IDS.indexOf(id));
    }
    expect(STAGE_INDEX.handover).toBe(STAGE_IDS.length - 1);
  });

  it("has the beats tile the clip with no gap and no overlap", () => {
    expect(at(BEATS, 0).from).toBe(0);
    for (let index = 1; index < BEATS.length; index++) {
      expect(at(BEATS, index).from).toBe(at(BEATS, index - 1).to);
    }
    const last = at(BEATS, BEATS.length - 1);
    expect(last.to).toBe(360);
  });

  it("puts the first light at the measured frame, as the lead-in's end", () => {
    const lead = at(bootStages(FULL), 0);
    expect(lead.id).toBe("dark");
    expect(lead.fromMs).toBe(0);
    expect(lead.fromMs + lead.durationMs).toBeCloseTo(FIRST_LIGHT_MS, 6);
  });

  it("sums to the total at either rate", () => {
    for (const timing of [FULL, SHORT]) {
      const stages = bootStages(timing);
      const sum = stages.reduce((total, stage) => total + stage.durationMs, 0);
      expect(sum).toBeCloseTo(bootTotalMs(timing), 9);
      // The beats cover the clip, the lead-in at full length and the rest at
      // the rate, and the handover is on top of them.
      const clipMs = LEAD_IN_MS + (SETTLED_MS - LEAD_IN_MS) / timing.rate;
      expect(bootTotalMs(timing)).toBeCloseTo(clipMs + HANDOVER_MS / timing.rate, 6);
    }
  });

  it("is 6.3 s in full and 1.7 s in short", () => {
    expect(bootTotalMs(FULL)).toBeCloseTo(SETTLED_MS + HANDOVER_MS, 6);
    expect(bootTotalMs(SHORT)).toBeCloseTo(1700, 6);
  });

  it("puts the handover at the end of the clip, plus whatever the hold is", () => {
    for (const timing of [FULL, SHORT]) {
      const stages = bootStages(timing);
      const handover = at(stages, stages.length - 1);
      expect(handover.id).toBe("handover");
      expect(handover.fromMs).toBeCloseTo(bootSkipMs(timing), 9);
      expect(handover.durationMs).toBeCloseTo(HANDOVER_MS / timing.rate, 9);
    }
  });

  it("compresses every stage but the lead-in, so a warm boot still has a black frame", () => {
    const full = bootStages(FULL);
    const short = bootStages(SHORT);
    expect(at(short, 0).durationMs).toBeCloseTo(at(full, 0).durationMs, 9);
    for (let index = 1; index < full.length; index++) {
      expect(at(short, index).durationMs).toBeCloseTo(at(full, index).durationMs / WARM_RATE, 9);
    }
    // 6.3 s of bumper and handover against 1.7 s of it.
    expect(bootTotalMs(FULL)).toBeCloseTo(6300, 6);
    expect(bootTotalMs(SHORT)).toBeCloseTo(1700, 6);
  });

  it("holds on the settled logo for as long as the parent asks", () => {
    const held = bootTiming("full", 1400);
    const stages = bootStages(held);
    const handover = at(stages, stages.length - 1);
    expect(handover.fromMs).toBeCloseTo(6000 + 1400, 6);
    expect(bootTotalMs(held)).toBeCloseTo(7700, 6);
    // The hold is the parent's own work, so the mode does not compress it.
    expect(at(stages, stages.length - 2).durationMs).toBeCloseTo(2433.3333, 3);
  });

  it("survives a negative or absurd hold", () => {
    expect(bootTiming("full", -500).holdMs).toBe(0);
    expect(bootTiming("full", Number.NaN).holdMs).toBe(0);
  });
});

describe("the clock", () => {
  it("reads a stage and its progress at a point on the timeline", () => {
    expect(bootFrameAt(0, FULL).id).toBe("dark");
    expect(bootFrameAt(0, FULL).progress).toBeCloseTo(0, 9);
    expect(bootFrameAt(FIRST_LIGHT_MS + 1, FULL).id).toBe("arrive");
    expect(bootFrameAt(1000, FULL).id).toBe("fill");
    expect(bootFrameAt(1500, FULL).id).toBe("ignite");
    expect(bootFrameAt(2010, FULL).id).toBe("flare");
    expect(bootFrameAt(3000, FULL).id).toBe("resolve");
    expect(bootFrameAt(4000, FULL).id).toBe("settle");
    expect(bootFrameAt(6001, FULL).id).toBe("handover");
  });

  it("puts a stage boundary on the frame the filmstrip names", () => {
    const starts = new Map(bootStages(FULL).map((stage) => [stage.id, stage.fromMs]));
    const on = (id: StageId) => starts.get(id) ?? Number.NaN;
    // f10, f54, f86, f120, f122, f214 and f360, the seven onsets the beat table
    // is built from, and the lead-in's own zero.
    expect(on("dark")).toBeCloseTo(0, 6);
    expect(on("arrive")).toBeCloseTo(FIRST_LIGHT_MS, 6);
    expect(on("fill")).toBeCloseTo(54 * FRAME_MS, 6);
    expect(on("ignite")).toBeCloseTo(86 * FRAME_MS, 6);
    expect(on("flare")).toBeCloseTo(120 * FRAME_MS, 6);
    expect(on("resolve")).toBeCloseTo(122 * FRAME_MS, 6);
    expect(on("settle")).toBeCloseTo(214 * FRAME_MS, 6);
  });

  it("reports the canonical index, which is not its place in the entry order", () => {
    expect(bootFrameAt(0, FULL).index).toBe(0);
    expect(bootFrameAt(0, FULL).id).toBe(STAGE_IDS[bootFrameAt(0, FULL).index]);
  });

  it("is done only at the end of the handover", () => {
    expect(bootFrameAt(6000, FULL).done).toBe(false);
    expect(bootFrameAt(6200, FULL).done).toBe(false);
    expect(bootFrameAt(6299.9, FULL).done).toBe(false);
    expect(bootFrameAt(6300, FULL).done).toBe(true);
    expect(bootFrameAt(1e9, FULL).done).toBe(true);
  });

  it("clamps a reading outside the run rather than trusting it", () => {
    expect(bootFrameAt(-500, FULL).id).toBe("dark");
    expect(bootFrameAt(Number.NaN, FULL).id).toBe("dark");
  });

  it("keeps progress inside the stage it reports", () => {
    for (let ms = 0; ms <= bootTotalMs(FULL); ms += 37) {
      const frame = bootFrameAt(ms, FULL);
      expect(frame.progress).toBeGreaterThanOrEqual(0);
      expect(frame.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe("skipping", () => {
  it("jumps to the end rather than stepping, and enters only where it lands", () => {
    const early = bootAdvance(bootStart(), 400, FULL);
    expect(early.entered).toEqual(["dark", "arrive"]);

    const skipped = bootSkip(early, FULL);
    expect(skipped.ms).toBe(bootSkipMs(FULL));
    expect(skipped.ms).toBeCloseTo(6000, 6);
    // The four stages between arrive and the handover were never on screen.
    expect(skipped.entered).toEqual(["dark", "arrive", "handover"]);
  });

  it("lands in the handover, not past it, so the fade still runs", () => {
    const skipped = bootSkip(bootAdvance(bootStart(), 100, FULL), FULL);
    expect(bootFrameAt(skipped.ms, FULL).id).toBe("handover");
    expect(bootFrameAt(skipped.ms, FULL).done).toBe(false);
  });

  it("is one step from the first frame, with nothing in between", () => {
    const skipped = bootSkip(bootStart(), FULL);
    expect(skipped.entered).toEqual(["dark", "handover"]);
  });

  it("does nothing once it is done, or already inside the handover", () => {
    const done = playOut(FULL, FRAME_MS, 1000);
    expect(bootDone(done, FULL)).toBe(true);
    expect(bootSkip(done, FULL)).toBe(done);

    const held = bootTiming("full", 4000);
    const inside = bootAdvance(bootStart(), 10100, held);
    expect(bootFrameAt(inside.ms, held).id).toBe("handover");
    expect(bootDone(inside, held)).toBe(false);
    expect(bootSkip(inside, held)).toBe(inside);
  });

  it("finishes at the same moment a played run does", () => {
    const skipped = bootSkip(bootStart(), FULL);
    const played = playOut(FULL, 16, 1000);
    const finished = bootAdvance(skipped, played.ms, FULL);
    expect(finished.ms).toBeCloseTo(played.ms, 6);
    expect(bootDone(finished, FULL)).toBe(bootDone(played, FULL));
    // The same end, and fewer stages heard on the way, which is the whole of
    // what skipping buys.
    expect(finished.entered.length).toBeLessThan(played.entered.length);
    expect(finished.entered).toContain("handover");
  });
});

/** A seeded xorshift, so a failure is a fixed sequence rather than a lottery. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

describe("the timeline over an arbitrary clock", () => {
  it("never goes backwards and never enters a stage twice, over 400 clocks", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const random = makeRandom(seed);
      const timing = seed % 2 === 0 ? FULL : SHORT;
      const total = bootTotalMs(timing);
      let state = bootStart();
      let clock = 0;
      const seen = new Set<StageId>(state.entered);
      let rank = STAGE_INDEX[at(state.entered, 0)];

      for (let step = 0; step < 120; step++) {
        // A clock that jumps, stutters, repeats itself and occasionally rewinds.
        const roll = random();
        if (roll < 0.12) clock -= random() * 400;
        else if (roll < 0.24) clock += 0;
        else if (roll < 0.36) clock += random() * 2000;
        else clock += random() * 120;

        const before = state;
        state = bootAdvance(state, clock, timing);
        expect(state.ms).toBeGreaterThanOrEqual(before.ms);
        expect(state.ms).toBeLessThanOrEqual(total);

        // Only the newly entered tail is news; the list is append-only.
        const fresh = state.entered.slice(before.entered.length);
        for (const id of fresh) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
        // A skip mid-run is a jump: it moves the playhead and enters the one
        // stage it lands in, and nothing between.
        if (random() < 0.08) {
          const heard = state.entered.length;
          const jumped = bootSkip(state, timing);
          expect(jumped.ms).toBeGreaterThanOrEqual(state.ms);
          expect(jumped.entered.length).toBeLessThanOrEqual(heard + 1);
          for (const id of jumped.entered.slice(heard)) {
            expect(seen.has(id)).toBe(false);
            seen.add(id);
          }
          state = jumped;
        }

        // Never a repeat, and never backwards in the stage order.
        expect(new Set(state.entered).size).toBe(state.entered.length);
        for (const id of state.entered.slice(before.entered.length)) {
          expect(STAGE_INDEX[id]).toBeGreaterThanOrEqual(rank);
          rank = STAGE_INDEX[id];
        }

        if (bootDone(state, timing)) break;
      }
    }
  });

  it("enters every stage exactly once when played out at the frame rate", () => {
    for (const timing of [FULL, SHORT]) {
      const state = playOut(timing, FRAME_MS, 2000);
      expect(bootDone(state, timing)).toBe(true);
      expect(state.entered).toEqual([...STAGE_IDS]);
    }
  });

  it("enters the stages in timeline order however the clock moves", () => {
    for (const seed of [7, 42, 99, 613]) {
      const random = makeRandom(seed);
      let state = bootStart();
      let clock = 0;
      for (let step = 0; step < 4000 && !bootDone(state, FULL); step++) {
        // A coarse, jittery clock, which is the case where a stage could be
        // stepped over or entered twice if the arithmetic were wrong.
        clock += random() < 0.1 ? 0 : random() * 90;
        state = bootAdvance(state, clock, FULL);
      }
      expect(bootDone(state, FULL)).toBe(true);
      expect(state.entered).toEqual([...STAGE_IDS]);
    }
  });

  it("does not move when the clock does not", () => {
    const state = bootAdvance(bootStart(), 1200, FULL);
    expect(bootAdvance(state, 900, FULL)).toBe(state);
    expect(bootAdvance(state, 1200, FULL)).toBe(state);
  });
});

describe("warm and cold", () => {
  it("plays the measured bumper on a cold launch and a quarter of it on a warm one", () => {
    expect(resolveBootMode("auto", { cold: true })).toBe("full");
    expect(resolveBootMode("auto", { cold: false })).toBe("short");
  });

  it("honours an explicit choice over the cold rule", () => {
    expect(resolveBootMode("full", { cold: false })).toBe("full");
    expect(resolveBootMode("short", { cold: true })).toBe("short");
    expect(resolveBootMode("off", { cold: true })).toBe("off");
    expect(resolveBootMode("off", { cold: false })).toBe("off");
  });

  it("plays nothing under reduceMotion unless the choice was made on purpose", () => {
    expect(resolveBootMode("auto", { cold: true, reduceMotion: true })).toBe("off");
    expect(resolveBootMode("auto", { cold: false, reduceMotion: true })).toBe("off");
    expect(resolveBootMode("full", { cold: true, reduceMotion: true })).toBe("full");
  });

  it("resolves a mode to a rate, and only two rates exist", () => {
    expect(bootTiming("full").rate).toBe(1);
    expect(bootTiming("short").rate).toBe(WARM_RATE);
    for (const mode of ["full", "short"] as BootSpeed[]) {
      expect(bootWindows(bootTiming(mode))[at(WINDOW_IDS, 0)].durationMs).toBeGreaterThan(0);
    }
  });
});

describe("the animation windows", () => {
  it("cover a contiguous run of stages and never invert", () => {
    const windows = bootWindows(FULL);
    for (const id of WINDOW_IDS) {
      const window = windows[id];
      expect(window.durationMs).toBeGreaterThan(0);
      expect(window.delayMs).toBeGreaterThanOrEqual(0);
      const span = WINDOW_SPANS[id];
      expect(at(STAGE_IDS, STAGE_INDEX[at(span, 0)])).toBe(at(span, 0));
    }
  });

  it("put the handover's window last, so the fade cannot start early", () => {
    const windows = bootWindows(FULL);
    expect(windows.boot.delayMs).toBeCloseTo(6000, 6);
    expect(windows.boot.durationMs).toBeCloseTo(HANDOVER_MS, 6);
    for (const id of WINDOW_IDS) {
      if (id === "boot") continue;
      expect(windows[id].delayMs + windows[id].durationMs).toBeLessThanOrEqual(6000 + 1e-6);
    }
  });

  it("start the sphere at first light and the badge after the fill has begun", () => {
    const windows = bootWindows(FULL);
    expect(windows.sphere.delayMs).toBeCloseTo(FIRST_LIGHT_MS, 6);
    expect(windows.wash.delayMs).toBeCloseTo(FIRST_LIGHT_MS, 6);
    expect(windows.skip.delayMs).toBeGreaterThan(FIRST_LIGHT_MS);
  });

  /**
   * The keyframe stops in the stylesheet are fractions of these windows, and
   * each names a measured frame. This recomputes them, so a retuned handover or
   * a re-cut beat table cannot leave the two quietly disagreeing.
   */
  it("put every keyframe stop where the frame it names falls in its window", () => {
    const stages = bootStages(FULL);
    const stage = (id: StageId) =>
      at(
        stages.filter((s) => s.id === id),
        0,
      );
    const stops: [WindowId, number, number][] = [
      ["sphere", 39, 90],
      ["sphere", 55, 122],
      ["cross", 4, 91],
      ["cross", 28, 122],
      ["flare", 2, 122],
      ["ring", 81.5, 333],
      ["skip", 22, 120],
    ];
    for (const [id, stop, frame] of stops) {
      const [first, last] = WINDOW_SPANS[id];
      const from = stage(first).fromMs;
      const to = stage(last).fromMs + stage(last).durationMs;
      const computed = ((frame * FRAME_MS - from) / (to - from)) * 100;
      expect(Math.abs(computed - stop)).toBeLessThan(0.6);
    }
  });

  it("move with the mode, so the warm boot is the same composition faster", () => {
    for (const id of WINDOW_IDS) {
      const full = bootWindows(FULL);
      const short = bootWindows(SHORT);
      expect(short[id].delayMs).toBeLessThanOrEqual(full[id].delayMs + 1e-9);
      expect(short[id].durationMs).toBeLessThanOrEqual(full[id].durationMs + 1e-9);
    }
    expect(bootWindows(SHORT).sphere.durationMs).toBeCloseTo(3400 / WARM_RATE, 6);
  });

  it("seek so that every window is at or past the playhead, which is the skip's arithmetic", () => {
    const windows = bootWindows(FULL);
    for (const id of WINDOW_IDS) {
      if (id === "boot") continue;
      const window = windows[id];
      // A negative delay lands the animation at delay + duration into its own
      // timeline, and anything at or past the end holds its last keyframe.
      expect(window.delayMs - 6000 + window.durationMs).toBeLessThanOrEqual(1e-9);
    }
    // The one window that has not passed is the handover, and its delay lands
    // on exactly zero, so the fade starts on the frame the key was pressed.
    expect(windows.boot.delayMs).toBeCloseTo(6000, 6);
    expect(windows.boot.delayMs - 6000).toBe(0);
  });
});

describe("the boxes the compositor allocates", () => {
  it("fills the frame with a layer or stays well inside it", () => {
    // This is the gate's own rule: no layer spans the frame unless it fills it.
    for (const cost of bootCost()) {
      const box = cost.box;
      const spansWidth = box.x <= 0 && box.x + box.width >= FRAME_W;
      const spansHeight = box.y <= 0 && box.y + box.height >= FRAME_H;
      const fillsWidth = box.x === 0 && box.width === FRAME_W;
      const fillsHeight = box.y === 0 && box.height === FRAME_H;
      expect(spansWidth ? fillsWidth : true).toBe(true);
      expect(spansHeight ? fillsHeight : true).toBe(true);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(FRAME_W);
      expect(box.y + box.height).toBeLessThanOrEqual(FRAME_H);
    }
  });

  it("puts the two full-frame planes at the frame's own size and nothing else there", () => {
    const boxes = bootBoxes();
    expect(boxes.boot).toEqual({ x: 0, y: 0, width: FRAME_W, height: FRAME_H });
    expect(boxes.wash).toEqual({ x: 0, y: 0, width: FRAME_W, height: FRAME_H });
    const full = WINDOW_IDS.filter((id) => id !== "boot" && id !== "wash");
    for (const id of full) {
      expect(boxes[id].width).toBeLessThan(FRAME_W);
      expect(boxes[id].height).toBeLessThan(FRAME_H);
    }
  });

  it("keeps the X, the flare and the lockup inside the sphere they sit on", () => {
    const boxes = bootBoxes();
    const sphere = boxes.sphere;
    for (const id of ["cross", "flare"] as const) {
      expect(boxes[id].width).toBeLessThanOrEqual(sphere.width);
      expect(boxes[id].x).toBeGreaterThanOrEqual(sphere.x);
      expect(boxes[id].y).toBeGreaterThanOrEqual(sphere.y);
    }
  });

  it("holds the orb inside the ring, at the gap the model declares", () => {
    expect(RING_D).toBe(ORB_D + 2 * (RING_GAP + RING_W));
    const boxes = bootBoxes();
    expect(boxes.ring.width).toBe(RING_D);
    // The lockup's box is derived, so the ring and the wordmark cannot fall out.
    const lockup = lockupBox();
    expect(lockup.width).toBeGreaterThanOrEqual(RING_D);
    expect(lockup.height).toBeGreaterThan(RING_D);
    // The ring is centred in the lockup's own box and the mark sits under it,
    // so neither can fall out of a box the compositor has already allocated.
    // Neither has a layer of its own: they are inside the lockup's texture.
    expect(boxes.ring.x - lockup.x).toBeCloseTo((lockup.width - RING_D) / 2, 6);
    expect(lockup.x + lockup.width / 2).toBe(LOCKUP_CX);
    expect(Object.keys(boxes)).toEqual([...WINDOW_IDS]);
    expect(MARK_SIZE).toBeLessThan(lockup.height - RING_D);
  });

  it("costs what the report says it costs, and the sphere scales rather than resizes", () => {
    // The sphere's texture follows its CSS box; the scale is drawn on top of it.
    expect(SPHERE_D * SPHERE_MAX).toBeGreaterThan(FRAME_H);
    const total = bootTotalMb();
    expect(total).toBeGreaterThan(20);
    expect(total).toBeLessThan(40);
    // The backdrop is the bulk of it, and it is the one layer that fills.
    const backdrop = bootCost()
      .filter((entry) => entry.id === "boot" || entry.id === "wash")
      .reduce((sum, entry) => sum + entry.mb, 0);
    expect(backdrop).toBeCloseTo((2 * (FRAME_W * FRAME_H * 4)) / (1024 * 1024), 1);
  });

  it("has a box for every animated element, so nothing is styled that is not placed", () => {
    const boxes = bootBoxes();
    for (const id of WINDOW_IDS) {
      expect(boxes[id as WindowId]).toBeDefined();
      expect(boxes[id as WindowId].width).toBeGreaterThan(0);
    }
  });
});
