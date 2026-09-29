/**
 * What the avatar does while nobody touches it.
 *
 * Retail stands the avatar in one resting loop and, every few loops, plays one
 * of the console's idle clips once before settling back: it looks around,
 * shifts its weight, checks its hand, waves. A 360sona export names its clips
 * by the photo booth's captions ("Just... standing around"), and other tools
 * by the console's keys ("GenericStand5"), so both are matched: a caption
 * exactly, a key anywhere in the name. A prop's own clip ("Prop: Snow Golem")
 * is never an idle.
 *
 * Pure: the renderer asks what to play next and plays it.
 */

/** The photo booth's caption for each key, from 360sona's `photobooth-animations.json`. */
export const CAPTIONS: Readonly<Record<string, readonly string[]>> = {
  GenericStand5: ["Just... standing around"],
  GenericStand6: ["What's that down there?"],
  GenericStand7: ["Ahhh..."],
  GenericWave: ["Hello there!"],
  IdleLooksAround: ["Look around"],
  IdleShiftsWeight: ["..."],
  IdleChecksHand: ["Bling check"],
  IdleFixesShoe: ["Stretch", "Shoes!"],
  Yawn: ["*Yawn*"],
};

const PROP = /^Prop:/;

/** The resting loop, best first. */
export const REST_KEYS = ["GenericStand5", "GenericStand", "Stand"] as const;

/** The clips worth playing once between rests. */
export const IDLE_KEYS = [
  "IdleLooksAround",
  "IdleShiftsWeight",
  "IdleChecksHand",
  "IdleFixesShoe",
  "GenericStand6",
  "GenericStand7",
  "GenericWave",
  "Yawn",
] as const;

/** How many rest loops play between two idles. */
export const REST_LOOPS_MIN = 2;
export const REST_LOOPS_MAX = 4;

export interface IdlePlan {
  readonly rest: string;
  readonly idles: readonly string[];
}

export interface IdleStep {
  readonly clip: string;
  /** Rest loops still to play before the next idle; 0 while an idle plays. */
  readonly restsLeft: number;
}

function find(names: readonly string[], key: string): string | undefined {
  const captions = CAPTIONS[key] ?? [];
  return (
    names.find((name) => name === key || captions.includes(name)) ??
    names.find((name) => name.includes(key))
  );
}

/** Pick the rest loop and the idles out of whatever clips the model carries. */
export function planIdle(all: readonly string[]): IdlePlan | null {
  const names = all.filter((name) => !PROP.test(name));
  if (names.length === 0) return null;
  let rest: string | undefined;
  for (const key of REST_KEYS) {
    rest = find(names, key);
    if (rest !== undefined) break;
  }
  rest ??= names[0]!;
  const known = IDLE_KEYS.map((key) => find(names, key)).filter(
    (name): name is string => name !== undefined && name !== rest,
  );
  const idles = known.length > 0 ? [...new Set(known)] : names.filter((name) => name !== rest);
  return { rest, idles };
}

function restLoops(random: () => number): number {
  const span = REST_LOOPS_MAX - REST_LOOPS_MIN + 1;
  return REST_LOOPS_MIN + Math.min(span - 1, Math.floor(random() * span));
}

/** Where the avatar starts: resting, with a full count of loops before its first idle. */
export function firstIdle(plan: IdlePlan, random: () => number): IdleStep {
  return { clip: plan.rest, restsLeft: restLoops(random) };
}

/**
 * What plays after `step` finishes. Rest counts down, then one idle plays,
 * never the same idle twice running when there is a choice.
 */
export function nextIdle(
  plan: IdlePlan,
  step: IdleStep,
  random: () => number,
  lastIdle?: string,
): IdleStep {
  if (step.clip !== plan.rest || plan.idles.length === 0) {
    return { clip: plan.rest, restsLeft: restLoops(random) };
  }
  if (step.restsLeft > 1) return { clip: plan.rest, restsLeft: step.restsLeft - 1 };
  const pool =
    plan.idles.length > 1 && lastIdle !== undefined
      ? plan.idles.filter((name) => name !== lastIdle)
      : plan.idles;
  const clip = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
  return { clip, restsLeft: 0 };
}
