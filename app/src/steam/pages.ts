import type { ListPage } from "../pages";
import { presenceLine, stateLabel } from "./presence";
import type { QrPoll, SteamFriend, SteamStatus } from "./types";

/** What the Steam screens draw from. */
export interface SteamView {
  readonly status: SteamStatus;
  readonly friends: readonly SteamFriend[];
  readonly qr: QrPoll | null;
  readonly error: string;
}

export const EMPTY_STEAM: SteamView = {
  status: { state: "signedOut" },
  friends: [],
  qr: null,
  error: "",
};

export const STEAM_ROOT = "settings:steam";
export const STEAM_QR = "settings:steam-qr";
export const STEAM_FRIENDS = "settings:steam-friends";
export const STEAM_FRIEND = "settings:steam-friend:";

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
    id === STEAM_ROOT || id === STEAM_QR || id === STEAM_FRIENDS || id.startsWith(STEAM_FRIEND)
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
    return list(id, friend.name, [
      { id: "friend:status", label: "Status" },
      ...(friend.game ? [{ id: "friend:game", label: "Playing" }] : []),
      { id: "friend:profile", label: "View Profile" },
    ]);
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
    if (itemId === "friend:game") return { values: [friend.game ?? ""], description: "" };
    if (itemId === "friend:profile") {
      return { values: [], description: `Opens ${friend.name}'s Steam profile in the browser.` };
    }
    return { values: [stateLabel(friend)], description: "" };
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
    return itemId === "friend:profile"
      ? { url: profileUrl(pageId.slice(STEAM_FRIEND.length)) }
      : null;
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
