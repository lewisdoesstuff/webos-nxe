import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS } from "../settings";
import { settingsAction, settingsCategoryPage, settingsDetail } from "../settingsScreen";
import { EMPTY_STEAM, STEAM_QR, steamPage, type SteamView } from "./pages";

const signedIn: SteamView = {
  ...EMPTY_STEAM,
  status: { state: "signedIn", steamId: "1", name: "Me" },
  friends: [{ id: "2", name: "Ann", avatar: "a.png", state: "play", game: "Halo 3" }],
};

describe("steam settings", () => {
  it("offers sign in when signed out, and opens the QR page", () => {
    const page = settingsCategoryPage("steam", SETTINGS_DEFAULTS, [], undefined, EMPTY_STEAM)!;
    expect(page.groups[0]!.items.map((item) => item.id)).toEqual(["steam:signin"]);
    const action = settingsAction(
      page,
      { group: 0, item: 0 },
      SETTINGS_DEFAULTS,
      [],
      undefined,
      EMPTY_STEAM,
    );
    expect(action).toMatchObject({ kind: "push", page: { id: STEAM_QR } });
  });

  it("shows the QR while one is live and a caption otherwise", () => {
    const page = steamPage(STEAM_QR, EMPTY_STEAM)!;
    const live = { ...EMPTY_STEAM, qr: { state: "pending" as const, url: "https://s.team/q/1/x" } };
    expect(
      settingsDetail(page, { group: 0, item: 0 }, SETTINGS_DEFAULTS, [], undefined, live).qr,
    ).toBe("https://s.team/q/1/x");
    const expired = { ...EMPTY_STEAM, qr: { state: "expired" as const } };
    const detail = settingsDetail(
      page,
      { group: 0, item: 0 },
      SETTINGS_DEFAULTS,
      [],
      undefined,
      expired,
    );
    expect(detail.qr).toBeUndefined();
    expect(detail.description).toContain("expired");
  });

  it("lists friends with avatars and what they play", () => {
    const page = settingsCategoryPage("steam", SETTINGS_DEFAULTS, [], undefined, signedIn)!;
    expect(page.groups[0]!.items.map((item) => item.label)).toEqual(["Me", "Friends", "Sign Out"]);
    const friends = steamPage("settings:steam-friends", signedIn)!;
    expect(friends.groups[0]!.items[0]).toMatchObject({ label: "Ann", icon: "a.png" });
    const detail = settingsDetail(
      friends,
      { group: 0, item: 0 },
      SETTINGS_DEFAULTS,
      [],
      undefined,
      signedIn,
    );
    expect(detail.values).toEqual(["Playing Halo 3"]);
  });
});
