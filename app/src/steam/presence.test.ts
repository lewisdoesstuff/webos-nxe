import { describe, expect, it } from "vitest";

import { onlineToasts, presenceLine, sortFriends } from "./presence";
import type { SteamFriend } from "./types";

const friend = (id: string, state: SteamFriend["state"], game?: string): SteamFriend => ({
  id,
  name: `F${id}`,
  avatar: "",
  state,
  ...(game ? { game } : {}),
});

describe("onlineToasts", () => {
  it("fires nothing for the first list", () => {
    expect(onlineToasts(null, [friend("1", "online")])).toEqual([]);
  });

  it("fires for a friend who was offline and is not now", () => {
    const toasts = onlineToasts([friend("1", "offline")], [friend("1", "away")]);
    expect(toasts).toEqual([{ title: "F1", body: "is online", icon: "friend" }]);
  });

  it("ignores friends already online, going offline and new to the list", () => {
    const before = [friend("1", "online"), friend("2", "online")];
    const after = [friend("1", "online"), friend("2", "offline"), friend("3", "online")];
    expect(onlineToasts(before, after)).toEqual([]);
  });
});

describe("friends list", () => {
  it("sorts online first, then by name", () => {
    const sorted = sortFriends([
      friend("b", "offline"),
      friend("z", "online"),
      friend("a", "play", "X"),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "z", "b"]);
  });

  it("names the game when there is one", () => {
    expect(presenceLine(friend("1", "play", "Halo 3"))).toBe("Playing Halo 3");
    expect(presenceLine(friend("1", "snooze"))).toBe("Away");
  });
});
