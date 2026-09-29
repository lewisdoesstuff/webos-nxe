/**
 * The boot sequence: the 2005 pre-Kinect bumper, as a stage list and a clock.
 *
 * Framework-free, like `hub.ts`: no Vue, no DOM, no Luna, no audio. It holds the
 * measured beat table, the two playback rates, the animation windows the
 * component draws over, and the boxes the compositor allocates. Nothing here
 * plays anything.
 *
 * **Which animation this is.** The NXE-era console plays the pre-Kinect bumper
 * that shipped in 2005. NXE shipped no new boot animation, and retail
 * `dash.xex` build 9199 running in Xenia renders the same orb and wordmark.
 * VERIFIED, three independent lines in NXE-BOOT-INPUT.md section 1.1.
 *
 * **How many measurements the timing rests on: one.** Two of the three boot
 * captures are the same master, cross-correlating at 0.9999 with a mean
 * absolute pixel difference of 1.25/255 on the aligned overlap, so the frame
 * count is reported once and is not described as corroborated. Every frame
 * number below is off that master, `dkKAW_GXXZk`, 2560x1440 at 60/1, method:
 * per-frame mean and mean-absolute-difference at 640x360. The definitive source
 * is the console's own `bootanim.xex`, archived at 397,312 B in two variants
 * with different MD5s, whose video section is encrypted by `xextool -e e -c c`
 * and needs the retail XEX key. That blocker is recorded rather than worked
 * around. Whether the asset is 30 or 60 fps is UNVERIFIED and matters to
 * nothing here: every number below is in milliseconds derived from the frame
 * rate of the capture, which is what was measured.
 *
 * **The error bars are not uniform.** The first-light frame and the settled
 * frame are exact, because they are where a threshold was crossed. The beat
 * boundaries between them come off a 0.25 s filmstrip, so they carry
 * +/-0.125 s. The stage boundaries below are onsets rather than midpoints for
 * that reason, and one pair of bands overlaps inside that strip: the fill band
 * is f54-f90 and the ignition is f86-f91, so the boundary is taken at f86 and
 * five frames of the fill band fall after it.
 *
 * Provenance is on each constant, as in `hub.ts`: VERIFIED is counted off the
 * master or read out of a named source, DERIVED is arithmetic on verified
 * numbers, UNVERIFIED is a choice this build has to make.
 */

import { px, type Box } from "./hub";

/**
 * The frame rate of the timing master, which is 60/1 with no half-rate
 * duplication in the capture: even/odd frame-difference medians 2.729/2.777,
 * 4 of 149 even steps under 0.06 MAD. VERIFIED.
 */
export const FPS = 60;

/** One frame at `FPS`, in milliseconds. DERIVED, and the only unit here. */
export const FRAME_MS = 1000 / FPS;

/** The clip's first frame, which is black. VERIFIED: mean 0.00. */
export const FIRST_FRAME = 0;

/**
 * First light, f10: a dark sphere enters, lit from above. VERIFIED, and it is
 * the threshold crossing, not a filmstrip reading, so it is exact.
 */
export const FIRST_LIGHT_FRAME = 10;

/**
 * The last frame above the noise floor, f360. After it the logo is static and
 * holds indefinitely: the master runs a further 52 s of a motionless frame.
 * VERIFIED.
 */
export const SETTLED_FRAME = 360;

/** Time to first light, 0.167 s. DERIVED from `FIRST_LIGHT_FRAME`. */
export const FIRST_LIGHT_MS = FIRST_LIGHT_FRAME * FRAME_MS;

/** Time to the settled logo, 6.000 s. DERIVED from `SETTLED_FRAME`. */
export const SETTLED_MS = SETTLED_FRAME * FRAME_MS;

/**
 * Frames of visible motion, f10 to f360 inclusive: **351**. VERIFIED, and the
 * one measurement the whole sequence rests on.
 */
export const VISIBLE_FRAMES = SETTLED_FRAME - FIRST_LIGHT_FRAME + 1;

