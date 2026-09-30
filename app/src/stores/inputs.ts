import { defineStore } from "pinia";
import { ref } from "vue";

import { callLuna } from "../luna";
import { parseInputStatus, type InputStatus } from "../preview/live";

const STATUS = "luna://com.webos.service.eim/getAllInputStatus";

/** How often the ports are looked at while the Inputs channel is on screen. */
const POLL_MS = 4000;

/** Which HDMI ports have a device and a picture, read while the Inputs channel is up. */
export const useInputsStore = defineStore("inputs", () => {
  const statuses = ref<InputStatus[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;

  /** Only replaces the list when it changed, so the panes are not rebuilt by a poll that found nothing new. */
  async function refresh(): Promise<void> {
    let next: InputStatus[] = [];
    try {
      next = parseInputStatus(await callLuna(STATUS));
    } catch {
      next = [];
    }
    if (JSON.stringify(next) !== JSON.stringify(statuses.value)) statuses.value = next;
  }

  function watch(active: boolean): void {
    if (active && timer === null) {
      void refresh();
      timer = setInterval(() => void refresh(), POLL_MS);
    } else if (!active && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { statuses, refresh, watch };
});
