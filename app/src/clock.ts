import { computed, ref, type ComputedRef } from "vue";

/**
 * Clock, date and greeting, ported from `bento-next`'s `useClock`.
 *
 * `readClock` is pure so the boundaries are testable; `useClock` is the thin
 * ticking wrapper around it.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface Greetings {
  morning: string;
  afternoon: string;
  evening: string;
  night: string;
}

export interface ClockReading {
  hours: string;
  minutes: string;
  ampm: string;
  month: string;
  day: string;
  /** Includes its trailing space, so the greeter's name can follow directly. */
  greeting: string;
}

export interface ClockOptions {
  twelveHour?: boolean;
  greetings?: Partial<Greetings>;
}

const DEFAULT_GREETINGS: Greetings = {
  morning: "Good morning,",
  afternoon: "Good afternoon,",
  evening: "Good evening,",
  night: "Sweet dreams,",
};

export function readClock(date: Date, options: ClockOptions = {}): ClockReading {
  const hour = date.getHours();
  const greetings = { ...DEFAULT_GREETINGS, ...options.greetings };

  // Bento's boundaries, in its own order: the night window wraps midnight, so it
  // is checked first rather than as an `else`.
  const timeOfDay =
    hour >= 23 || hour < 6
      ? greetings.night
      : hour < 12
        ? greetings.morning
        : hour < 17
          ? greetings.afternoon
          : greetings.evening;

  return {
    hours: options.twelveHour ? String(hour % 12 || 12) : String(hour),
    minutes: String(date.getMinutes()).padStart(2, "0"),
    ampm: hour >= 12 ? "pm" : "am",
    month: MONTHS[date.getMonth()] ?? "",
    day: String(date.getDate()),
    greeting: `${timeOfDay} `,
  };
}

// One shared tick for every consumer, as in bento: the hero, and later the date
// and greeter, must not each run their own interval or they can disagree by a
// second. A TV page is single-page and long-lived, so the interval is never
// cleared — deliberate, and the reason this is a module singleton.
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | null = null;

function startTicking(): void {
  timer ??= setInterval(() => {
    now.value = new Date();
  }, 1000);
}

export function useClock(options: ClockOptions = {}): ComputedRef<ClockReading> {
  startTicking();
  return computed(() => readClock(now.value, options));
}