/**
 * Visible motion in milliseconds, **5.850 s**. DERIVED: the settled frame minus
 * the first-light frame, plus the one frame the last frame is held for, which
 * is what makes a count of displayed frames and a span of elapsed time agree.
 */
export const VISIBLE_MS = SETTLED_MS - FIRST_LIGHT_MS + FRAME_MS;

/** The black lead-in, f0 to f9. VERIFIED: ten frames at mean 0.00. */
export const LEAD_IN_FRAMES = FIRST_LIGHT_FRAME;

/** The black lead-in in milliseconds. DERIVED from `LEAD_IN_FRAMES`. */
export const LEAD_IN_MS = LEAD_IN_FRAMES * FRAME_MS;

/**
 * The boot sound's envelope: silent to 0.34 s, a low rumble to 1.02 s, the
 * whoosh peaking at -27 dB over 1.02-1.79 s, a plateau to 4.10 s, the twinkle
 * bump at 4.52-4.86 s, then a decay to silence at 7.68 s. DERIVED, and from
 * one source: the audio is from the same encode as the timing master, so it is
 * not independently verified. RMS envelope at 85 ms resolution.
 */
export const SOUND_START_MS = 340;
export const SOUND_END_MS = 7680;

/** The audible span, about 7.3 s. DERIVED from the two envelope boundaries. */
export const SOUND_SPAN_MS = SOUND_END_MS - SOUND_START_MS;

/**
 * How far the sound runs past the settled logo, about 1.7 s. DERIVED.
 *
 * This is the reason a launcher must not reproduce the console's handover: the
 * console sat on the logo for the best part of twenty seconds, and the sound's
 * tail hung over all of it. A launcher has no dash to load behind the logo, so
 * the tail would be dead air over a static frame. The number is kept here as
 * `holdMs` on the component instead of being spent as a delay.
 */
export const SOUND_TAIL_MS = SOUND_END_MS - SETTLED_MS;

/**
 * Power press to a usable dashboard on early NXE, estimated at 13 to 20 s.
 * **DERIVED and weak, and the weakest number in the research.** No launch-period
 * source states it. The midpoint comes from a Quarter To Three thread of
 * 2009-08-16 already reporting the August 2009 dashboard's regression, where a
 * reply recalls the pre-regression figure as "7-8 seconds" at the logo, which is
 * shorter than the whole bumper and so is not a clean total either. A separate
 * 2011 Engadget measurement of a later console puts 22 s to the same home
 * screen, consistent in order of magnitude and in neither era nor build.
 *
 * Nothing here is built to these numbers. They are recorded so the shape of
 * the console's boot is not mistaken for a target, and because they are the
 * reason the logo's hold was a dash load rather than a design.
 */
export const CONSOLE_TOTAL_MIN_MS = 13000;
export const CONSOLE_TOTAL_MAX_MS = 20000;

/**
 * The dash load the console's logo covered: the upper estimate less the bumper.
 * DERIVED from the two numbers above, and no better than they are.
 */
export const DASH_LOAD_MS = CONSOLE_TOTAL_MAX_MS - SETTLED_MS;

/**
 * How long the boot's own handover takes: the fade from the boot to the
 * dashboard already mounted behind it.
 *
 * UNVERIFIED, because the bumper has no measured handover. The console's video
 * ends and the dashboard is there, so the source gives no fade to copy. 300 ms
 * is the Guide's own open time, `OPEN_MS` in `guide.ts`, so the app's one
 * full-screen takeover fades in the time its other full-screen takeover does.
 *
 * The fade is a composited opacity on a full-frame layer over the dashboard's
 * full-frame layer: 2 x 7.91 MB of texture traffic against a measured 311 MB
 * budget per frame, about 5% of it, for this window only. It costs no
 * allocation, which is the invariant that matters.
 */
export const HANDOVER_MS = 300;

