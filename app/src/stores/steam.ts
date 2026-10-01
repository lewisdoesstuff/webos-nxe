import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import { pickSteam } from "../steam/client";
import type { GamesState } from "../steam/pages";
import { onlineToasts, sortFriends } from "../steam/presence";
import type { QrPoll, SteamApi, SteamFriend, SteamStatus } from "../steam/types";
import type { Toast } from "../toasts";

/** How often the friends list is asked for, and how often a QR is checked. */
export const FRIENDS_POLL_MS = 45_000;
export const QR_POLL_MS = 2_000;

/** `?steamPoll=<seconds>` shortens the friends poll while developing. */
function friendsPollMs(): number {
  const seconds = Number(new URLSearchParams(window.location.search).get("steamPoll"));
  return seconds > 0 ? seconds * 1000 : FRIENDS_POLL_MS;
}

function ignoreToast(): void {}

/** Steam sign-in and the friends list. The token never reaches the page. */
export const useSteamStore = defineStore("steam", () => {
  const api = shallowRef<SteamApi | null>(null);
  const status = ref<SteamStatus>({ state: "signedOut" });
  const friends = ref<readonly SteamFriend[]>([]);
  const qr = ref<QrPoll | null>(null);
  const error = ref("");
  const games = ref<Readonly<Record<string, GamesState>>>({});
  const enabled = ref(true);
  let toast: (toast: Toast) => void = ignoreToast;
  let last: readonly SteamFriend[] | null = null;
  let friendsTimer: ReturnType<typeof setInterval> | null = null;
  let qrTimer: ReturnType<typeof setTimeout> | null = null;

  function backend(): SteamApi {
    if (!enabled.value) throw new Error("Steam is off.");
    api.value ??= pickSteam();
    return api.value;
  }

  async function refreshFriends(): Promise<void> {
    // A page that is not showing has nothing to refresh, and a backgrounded one has no timers anyway.
    if (!enabled.value || document.hidden) return;
    try {
      const next = sortFriends(await backend().friends());
      for (const item of onlineToasts(last, next)) toast(item);
      last = next;
      friends.value = next;
      error.value = "";
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function startFriends(): void {
    if (friendsTimer !== null) return;
    void refreshFriends();
    friendsTimer = setInterval(() => void refreshFriends(), friendsPollMs());
  }

  function stopFriends(): void {
    if (friendsTimer !== null) clearInterval(friendsTimer);
    friendsTimer = null;
    last = null;
    friends.value = [];
    games.value = {};
  }

  /** Asks the backend who is signed in, and starts following friends if someone is. */
  async function start(onToast: (toast: Toast) => void): Promise<void> {
    toast = onToast;
    try {
      status.value = await backend().status();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      return;
    }
    if (status.value.state === "signedIn") startFriends();
  }

  /**
   * The Steam setting. Off stops the poll and the sign-in and clears what the page
   * holds, so nothing calls Steam; on asks who is signed in again.
   */
  async function setEnabled(on: boolean): Promise<void> {
    if (enabled.value === on) return;
    enabled.value = on;
    if (on) {
      await start(toast);
      return;
    }
    stopQr();
    stopFriends();
    qr.value = null;
    status.value = { state: "signedOut" };
  }

  function stopQr(): void {
    if (qrTimer !== null) clearTimeout(qrTimer);
    qrTimer = null;
  }

  async function pollQr(): Promise<void> {
    try {
      const poll = await backend().pollQr();
      qr.value = { ...poll, url: poll.url ?? qr.value?.url ?? "" };
      if (poll.state === "signedIn") {
        stopQr();
        qr.value = null;
        status.value = await backend().status();
        if (status.value.state === "signedIn") {
          toast({ title: status.value.name, body: "Signed in to Steam", icon: "xbox" });
        }
        startFriends();
        return;
      }
      if (poll.state === "expired" || poll.state === "error") return;
    } catch (cause) {
      qr.value = {
        state: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      };
      return;
    }
    qrTimer = setTimeout(() => void pollQr(), QR_POLL_MS);
  }

  /** Starts a QR sign-in and follows it until it succeeds, expires or fails. */
  async function beginQr(): Promise<void> {
    stopQr();
    try {
      qr.value = await backend().beginQr();
    } catch (cause) {
      qr.value = {
        state: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      };
      return;
    }
    if (qr.value.state === "pending") qrTimer = setTimeout(() => void pollQr(), QR_POLL_MS);
  }

  /** Fetches a friend's games, once; a page opened again shows what it has. */
  async function loadGames(steamId: string): Promise<void> {
    if (games.value[steamId]?.kind === "loaded") return;
    games.value = { ...games.value, [steamId]: { kind: "loading" } };
    try {
      const reply = await backend().games(steamId);
      games.value = {
        ...games.value,
        [steamId]: reply.hidden ? { kind: "hidden" } : { kind: "loaded", games: reply.games },
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      games.value = { ...games.value, [steamId]: { kind: "error", message } };
    }
  }

  function cancelQr(): void {
    stopQr();
    qr.value = null;
  }

  async function signOut(): Promise<void> {
    stopFriends();
    cancelQr();
    await backend().signOut();
    status.value = { state: "signedOut" };
  }

  return {
    status,
    friends,
    qr,
    error,
    games,
    enabled,
    loadGames,
    setEnabled,
    start,
    beginQr,
    cancelQr,
    signOut,
    refreshFriends,
  };
});
