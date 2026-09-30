/**
 * The free space under the System Settings tile, pure.
 *
 * `attachedstoragemanager` lists the devices and reports each one's sizes in
 * megabytes. A plugged-in drive stands for the console's hard drive when there
 * is one, otherwise the TV's own storage does.
 */

export interface StorageDevice {
  readonly id: string;
  readonly kind: string;
}

export interface StorageSpace {
  readonly internal: boolean;
  readonly totalMb: number;
  readonly freeMb: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The devices worth measuring: everything but the bundled samples. */
export function parseDevices(payload: unknown): StorageDevice[] {
  const list = (payload as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(list)) return [];
  const devices: StorageDevice[] = [];
  for (const entry of list as Record<string, unknown>[]) {
    const id = text(entry?.["deviceId"]);
    const kind = text(entry?.["deviceType"]);
    if (id === "" || kind.includes("samples")) continue;
    devices.push({ id, kind });
  }
  return devices;
}

export function parseSpace(device: StorageDevice, payload: unknown): StorageSpace | null {
  const props = payload as { totalSpace?: unknown; freeSpace?: unknown } | null;
  const total = props?.totalSpace;
  const free = props?.freeSpace;
  if (typeof total !== "number" || typeof free !== "number" || total <= 0 || free < 0) return null;
  return { internal: device.kind.includes("internal"), totalMb: total, freeMb: free };
}

/** The roomiest drive that is plugged in, else the TV's own storage. */
export function pickSpace(spaces: readonly StorageSpace[]): StorageSpace | null {
  const by = (pool: readonly StorageSpace[]) =>
    pool.reduce<StorageSpace | null>(
      (best, s) => (best && best.totalMb >= s.totalMb ? best : s),
      null,
    );
  return by(spaces.filter((s) => !s.internal)) ?? by(spaces);
}

/** "107 GB free", "2.8 GB free", "640 MB free". */
export function formatFree(space: StorageSpace | null): string {
  if (space === null) return "";
  const gb = space.freeMb / 1024;
  if (gb >= 100) return `${Math.round(gb)} GB free`;
  if (gb >= 1) return `${gb.toFixed(1)} GB free`;
  return `${Math.round(space.freeMb)} MB free`;
}
