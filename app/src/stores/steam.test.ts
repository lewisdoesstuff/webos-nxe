import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonaState, SteamFriend } from "../steam/types";
import type { Toast } from "../toasts";

let roster: SteamFriend[] = [];

vi.mock("../steam/client", () => ({
  pickSteam: () => ({
    status: async () => ({ state: "signedIn", steamId: "1", name: "me" }),
    friends: async () => roster,
  }),
}));

import { useSteamStore } from "./steam";

function friend(id: string, state: PersonaState): SteamFriend {
  return { id, name: id, avatar: "", state };
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  setHidden(false);
});

describe("friend online toasts", () => {
  it("toast a change seen while showing, not one that happened while away", async () => {
    const toasts: Toast[] = [];
    const steam = useSteamStore();
    roster = [friend("a", "offline"), friend("b", "offline")];
    await steam.start((toast) => toasts.push(toast));
    await steam.refreshFriends();

    roster = [friend("a", "online"), friend("b", "offline")];
    await steam.refreshFriends();
    expect(toasts.map((toast) => toast.title)).toEqual(["a"]);

    setHidden(true);
    roster = [friend("a", "online"), friend("b", "online")];
    setHidden(false);
    await steam.refreshFriends();
    expect(toasts.map((toast) => toast.title)).toEqual(["a"]);

    roster = [friend("a", "offline"), friend("b", "online")];
    await steam.refreshFriends();
    roster = [friend("a", "online"), friend("b", "online")];
    await steam.refreshFriends();
    expect(toasts.map((toast) => toast.title)).toEqual(["a", "a"]);
  });
});
