import type { ListPage } from "../pages";
import { CARD_ITEMS } from "./card";
import { presenceLine } from "./presence";
import type { QrPoll, SteamFriend, SteamGame, SteamStatus } from "./types";

/** One friend's games as the page knows them. */
export type GamesState =
  | { readonly kind: "loading" }
  | { readonly kind: "hidden" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loaded"; readonly games: readonly SteamGame[] };

/** What the Steam screens draw from. */
export interface SteamView {
  readonly status: SteamStatus;
  readonly friends: readonly SteamFriend[];
  readonly qr: QrPoll | null;
  readonly error: string;
  readonly games: Readonly<Record<string, GamesState>>;
}

export const EMPTY_STEAM: SteamView = {
  status: { state: "signedOut" },
  friends: [],
  qr: null,
  error: "",
  games: {},
};

export const STEAM_ROOT = "settings:steam";
export const STEAM_QR = "settings:steam-qr";
export const STEAM_FRIENDS = "settings:steam-friends";
export const STEAM_FRIEND = "settings:steam-friend:";
export const STEAM_GAMES = "settings:steam-games:";

export function gamesPageId(friendId: string): string {
  return `${STEAM_GAMES}${friendId}`;
}

/** `12.4 hours`, `45 minutes`, or `Not played`. */
export function playtime(minutes: number): string {
  if (minutes <= 0) return "Not played";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toLocaleString("en-US")} hours`;
}

/** The page for one friend: what A on their pane opens. */
export function friendPageId(friendId: string): string {
  return `${STEAM_FRIEND}${friendId}`;
}

/** The friend's Steam profile, which the TV's browser opens. */
export function profileUrl(friendId: string): string {
  return `https://steamcommunity.com/profiles/${friendId}`;
}

export const STEAM_DESCRIPTION = "Sign in with the Steam mobile app to see your friends.";

/** The pages this module builds, by id. */
export function isSteamPage(id: string): boolean {
  return (
    id === STEAM_ROOT ||
    id === STEAM_QR ||
    id === STEAM_FRIENDS ||
    id.startsWith(STEAM_FRIEND) ||
    id.startsWith(STEAM_GAMES)
  );
}

function list(id: string, title: string, items: ListPage["groups"][number]["items"]): ListPage {
  return { kind: "list", id, title, groups: [{ id, title, items }] };
}

export function steamPage(id: string, view: SteamView): ListPage | null {
  if (id === STEAM_ROOT) {
    return view.status.state === "signedIn"
      ? list(id, "Steam", [
          { id: "steam:account", label: view.status.name },
          { id: "steam:friends", label: "Friends" },
          { id: "steam:signout", label: "Sign Out" },
        ])
      : list(id, "Steam", [{ id: "steam:signin", label: "Sign In with QR Code" }]);
  }
  if (id.startsWith(STEAM_FRIEND)) {
    const friend = view.friends.find((entry) => entry.id === id.slice(STEAM_FRIEND.length));
    if (!friend) return null;
    return list(
      id,
      friend.name,
      CARD_ITEMS.map((label) => ({ id: `friend:${label}`, label })),
    );
  }
  if (id.startsWith(STEAM_GAMES)) {
    const friendId = id.slice(STEAM_GAMES.length);
    const name = view.friends.find((entry) => entry.id === friendId)?.name ?? "Games";
    const state = view.games[friendId];
    if (state?.kind === "loaded" && state.games.length > 0) {
      return list(
        id,
        `${name}'s Games`,
        state.games.map((game) => ({
          id: `game:${game.id}`,
          label: game.name,
          ...(game.icon ? { icon: game.icon } : {}),
        })),
      );
    }
    const row =
      state === undefined || state.kind === "loading"
        ? "Loading games"
        : state.kind === "hidden"
          ? "Games are private"
          : state.kind === "error"
            ? "Could not load games"
            : "No games to show";
    return list(id, `${name}'s Games`, [{ id: "game:none", label: row }]);
  }
  if (id === STEAM_QR)
    return list(id, "Steam Sign In", [{ id: "steam:qr", label: "Scan the Code" }]);
  if (id === STEAM_FRIENDS) {
    return list(
      id,
      "Friends",
      view.friends.length === 0
        ? [{ id: "friend:none", label: "No friends to show" }]
        : view.friends.map((friend) => ({
            id: `friend:${friend.id}`,
            label: friend.name,
            ...(friend.avatar ? { icon: friend.avatar } : {}),
          })),
    );
  }
  return null;
}

