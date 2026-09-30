import { describe, expect, it } from "vitest";

import { formatFree, parseDevices, parseSpace, pickSpace } from "./diskSpace";

const internal = { id: "INTERNAL_STORAGE_CAMERA", kind: "internal camera" };
const usb = { id: "usb:1", kind: "usb" };

describe("storage", () => {
  it("leaves the bundled samples out of the devices", () => {
    const devices = parseDevices({
      devices: [
        { deviceId: "INTERNAL_STORAGE_CAMERA", deviceType: "internal camera" },
        { deviceId: "INTERNAL_STORAGE_SAMPLES", deviceType: "internal samples" },
        { deviceType: "usb" },
      ],
    });
    expect(devices).toEqual([internal]);
    expect(parseDevices(null)).toEqual([]);
  });

  it("reads sizes in megabytes and refuses anything odd", () => {
    expect(parseSpace(internal, { totalSpace: 5897, freeSpace: 2882 })).toEqual({
      internal: true,
      totalMb: 5897,
      freeMb: 2882,
    });
    expect(parseSpace(usb, { totalSpace: 100, freeSpace: 50 })?.internal).toBe(false);
    expect(parseSpace(usb, { totalSpace: 0, freeSpace: 0 })).toBeNull();
    expect(parseSpace(usb, { errorCode: -1 })).toBeNull();
  });

  it("prefers the largest plugged-in drive, else the TV's storage", () => {
    const tv = { internal: true, totalMb: 5897, freeMb: 2882 };
    const small = { internal: false, totalMb: 8000, freeMb: 10 };
    const big = { internal: false, totalMb: 64000, freeMb: 5000 };
    expect(pickSpace([tv, small, big])).toBe(big);
    expect(pickSpace([tv])).toBe(tv);
    expect(pickSpace([])).toBeNull();
  });

  it("writes the free space as retail did", () => {
    const at = (freeMb: number) => ({ internal: false, totalMb: 1e6, freeMb });
    expect(formatFree(at(109568))).toBe("107 GB free");
    expect(formatFree(at(2882))).toBe("2.8 GB free");
    expect(formatFree(at(640))).toBe("640 MB free");
    expect(formatFree(null)).toBe("");
  });
});
