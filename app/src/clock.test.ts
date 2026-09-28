import { describe, expect, it } from "vitest";

import { readClock } from "./clock";

/** Local-time Date, since readClock reads local hours and we assert on them. */
const at = (hour: number, minute = 0, day = 15, monthIndex = 8) =>
  new Date(2026, monthIndex, day, hour, minute, 0);

describe("readClock", () => {
  it("pads the minutes", () => {
    expect(readClock(at(9, 5)).minutes).toBe("05");
    expect(readClock(at(9, 45)).minutes).toBe("45");
  });

  it("uses 24-hour hours by default", () => {
    expect(readClock(at(9)).hours).toBe("9");
    expect(readClock(at(13)).hours).toBe("13");
    expect(readClock(at(0)).hours).toBe("0");
  });

  it("converts to 12-hour with am/pm when asked", () => {
    expect(readClock(at(13), { twelveHour: true }).hours).toBe("1");
    expect(readClock(at(13), { twelveHour: true }).ampm).toBe("pm");
    expect(readClock(at(0), { twelveHour: true }).hours).toBe("12");
    expect(readClock(at(0), { twelveHour: true }).ampm).toBe("am");
    expect(readClock(at(12), { twelveHour: true }).hours).toBe("12");
  });

  it("reports the month as a short name and the day unpadded", () => {
    const reading = readClock(at(9, 0, 3, 0));
    expect(reading.month).toBe("Jan");
    expect(reading.day).toBe("3");
  });

  it("picks the greeting by the hour, with the night window wrapping midnight", () => {
    // Bento's boundaries: night is >=23 or <6, checked first.
    expect(readClock(at(23)).greeting.trim()).toBe("Sweet dreams,");
    expect(readClock(at(2)).greeting.trim()).toBe("Sweet dreams,");
    expect(readClock(at(5, 59)).greeting.trim()).toBe("Sweet dreams,");
    expect(readClock(at(6)).greeting.trim()).toBe("Good morning,");
    expect(readClock(at(11, 59)).greeting.trim()).toBe("Good morning,");
    expect(readClock(at(12)).greeting.trim()).toBe("Good afternoon,");
    expect(readClock(at(16, 59)).greeting.trim()).toBe("Good afternoon,");
    expect(readClock(at(17)).greeting.trim()).toBe("Good evening,");
    expect(readClock(at(22, 59)).greeting.trim()).toBe("Good evening,");
  });

  it("keeps a trailing space so a name can follow directly", () => {
    expect(readClock(at(9)).greeting.endsWith(" ")).toBe(true);
  });

  it("accepts custom greetings without losing the defaults", () => {
    const reading = readClock(at(9), { greetings: { morning: "Morning," } });
    expect(reading.greeting.trim()).toBe("Morning,");
    // An unspecified window still falls back.
    expect(readClock(at(20), { greetings: { morning: "Morning," } }).greeting.trim()).toBe(
      "Good evening,",
    );
  });
});
