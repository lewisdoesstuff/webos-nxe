import { defineStore } from "pinia";

import { subscribeLuna } from "../luna";
import { toastFrom } from "../systemToasts";
import type { Toast } from "../toasts";
import { useAppsStore } from "./apps";

const TOASTS = "luna://com.webos.notification/getToastNotification";

/** Follows the TV's toasts and hands each to `show`. Needs the notifications ACL group. */
export const useSystemToastsStore = defineStore("systemToasts", () => {
  let stop: (() => void) | null = null;

  function start(show: (toast: Toast) => void): void {
    if (stop !== null) return;
    const apps = useAppsStore();
    const nameOf = (appId: string): string =>
      apps.launchPoints.find((point) => point.id === appId)?.title ?? "";
    stop = subscribeLuna(TOASTS, {}, (payload) => {
      const toast = toastFrom(payload, nameOf);
      if (toast) show(toast);
    });
  }

  return { start };
});