/**
 * How long the launcher holds the settled logo before handing over, by default.
 *
 * Zero, deliberately. The console's hold was `DASH_LOAD_MS` of hidden dash
 * read, roughly fourteen seconds, and the sound's `SOUND_TAIL_MS` hung over
 * the end of it. A launcher has nothing to wait for: the dashboard is mounted
 * behind the boot from the first frame, which is what makes the handover cost
 * nothing. The knob is a prop, so a parent with real work to do can spend the
 * hold on it, and the parent may also set it to the sound's overhang if it ever
 * plays the sound. UNVERIFIED as a design value, in the sense that no source
 * describes a launcher.
 */
export const HOLD_MS = 0;

/** The stages, in the order they run. A tuple, so the order cannot drift. */
export const STAGE_IDS = [
  "dark",
  "arrive",
  "fill",
  "ignite",
  "flare",
  "resolve",
  "settle",
  "handover",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

/** Where each stage sits, so a consumer can index rather than count. */
export const STAGE_INDEX: Readonly<Record<StageId, number>> = {
  dark: 0,
  arrive: 1,
  fill: 2,
  ignite: 3,
  flare: 4,
  resolve: 5,
  settle: 6,
  handover: 7,
};

/** The first frame's index, for the one lookup the tests need to be explicit. */
export const FIRST_STAGE: StageId = "dark";

/** The last stage, which is the one the handover is. */
export const LAST_STAGE: StageId = "handover";

/** One measured beat, in frames. `to` is the next beat's onset, not its end. */
export interface Beat {
  readonly id: StageId;
  readonly from: number;
  readonly to: number;
  /** What the filmstrip shows, which is what names the beat. */
  readonly note: string;
  /** The frames the beat is measured on, verbatim from the research. */
  readonly measured: string;
}

/**
 * The bumper's beats, in frames.
 *
 * Every `from` and every `to` is a measured frame. The filmstrip boundaries
 * carry +/-0.125 s, so the numbers are honest to about seven frames, and the
 * two that are not filmstrip readings (first light, settled) are exact.
 *
 * `dark` is the one stage the playback rate does not touch. It is the console
 * waiting for video output, and a warm boot that compressed it would have no
 * black frame at all to cover the dashboard's first paint behind it.
 */
export const BEATS: readonly Beat[] = [
  {
    id: "dark",
    from: 0,
    to: 10,
    note: "black lead-in, nothing on screen",
    measured: "f0-f9, mean 0.00",
  },
  {
    id: "arrive",
    from: 10,
    to: 54,
    note: "a dark sphere enters, lit from above",
    measured: "first light f10",
  },
  {
    id: "fill",
    from: 54,
    to: 86,
    note: "the sphere grows to fill the frame, brightness 42 to 155",
    measured: "f54-f90, so f90 falls after the f86 ignition onset",
  },
  {
    id: "ignite",
    from: 86,
    to: 120,
    note: "the X ignites, the first large change burst",
    measured: "f86-f91, MAD 6.15 to 8.50",
  },
  {
    id: "flare",
    from: 120,
    to: 122,
    note: "the starburst peak, the largest frame-to-frame change in the asset",
    measured: "f120-f122, MAD 21.13, brightness peak 167.87",
  },
  {
    id: "resolve",
    from: 122,
    to: 214,
    note: "the big sphere recedes; a small orb and the wordmark resolve",
    measured: "f214-f221, brightness 195 to 218",
  },
  {
    id: "settle",
    from: 214,
    to: 360,
    note: "the logo ring contracts and holds",
    measured: "f331-f333, settled f360",
  },
];

/** One stage of the run, resolved to milliseconds. */
export interface Stage {
  readonly id: StageId;
  readonly note: string;
  /** Where it starts on the timeline, in milliseconds. */
  readonly fromMs: number;
  /** How long it runs, in milliseconds. Always greater than zero. */
  readonly durationMs: number;
  /** The rate does not scale this stage. */
  readonly fixed: boolean;
}

/**
 * The playback rate for the warm boot, as a divisor.
 *
 * A quarter of the measured six seconds, so about 1.5 s of visible motion.
 * UNVERIFIED and chosen: the console's bumper is not optional, so there is no
 * source for a fast one. The figure is a compromise between two failure modes,
 * a boot that feels like a wait and a warm boot that is a flicker nobody can
 * place. At a quarter, the same composition runs at four times the speed and
 * still reads as the orb arriving and the logo resolving.
 */
export const WARM_RATE = 4;

/** The measured bumper's rate, which is the capture's own frame rate. */
export const FULL_RATE = 1;

/** What the timeline can play. `off` is not one: it is the absence of a boot. */
export type BootSpeed = "full" | "short";

/**
 * What a settings value would hold. `auto` is the default and resolves on
 * whether the launch is cold.
 */
export type BootPreference = "auto" | BootSpeed | "off";

/** One boot's timing, resolved. Held as an object so it is computed once. */
export interface BootTiming {
  /** Divisor on every stage the rate touches. 1, or `WARM_RATE`. */
  readonly rate: number;
  /**
   * The hold on the settled logo, in unscaled milliseconds. Not compressed: a
   * parent's work does not get faster because the animation did.
   */
  readonly holdMs: number;
}

/**
 * Resolve a mode and a hold into the timing the timeline runs on.
 *
 * `holdMs` is the parent's own knob, so the console's `DASH_LOAD_MS` and the
 * sound's `SOUND_TAIL_MS` are both expressible without either being built in.
 */
export function bootTiming(mode: BootSpeed, holdMs: number = HOLD_MS): BootTiming {
  const hold = Number.isFinite(holdMs) ? Math.max(0, holdMs) : 0;
  return { rate: mode === "short" ? WARM_RATE : FULL_RATE, holdMs: hold };
}

/**
 * The stages of one run, in order, resolved to milliseconds.
 *
 * The seven beats tile f0 to f360 exactly, so their durations sum to
 * `SETTLED_MS`, and the handover follows. The handover's own duration is
 * `HANDOVER_MS` and the hold sits in front of it, so a run is the measured
 * six seconds, plus whatever the parent asked for, plus 300 ms.
 */
export function bootStages(timing: BootTiming): readonly Stage[] {
  const stages: Stage[] = [];
  let fromMs = 0;
  for (const beat of BEATS) {
    const frames = beat.to - beat.from;
    const fixed = beat.id === "dark";
    const durationMs = fixed ? frames * FRAME_MS : (frames * FRAME_MS) / timing.rate;
    stages.push({ id: beat.id, note: beat.note, fromMs, durationMs, fixed });
    fromMs += durationMs;
  }
  stages.push({
    id: "handover",
    note: "the boot fades out and the dashboard is already there",
    fromMs: fromMs + timing.holdMs,
    durationMs: HANDOVER_MS / timing.rate,
    fixed: false,
  });
  return stages;
}

/** The whole run, from the black lead-in to the dashboard. */
export function bootTotalMs(timing: BootTiming): number {
  return runEnd(bootStages(timing));
}

/** Where the run stops: the last stage's end, which is the handover's end. */
function runEnd(stages: readonly Stage[]): number {
  const last = stages[stages.length - 1];
  return (last?.fromMs ?? 0) + (last?.durationMs ?? 0);
}

/**
 * Where a skip lands: the first frame of the handover, which is the end of the
 * bumper and the end of any hold.
 *
 * Not the end of the run. Skipping the bumper must not also skip the fade,
 * because a hard cut from a near-white frame to the dashboard is a flash, and
 * the whole reason the boot is skippable is that it is not worth looking at.
 */
export function bootSkipMs(timing: BootTiming): number {
  const stages = bootStages(timing);
  const handover = stages.find((stage) => stage.id === "handover");
  return handover?.fromMs ?? 0;
}

/** The clock reading at a point on the timeline. */
export interface BootFrame {
  readonly id: StageId;
  /** Where this stage sits in `STAGE_IDS`, not in this run's entry order. */
  readonly index: number;
  /** 0 to 1 through the stage. */
  readonly progress: number;
  /** True once the playhead is at the end of the handover. */
  readonly done: boolean;
}

/**
 * The playhead, in milliseconds, clamped to the run.
 *
 * `done` is true at the end of the handover, which is the only place the
 * handover is over.
 */
export function bootFrameAt(ms: number, timing: BootTiming): BootFrame {
  const stages = bootStages(timing);
  const at = Math.min(Math.max(Number.isFinite(ms) ? ms : 0, 0), bootTotalMs(timing));
  let found: Stage = stages[0] as Stage;
  let foundIndex = 0;
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index];
    if (stage === undefined) continue;
    found = stage;
    foundIndex = index;
    if (at < stage.fromMs + stage.durationMs) break;
  }
  return {
    id: found.id,
    index: foundIndex,
    progress: Math.min(1, Math.max(0, (at - found.fromMs) / found.durationMs)),
    done: at >= bootTotalMs(timing),
  };
}

