import { describe, expect, it } from "vitest";

import {
  choicesFor,
  detailControl,
  EMPTY_TV,
  humanize,
  infoRows,
  optionsFrom,
  stepTvValue,
  tvDef,
  tvValue,
  TV_PAGES,
  type TvDef,
  type TvSnapshot,
} from "./tvSettings";

function def(id: string): TvDef {
  const found = tvDef(id);
  if (!found) throw new Error(`no such key ${id}`);
  return found;
}

function snap(over: Partial<TvSnapshot>): TvSnapshot {
  return { ...EMPTY_TV, ...over };
}

describe("tv pages", () => {
  it("generate a page for each group, none empty", () => {
    expect(TV_PAGES.length).toBeGreaterThan(4);
    for (const page of TV_PAGES) expect(page.defs.length).toBeGreaterThan(0);
  });

  it("leave out anything that resets, tests or calibrates", () => {
    const keys = TV_PAGES.flatMap((page) => page.defs.map((entry) => entry.key));
    expect(keys.some((key) => /reset|test|wizard|calib|factory/i.test(key))).toBe(false);
  });

  it("words keys and values", () => {
    expect(humanize("energySavingAutoMin")).toBe("Energy Saving Auto Min");
    expect(humanize("hdrDynamicToneMapping")).toBe("HDR Dynamic Tone Mapping");
    expect(def("picture.backlight").title).toBe("OLED Pixel Brightness");
  });
});

describe("tv controls", () => {
  const backlight = def("picture.backlight");
  const avSync = def("sound.avSync");
  const output = def("sound.soundOutput");

  it("read a dash before the TV has answered", () => {
    expect(tvValue(backlight, EMPTY_TV)).toBe("—");
    expect(stepTvValue(backlight, EMPTY_TV, 1)).toBeNull();
    expect(detailControl(backlight, EMPTY_TV)).toBeNull();
  });

  it("flip a toggle whichever way it is pressed", () => {
    const on = snap({ values: { "sound.avSync": "on" } });
    expect(stepTvValue(avSync, on, 1)).toBe("off");
    expect(stepTvValue(avSync, on, -1)).toBe("off");
    expect(detailControl(avSync, on)).toEqual({ kind: "toggle", on: true });
  });

  it("move a slider by its step and stop at both ends", () => {
    const tv = snap({
      values: { "picture.backlight": 98 },
      ranges: { "picture.backlight": { min: 0, max: 100, step: 5 } },
    });
    expect(stepTvValue(backlight, tv, 1)).toBe(100);
    const top = snap({
      values: { "picture.backlight": 100 },
      ranges: { "picture.backlight": { min: 0, max: 100, step: 5 } },
    });
    expect(stepTvValue(backlight, top, 1)).toBeNull();
    expect(stepTvValue(backlight, top, -5)).toBe(75);
    expect(detailControl(backlight, top)).toEqual({ kind: "slider", fill: 1, text: "100" });
  });

  it("write the type the TV reported", () => {
    const tv = snap({
      values: { "picture.brightness": "50" },
      ranges: { "picture.brightness": { min: 0, max: 100, step: 1 } },
    });
    expect(stepTvValue(def("picture.brightness"), tv, 1)).toBe("51");
  });

  it("step a choice along its options and wrap", () => {
    const tv = snap({ values: { "sound.soundOutput": "external_optical" } });
    expect(stepTvValue(output, tv, 1)).toBe("tv_speaker");
    expect(tvValue(output, snap({ values: { "sound.soundOutput": "external_arc" } }))).toBe(
      "HDMI ARC",
    );
  });

  it("offer a value the list has never heard of", () => {
    const tv = snap({ values: { "sound.soundOutput": "bt_soundbar" } });
    expect(choicesFor(output, tv)[0]?.value).toBe("bt_soundbar");
  });

  it("keep only the options the TV says are showing", () => {
    expect(
      optionsFrom([
        { value: "a", visible: true, active: true },
        { value: "b", visible: false, active: true },
        { value: "c", visible: true, active: false },
        "d",
      ]).map((option) => option.value),
    ).toEqual(["a", "d"]);
  });

  it("show a dash for a key that holds an object", () => {
    const tv = snap({ values: { "picture.backlight": { a: 1 } } });
    expect(tvValue(backlight, tv)).toBe("—");
    expect(stepTvValue(backlight, tv, 1)).toBeNull();
  });
});

describe("system rows", () => {
  it("word the volume, and mark a mute", () => {
    const rows = infoRows({ ...EMPTY_TV, volume: 9, muted: true, model: "OLED65" });
    expect(rows.find((row) => row.id === "volume")?.value).toBe("9 (muted)");
    expect(rows.find((row) => row.id === "model")?.value).toBe("OLED65");
    expect(rows.find((row) => row.id === "firmware")?.value).toBe("—");
  });
});