/** The QR's caption for where the sign-in has got to. */
export function qrCaption(qr: QrPoll | null): string {
  if (qr === null || (qr.state === "pending" && !qr.url)) return "Getting a code from Steam.";
  if (qr.state === "scanned") return "Approve the sign-in on your phone.";
  if (qr.state === "expired") return "The code expired. Go back and try again.";
  if (qr.state === "error") return qr.message || "Steam could not be reached.";
  return "Open the Steam app, choose Steam Guard, then Scan a QR code.";
}

export interface SteamDetail {
  readonly values: readonly string[];
  readonly description: string;
  /** The challenge to draw as a QR, while one is live. */
  readonly qr?: string;
}

export function steamDetail(pageId: string, itemId: string, view: SteamView): SteamDetail {
  if (pageId === STEAM_QR) {
    const live = view.qr?.state === "pending" || view.qr?.state === "scanned";
    return {
      values: [],
      description: qrCaption(view.qr),
      ...(live && view.qr?.url ? { qr: view.qr.url } : {}),
    };
  }
  if (pageId.startsWith(STEAM_FRIEND)) {
    const friend = view.friends.find((entry) => entry.id === pageId.slice(STEAM_FRIEND.length));
    if (!friend) return { values: [], description: "" };
    return { values: [], description: "" };
  }
  if (pageId.startsWith(STEAM_GAMES)) {
    const friendId = pageId.slice(STEAM_GAMES.length);
    const state = view.games[friendId];
    const name = view.friends.find((entry) => entry.id === friendId)?.name ?? "This friend";
    if (state?.kind === "loaded") {
      const game = state.games.find((entry) => `game:${entry.id}` === itemId);
      // A friend who hides their playtime reports none for every game.
      const shown = state.games.some((entry) => entry.minutes > 0);
      if (game && shown)
        return { values: [playtime(game.minutes)], description: "Time played in all." };
      if (game) return { values: [], description: `${name} keeps their playtime private.` };
      return { values: [], description: `${name} has no games to show.` };
    }
    if (state?.kind === "hidden") {
      return {
        values: [],
        description: `${name} keeps their game details private on Steam.`,
      };
    }
    if (state?.kind === "error") return { values: [], description: state.message };
    return { values: [], description: "Asking Steam for the list." };
  }
  if (pageId === STEAM_FRIENDS) {
    const friend = view.friends.find((entry) => `friend:${entry.id}` === itemId);
    return friend
      ? { values: [presenceLine(friend)], description: "" }
      : { values: [], description: view.error || "Friends appear here once Steam has answered." };
  }
  if (itemId === "steam:signin") {
    return {
      values: [],
      description: "Shows a code to scan with the Steam mobile app. Nothing is typed on the TV.",
    };
  }
  if (itemId === "steam:account") {
    return {
      values: [view.status.state === "signedIn" ? view.status.steamId : ""],
      description: "The account this TV is signed in to.",
    };
  }
  if (itemId === "steam:friends") {
    const online = view.friends.filter((friend) => friend.state !== "offline").length;
    return {
      values: [`${online} of ${view.friends.length} online`],
      description: "Toasts announce a friend coming online.",
    };
  }
  if (itemId === "steam:signout") {
    return { values: [], description: "Forget this sign-in on the TV." };
  }
  return { values: [], description: STEAM_DESCRIPTION };
}

export type SteamOp = "signin" | "signout";

/** What `A` does on a Steam row: a deeper page, or an operation for the caller. */
export function steamAction(
  pageId: string,
  itemId: string,
  view: SteamView,
): { push: ListPage } | { op: SteamOp } | { url: string } | null {
  if (pageId.startsWith(STEAM_FRIEND)) {
    const friendId = pageId.slice(STEAM_FRIEND.length);
    if (itemId === "friend:View Profile") return { url: profileUrl(friendId) };
    if (itemId !== "friend:View Games") return null;
    const next = steamPage(gamesPageId(friendId), view);
    return next ? { push: next } : null;
  }
  if (pageId !== STEAM_ROOT) return null;
  if (itemId === "steam:signin") {
    const next = steamPage(STEAM_QR, view);
    return next ? { push: next } : null;
  }
  if (itemId === "steam:friends") {
    const next = steamPage(STEAM_FRIENDS, view);
    return next ? { push: next } : null;
  }
  if (itemId === "steam:signout") return { op: "signout" };
  return null;
}
