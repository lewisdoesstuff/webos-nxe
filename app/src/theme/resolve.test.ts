import { describe, expect, it } from "vitest";

import { DEFAULT_THEME } from "./default";
import { applyManifest, joinUrl } from "./resolve";
import { SOUND_KEYS } from "./types";

describe("joinUrl", () => {
  it("puts a relative path under the base", () => {
    expect(joinUrl("hack/t/nxe/", "./fonts/a.ttf")).toBe("hack/t/nxe/fonts/a.ttf");
    expect(joinUrl("hack/t/nxe", "boot/orb.png")).toBe("hack/t/nxe/boot/orb.png");
  });

  it("leaves absolute and data URLs alone", () => {
    expect(joinUrl("hack/t", "/x/y.png")).toBe("/x/y.png");
    expect(joinUrl("hack/t", "data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
  });
});

describe("applyManifest", () => {
  it("keeps every slot of the base that the manifest leaves out", () => {
    const out = applyManifest(DEFAULT_THEME, { id: "empty", name: "Empty" }, "hack/t/empty");
    expect(out.id).toBe("empty");
    expect(out.sounds).toEqual(DEFAULT_THEME.sounds);
    expect(out.cards).toEqual(DEFAULT_THEME.cards);
    expect(out.boot).toEqual(DEFAULT_THEME.boot);
    expect(out.strings).toEqual(DEFAULT_THEME.strings);
    expect(out.avatar).toBe(DEFAULT_THEME.avatar);
  });

  it("replaces only the sounds it names, under its folder", () => {
    const out = applyManifest(
      DEFAULT_THEME,
      { id: "a", name: "A", sounds: { select: "s/select.ogg" } },
      "base",
    );
    expect(out.sounds.select).toBe("base/s/select.ogg");
    for (const key of SOUND_KEYS.filter((name) => name !== "select")) {
      expect(out.sounds[key]).toBe(DEFAULT_THEME.sounds[key]);
    }
  });

  it("lays button pictures under the theme folder and keeps the rest", () => {
    const out = applyManifest(
      DEFAULT_THEME,
      { id: "a", name: "A", icons: { buttons: { a: "i/a.png" } } },
      "base",
    );
    expect(out.icons.buttons).toEqual({ a: "base/i/a.png" });
  });

  it("replaces cards by position and keeps the rest", () => {
    const out = applyManifest(DEFAULT_THEME, { id: "a", name: "A", cards: ["c/1.jpg"] }, "base");
    expect(out.cards[0]).toBe("base/c/1.jpg");
    expect(out.cards.slice(1)).toEqual(DEFAULT_THEME.cards.slice(1));
  });

  it("merges strings and boot numbers, and reads colours and texture paths", () => {
    const out = applyManifest(
      DEFAULT_THEME,
      {
        id: "a",
        name: "A",
        strings: { dashboard: "Home" },
        boot: { accent: "#ff0000" as never, orb: { url: "orb.png" } },
      },
      "base",
    );
    expect(out.strings.dashboard).toBe("Home");
    expect(out.strings.channels).toEqual(DEFAULT_THEME.strings.channels);
    expect(out.boot.accent).toEqual([1, 0, 0]);
    expect(out.boot.orb.url).toBe("base/orb.png");
    expect(out.boot.orb.rx).toBe(DEFAULT_THEME.boot.orb.rx);
  });

  it("replaces a font of the same family and weight and adds new ones", () => {
    const under = applyManifest(
      DEFAULT_THEME,
      { id: "p", name: "P", fonts: [{ family: "Face", src: "a.ttf", weight: 400 }] },
      "p",
    );
    const out = applyManifest(
      under,
      {
        id: "c",
        name: "C",
        fonts: [
          { family: "Face", src: "b.ttf", weight: 400 },
          { family: "Face", src: "bold.ttf", weight: 700 },
        ],
      },
      "c",
    );
    expect(out.fonts.map((font) => font.src)).toEqual(["c/b.ttf", "c/bold.ttf"]);
  });

  it("lets a theme build on another", () => {
    const parent = applyManifest(
      DEFAULT_THEME,
      { id: "p", name: "P", cssVars: { "--a": "1" }, avatar: "me.glb" },
      "p",
    );
    const child = applyManifest(parent, { id: "c", name: "C", cssVars: { "--b": "2" } }, "c");
    expect(child.cssVars).toEqual({ "--a": "1", "--b": "2" });
    expect(child.avatar).toBe("p/me.glb");
    expect(child.id).toBe("c");
  });
});