/** Where the playhead is, and which stages it has actually entered. */
export interface BootState {
  /** Milliseconds from the start of the run. Never decreases. */
  readonly ms: number;
  /** The stages entered so far, in order, without a repeat. */
  readonly entered: readonly StageId[];
}

/**
 * The run has not started: the playhead is at the lead-in, which is a stage.
 *
 * No timing, because the lead-in is the same for every rate: it is the console
 * waiting for video output and it does not compress.
 */
export function bootStart(): BootState {
  return { ms: 0, entered: [FIRST_STAGE] };
}

/**
 * Whether a run is over, which is the one question a state cannot answer about
 * itself: the end of a run is a property of its timing, not of the playhead.
 */
export function bootDone(state: BootState, timing: BootTiming): boolean {
  return state.ms >= bootTotalMs(timing);
}

/**
 * Move the playhead to a clock reading.
 *
 * Time that does not advance the playhead leaves the state alone, which is what
 * makes a clock that stutters, a `setTimeout` that fires early or a parent that
 * seeks backwards all harmless. The entry list only grows, and only by the
 * stages the playhead has actually passed through, so no stage is ever entered
 * twice.
 */
/**
 * Move the playhead to a clock reading.
 *
 * Time that does not advance the playhead leaves the state alone, which is what
 * makes a clock that stutters, a `setTimeout` that fires early or a parent that
 * seeks backwards all harmless. The entry list only grows, and only by the
 * stages the playhead's path crossed, so no stage is entered twice however
 * coarse the clock is.
 */
