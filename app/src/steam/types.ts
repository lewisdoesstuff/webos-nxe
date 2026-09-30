/** What the Steam backend and the page say to each other. Plain data, so it crosses Luna or HTTP unchanged. */

export type PersonaState = "offline" | "online" | "busy" | "away" | "snooze" | "trade" | "play";

export interface SteamFriend {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly state: PersonaState;
  /** The game being played, when there is one. */
  readonly game?: string;
  /** The game's Steam app id, for its capsule art. */
  readonly gameId?: string;
  /** When they last went offline, in ms. */
  readonly lastSeen?: number;
  /** When the account was made, in ms. */
  readonly since?: number;
}

export type SteamStatus =
  | { readonly state: "signedOut" }
  | { readonly state: "signedIn"; readonly steamId: string; readonly name: string };

export type QrState = "pending" | "scanned" | "signedIn" | "expired" | "error";

export interface QrPoll {
  readonly state: QrState;
  /** The challenge to draw as a QR. It changes when Steam rotates it. */
  readonly url?: string;
  readonly message?: string;
}

/** The backend's whole surface. The page holds no token: it only ever sees these shapes. */
export interface SteamApi {
  status(): Promise<SteamStatus>;
  beginQr(): Promise<QrPoll>;
  pollQr(): Promise<QrPoll>;
  friends(): Promise<readonly SteamFriend[]>;
  signOut(): Promise<void>;
}

export const STEAM_METHODS = ["status", "beginQr", "pollQr", "friends", "signOut"] as const;
export type SteamMethod = (typeof STEAM_METHODS)[number];
