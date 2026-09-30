import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import { pickSteam } from "../steam/client";
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

/** Steam sign-in and the friends list. The token never reaches the page. */
export const useSteamStore = defineStore("steam", () => {
  const api = shallowRef<SteamApi | null>(null);
  const status = ref<SteamStatus>({ state: "signedOut" });
  const friends = ref<readonly SteamFriend[]>([]);
  const qr = ref<QrPoll | null>(null);
  const error = ref("");
  let toast: (toast: Toast) => void = () => undefined;
  let last: readonly SteamFriend[] | null = null;
  let friendsTimer: ReturnType<typeof setInterval> | null = null;
  let qrTimer: ReturnType<typeof setTimeout> | null = null;

  function backend(): SteamApi {
    api.value ??= pickSteam();
    return api.value;
  }

  async function refreshFriends(): Promise<void> {
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

  return { status, friends, qr, error, start, beginQr, cancelQr, signOut, refreshFriends };
});
