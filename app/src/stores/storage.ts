import { defineStore } from "pinia";
import { ref } from "vue";

import { formatFree, parseDevices, parseSpace, pickSpace, type StorageSpace } from "../diskSpace";
import { callLuna } from "../luna";

const LIST = "luna://com.webos.service.attachedstoragemanager/listDevices";
const PROPERTIES = "luna://com.webos.service.attachedstoragemanager/getProperties";

/** The free space line for the System Settings tile, blank until the TV answers. */
export const useStorageStore = defineStore("storage", () => {
  const free = ref("");

  async function refresh(): Promise<void> {
    try {
      const devices = parseDevices(await callLuna(LIST));
      const spaces = await Promise.all(
        devices.map(async (device) => {
          try {
            return parseSpace(device, await callLuna(PROPERTIES, { deviceId: device.id }));
          } catch {
            return null;
          }
        }),
      );
      const next = formatFree(pickSpace(spaces.filter((s): s is StorageSpace => s !== null)));
      if (next !== free.value) free.value = next;
    } catch {
      // The line stays as it was.
    }
  }

  return { free, refresh };
});