export function bootAdvance(state: BootState, atMs: number, timing: BootTiming): BootState {
  const stages = bootStages(timing);
  const wanted = Number.isFinite(atMs) ? atMs : state.ms;
  const ms = Math.min(Math.max(wanted, state.ms), runEnd(stages));
  if (ms === state.ms) return state;

  const entered = crossed(state.entered, state.ms, ms, stages);
  if (entered.length === state.entered.length) return { ...state, ms };
  return { ms, entered };
}

/**
 * Jump to the end of the bumper.
 *
 * One step, not a walk. The stages it passes over are not entered, so a parent
 * that reacts to `stage` hears the handover arrive and never hears the orb
 * grow, and `entered` still means entered rather than passed. Already done, or
 * already inside the handover, and nothing moves.
 */
export function bootSkip(state: BootState, timing: BootTiming): BootState {
  const target = bootSkipMs(timing);
  if (state.ms >= target) return state;
  const stages = bootStages(timing);
  const entered = stages.some((stage) => contains(stage, target))
    ? addStage(state.entered, stageAt(stages, target))
    : state.entered;
  return { ms: target, entered };
}

function contains(stage: { fromMs: number; durationMs: number }, ms: number): boolean {
  return ms >= stage.fromMs && ms < stage.fromMs + stage.durationMs;
}

function stageAt(stages: readonly Stage[], ms: number): StageId {
  for (const stage of stages) if (contains(stage, ms)) return stage.id;
  return LAST_STAGE;
}

function addStage(entered: readonly StageId[], id: StageId): readonly StageId[] {
  return entered.includes(id) ? entered : [...entered, id];
}

/**
 * The stages a clock run adds to the entry list.
 *
 * A stage is added when its onset lies in `(from, to]`: the playhead was on one
 * side of it and is now on the other, so it ran, whether or not the renderer saw
 * every frame of it. A stage the playhead was already inside is not re-added,
 * which is what keeps a coarse clock, a stall or a resumed run from firing one
 * twice. The result is a subsequence of `STAGE_IDS`, always in order.
 */
