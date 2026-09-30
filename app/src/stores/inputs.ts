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

  async function refresh(): Promise<void> {
    try {
      statuses.value = parseInputStatus(await callLuna(STATUS));
    } catch {
      statuses.value = [];
    }
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
