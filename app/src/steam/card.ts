import type { SteamFriend } from "./types";

/** The Steam capsule for a game, which stands where retail showed the last game's icon. */
export function gameArt(gameId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${gameId}/capsule_184x69.jpg`;
}

/** The friend card's content: what retail's gamercard showed, in Steam's terms. */
export interface FriendCard {
  readonly name: string;
  readonly avatar: string;
  readonly rows: readonly (readonly [label: string, value: string])[];
  readonly gameName: string;
  readonly gameArt: string;
  readonly footer: string;
  readonly items: readonly string[];
}

/** `10/25`, as retail wrote "Offline since". */
function monthDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export const CARD_ITEMS = ["View Profile", "View Games"] as const;

export function friendCard(friend: SteamFriend): FriendCard {
  const status =
    friend.state === "offline" ? "Offline" : friend.state === "play" ? "In Game" : "Online";
  const footer =
    friend.state === "offline"
      ? friend.lastSeen
        ? `Offline since ${monthDay(friend.lastSeen)}`
        : "Offline"
      : friend.game
        ? `Playing ${friend.game}`
        : "Online now";
  return {
    name: friend.name,
    avatar: friend.avatar,
    rows: [
      ["Status", status],
      ["Playing", friend.game ?? "Nothing"],
      ["Member Since", friend.since ? String(new Date(friend.since).getFullYear()) : "Unknown"],
    ],
    gameName: friend.game ?? "",
    gameArt: friend.gameId ? gameArt(friend.gameId) : "",
    footer,
    items: CARD_ITEMS,
  };
}