function crossed(
  entered: readonly StageId[],
  from: number,
  to: number,
  stages: readonly Stage[],
): StageId[] {
  const next = [...entered];
  for (const stage of stages) {
    if (stage.fromMs > to) break;
    if (stage.fromMs <= from) continue;
    next.push(stage.id);
  }
  return next;
}

/** One element's animation window, on the timeline. */
export interface BootWindow {
  /** Milliseconds from the start of the run to the first frame of the window. */
  readonly delayMs: number;
  /** How long the window runs. */
  readonly durationMs: number;
}

/** The elements the component animates, in the order the windows are written. */
export const WINDOW_IDS = [
  "boot",
  "wash",
  "sphere",
  "cross",
  "flare",
  "lockup",
  "ring",
  "mark",
  "skip",
] as const;

export type WindowId = (typeof WINDOW_IDS)[number];

/**
 * Where each element animates, in stages.
 *
 * A window is a run of stages on the timeline, and its keyframes are fractions
 * of the window, so compressing the run does not move a single keyframe. That
 * is what makes the warm boot the same composition at four times the speed
 * rather than a different animation, and it is why the stylesheet holds no
 * absolute percentages: every stop is a fraction of a window the model hands
 * it.
 *
 * The windows deliberately overlap. The sphere grows from first light and is
 * still on screen while the flare fires, because in the capture the flare is
 * on the sphere's surface rather than beside it. The orb runs from the recede
 * to the end of the settle because the master keeps shrinking and re-homing it
 * past the burn-out, well inside the beat the filmstrip calls the settle.
 */
export const WINDOW_SPANS: Readonly<Record<WindowId, readonly [StageId, StageId]>> = {
  boot: ["handover", "handover"],
  wash: ["arrive", "arrive"],
  sphere: ["arrive", "resolve"],
  cross: ["ignite", "resolve"],
  flare: ["flare", "resolve"],
  lockup: ["resolve", "settle"],
  ring: ["settle", "settle"],
  mark: ["settle", "settle"],
  skip: ["fill", "settle"],
};

/** Every animation window on one run's timeline, by element. */
export function bootWindows(timing: BootTiming): Record<WindowId, BootWindow> {
  const stages = bootStages(timing);
  const windows = {} as Record<WindowId, BootWindow>;
  for (const id of WINDOW_IDS) {
    const span = WINDOW_SPANS[id];
    const from = stages.find((stage) => stage.id === span?.[0])?.fromMs ?? 0;
    const end = stages.find((stage) => stage.id === span?.[1]);
    windows[id] = {
      delayMs: from,
      durationMs: (end?.fromMs ?? from) + (end?.durationMs ?? 0) - from,
    };
  }
  return windows;
}

/** How the playhead was left, which the parent's `done` payload carries. */
export type BootReason = "played" | "skipped";

/** The payload of the component's `done` event. */
export interface BootDone {
  /** `skipped` when a key took the boot to the end of the bumper. */
  readonly reason: BootReason;
  /** The playhead at the end of the run, in milliseconds. */
  readonly elapsedMs: number;
}

/** The payload of the component's `stage` event. */
export interface BootStageEvent {
  readonly id: StageId;
  /** Where this stage sits in `STAGE_IDS`, not in the entry order. */
  readonly index: number;
}

/** What a cold launch is, for the `auto` preference. */
export interface BootContext {
  /** First launch of this session, or after a gap longer than the store's. */
  readonly cold: boolean;
  /** The dashboard's own `reduceMotion`. */
  readonly reduceMotion?: boolean;
}

/**
 * Resolve a stored preference and a launch into the mode to play.
 *
 * `auto` is full on a cold launch and short on a warm one, so the bumper is
 * there when someone has been away and out of the way when they have not. An
 * explicit choice is honoured over `reduceMotion`, because a preference set on
 * purpose should not be overridden by a general one, and `auto` under
 * `reduceMotion` plays nothing at all: the whole sequence is a large moving
 * light, which is the case that setting exists for.
 */
