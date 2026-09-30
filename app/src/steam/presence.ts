import type { Toast } from "../toasts";
import type { SteamFriend } from "./types";

/**
 * The toasts a new friends list earns over the last one: a friend who was
 * offline and is not now. The first list has nothing before it, so it earns
 * none, and a friend who is new to the list is not a friend coming online.
 */
export function onlineToasts(
  before: readonly SteamFriend[] | null,
  after: readonly SteamFriend[],
): Toast[] {
  if (before === null) return [];
  const was = new Map(before.map((friend) => [friend.id, friend.state]));
  return after
    .filter((friend) => was.get(friend.id) === "offline" && friend.state !== "offline")
    .map((friend) => ({ title: friend.name, body: "is online", icon: "friend" as const }));
}

/** Online friends first, then by name, as the friends list reads. */
export function sortFriends(friends: readonly SteamFriend[]): SteamFriend[] {
  const rank = (friend: SteamFriend): number => (friend.state === "offline" ? 1 : 0);
  return [...friends].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

const LABELS = {
  offline: "Offline",
  online: "Online",
  busy: "Busy",
  away: "Away",
  snooze: "Away",
  trade: "Online",
  play: "Online",
} as const;

/** The line under a friend: what they are playing, or how they are. */
export function presenceLine(friend: SteamFriend): string {
  return friend.game ? `Playing ${friend.game}` : LABELS[friend.state];
}
