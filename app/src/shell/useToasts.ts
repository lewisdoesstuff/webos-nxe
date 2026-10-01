import { ref } from "vue";

import { playToastSound } from "../sound";
import { useSettingsStore } from "../stores/settings";
import { advance, enqueue, EMPTY_TOASTS, TOAST_FADE_MS, TOAST_MS, type Toast } from "../toasts";

/** `?toast=friend|achievement` previews those toasts in development. */
const DEMO_TOASTS: Record<string, Toast> = {
  short: { title: "Ana", body: "is online", icon: "friend" },
  signin: { title: "NobelTech signed", body: "in to Xbox LIVE", icon: "signin" },
  friend: { title: "Halo Fan 42", body: "is online", icon: "friend" },
  achievement: {
    title: "Achievement unlocked",
    body: "100G - True Dedication",
    icon: "achievement",
  },
};

/** How long the sign-in toast waits for Steam to say who is signed in. */
const STEAM_WAIT_MS = 2500;

/** The toasts over the hub: one shown at a time, the rest queued behind it. */
export function useToasts() {
  const settings = useSettingsStore();
  const queue = ref(EMPTY_TOASTS);
  const shown = ref(false);
  const text = ref<Toast | null>(null);

  /** The toast's face, loaded before the first toast so its words are never held back by a font still arriving. */
  let font: Promise<unknown> | null = null;
  function loadFont(): Promise<unknown> {
    font ??= Promise.all([
      document.fonts.load('400 40px "Segoe UI"'),
      document.fonts.load('400 40px "Inter"'),
    ]).catch(() => undefined);
    return font;
  }

  function play(): void {
    const current = queue.value.current;
    if (current === null) return;
    void loadFont().then(() => {
      text.value = current;
      shown.value = true;
      playToastSound();
      setTimeout(() => {
        shown.value = false;
        setTimeout(() => {
          queue.value = advance(queue.value);
          play();
        }, TOAST_FADE_MS);
      }, TOAST_MS);
    });
  }

  /** Shows a toast over the hub, or queues it behind the one showing. */
  function notify(toast: Toast): void {
    if (!settings.settings.toasts) return;
    const idle = queue.value.current === null;
    queue.value = enqueue(queue.value, toast);
    if (idle && queue.value.current !== null) play();
  }

  /** The sign-in toast, once `steam` has said who is signed in or has taken too long to. */
  function signIn(name: () => string, steam: Promise<void>): void {
    const demo = DEMO_TOASTS[new URLSearchParams(window.location.search).get("toast") ?? ""];
    if (demo) {
      notify(demo);
      return;
    }
    const waited = new Promise<void>((resolve) => setTimeout(resolve, STEAM_WAIT_MS));
    void Promise.race([steam, waited]).then(() =>
      notify({ title: `${name()} signed`, body: "in to Xbox LIVE", icon: "signin" }),
    );
  }

  return { text, shown, notify, loadFont, signIn };
}