export function resolveBootMode(
  preference: BootPreference,
  context: BootContext,
): BootSpeed | "off" {
  if (preference === "off") return "off";
  if (preference === "full" || preference === "short") return preference;
  if (context.reduceMotion) return "off";
  return context.cold ? "full" : "short";
}

/**
 * The frame the boot is drawn in, 1920x1080. The bumper asset is 1280x720
 * (`Xbox360BootAnimationCreator` names a WMV 9 Advanced Profile 1280x720 input)
 * and the console upscaled it, so the asset's own pixels convert by the same
 * 1.5 every scene number in `hub.ts` does. VERIFIED as the asset's size,
 * DERIVED as the conversion.
 */
export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** The stage, the frame's own box. It fills the frame, so it may span it. */
export const STAGE: Box = { x: 0, y: 0, width: FRAME_W, height: FRAME_H };

/**
 * The backdrop, measured off the master's settled frame (`dkKAW_GXXZk`, n400)
 * at 2560x1440 and converted by 0.75. The field is a radial glow whose core
 * sits up and left of the lockup: `#D5F4AD` at the core, `#BCE093` at mid
 * radius, `#8FA582` in every corner. The measured brightness ramp across the
 * fill is carried by the sphere growing, not by animating the backdrop,
 * because a gradient's stops are not animatable and a second full-frame plane
 * for the ramp is 7.9 MB.
 */
export const WASH_TOP = "#d5f4ad";
export const WASH_MID = "#bce093";
export const WASH_EDGE = "#8fa582";

/**
 * The big sphere's resting box and the size it grows to. The master's ball
 * measures 2230 across at the flare (circle fit on its top edge at f121) and
 * stays over a thousand wide through the recede, so the fill is 2.5 of the
 * 900 box. Its centre is a little above the frame's middle at rest.
 */
export const SPHERE_D = px(600);
export const SPHERE_MAX = 2.5;
export const SPHERE_X = px(340);
export const SPHERE_Y = px(30);

/**
 * The X on the sphere's face, as the master draws it at the flare: the mark's
 * centre sits 520 right and 634 above the ball's centre (f121 core at
 * 1245,706 against the fitted ball centre at 725,1340), which is where these
 * land once the sphere's 2.5 fill scale is applied. The span is the mark's
 * width as a fraction of the sphere box; the mark's own artwork is the cutout
 * of the settled orb.
 */
export const CROSS_SPAN = 0.55;
export const CROSS_DX = px(140);
export const CROSS_DY = px(-171);

/** The starburst's box and its spokes. A third of the frame at the peak. */
export const FLARE_D = px(440);
export const SPOKE_COUNT = 8;
export const SPOKE_W = 0.055;

/** The settled orb, and the ripple ring that goes round it and the wordmark. */
export const ORB_D = px(234);
export const RING_GAP = px(116);
export const RING_W = px(4);

/** The ring's own box, which is the orb with the gap and the stroke on it. */
export const RING_D = ORB_D + 2 * (RING_GAP + RING_W);

/** How far the ring is out when it blooms, which it contracts from. */
export const RING_CONTRACT = 1.53;

/** The wordmark's cutout box: 894x189 at 1920, the master's own measure. */
export const MARK_W = px(596);
export const MARK_SIZE = px(126);

/** The gap under the ring's box that the mark's slot adds to the lockup. */
export const MARK_GAP = px(49);

/** The lockup's centre, and where the orb and the mark sit around it. */
export const LOCKUP_CX = px(648);
export const LOCKUP_CY = px(360);
export const ORB_CY = px(288);
export const ORB_BOX_D = px(240);
export const MARK_Y = px(396);
export const RING_CY = px(363);

/**
 * The lockup's composition box: the ring's box across, and the ring's box
 * with the mark's slot under it. Derived so the ring and the wordmark cannot
 * fall out of a box the compositor has already allocated. The orb's layer is
 * placed inside it; the mark's is placed under the ring's box.
 */
export function lockupBox(): Box {
  const width = Math.max(RING_D, MARK_W);
  const height = RING_D + MARK_GAP + Math.round(MARK_SIZE * 1.2);
  return {
    x: LOCKUP_CX - width / 2,
    y: LOCKUP_CY - height / 2,
    width,
    height,
  };
}

/**
 * The `A` prompt that says the boot can be skipped, at the dashboard's own
 * measured prompt position: the `A` badge at x 102, y 640, 22 across, in the
 * 720p frame. VERIFIED off the running retail build 9199, and the caption is
 * that build's, because the one place a boot screen is known to have been
 * skippable is the NXE intro montage, where the prompt read `A Select`.
 *
 * The caption is a judgement, and it is the one piece of chrome here that is
 * not a copy. `A` is right: the badge is the dashboard's own green disc and it
 * is the only prompt on screen, so the button is unambiguous. "Select" is
 * chosen over "Skip" because "Skip" is not a caption any capture of this
 * dashboard contains, and a reader who has used NXE will have read "Select" on
 * a screen that was not asking a question before. It is set in a dark green,
 * because the settled frame it stands on is the master's measured green field
 * and the dashboard's white caption is invisible on it.
 */
export const SKIP_X = px(102);
export const SKIP_Y = px(640);
export const SKIP_D = px(22);
export const SKIP_LETTER = px(12);
export const SKIP_GAP = px(7);
export const SKIP_CAPTION = "Select";

/** The caption's colour: dark green, to read on the wash's green field. */
export const SKIP_WORD = "#2e5514";

/** Every box the boot allocates, by element. */
export type LayerId = WindowId;

/** The boxes, so the allocation story is data and not a comment. */
export function bootBoxes(): Record<LayerId, Box> {
  const lockup = lockupBox();
  return {
    boot: { ...STAGE },
    wash: { ...STAGE },
    sphere: { x: SPHERE_X, y: SPHERE_Y, width: SPHERE_D, height: SPHERE_D },
    cross: {
      x: SPHERE_X + (SPHERE_D - SPHERE_D * CROSS_SPAN) / 2,
      y: SPHERE_Y + (SPHERE_D - SPHERE_D * CROSS_SPAN) / 2,
      width: SPHERE_D * CROSS_SPAN,
      height: SPHERE_D * CROSS_SPAN,
    },
    flare: {
      x: SPHERE_X + (SPHERE_D - FLARE_D) / 2,
      y: SPHERE_Y + (SPHERE_D - FLARE_D) / 2,
      width: FLARE_D,
      height: FLARE_D,
    },
    lockup: {
      x: LOCKUP_CX - ORB_BOX_D / 2,
      y: ORB_CY - ORB_BOX_D / 2,
      width: ORB_BOX_D,
      height: ORB_BOX_D,
    },
    ring: {
      x: lockup.x + (lockup.width - RING_D) / 2,
      y: RING_CY - RING_D / 2,
      width: RING_D,
      height: RING_D,
    },
    mark: {
      x: LOCKUP_CX - MARK_W / 2,
      y: MARK_Y,
      width: MARK_W,
      height: MARK_SIZE,
    },
    skip: { x: SKIP_X, y: SKIP_Y, width: SKIP_D, height: SKIP_D },
  };
}

/** The bytes a box costs as a compositor layer, `w * h * 4`. VERIFIED as arithmetic. */
export function layerBytes(box: Box): number {
  return box.width * box.height * 4;
}

/** How the layers add up, for the report and for the gate's standing cost. */
export interface BootCost {
  readonly id: LayerId;
  readonly box: Box;
  readonly mb: number;
}

/** Every allocated layer with its texture size in megabytes. */
export function bootCost(): readonly BootCost[] {
  const boxes = bootBoxes();
  return WINDOW_IDS.map((id) => {
    const box = boxes[id];
    return { id, box, mb: layerBytes(box) / (1024 * 1024) };
  });
}

/** The whole boot's standing texture cost in megabytes. */
export function bootTotalMb(): number {
  return bootCost().reduce((sum, entry) => sum + entry.mb, 0);
}
