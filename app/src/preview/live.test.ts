import { describe, expect, it } from "vitest";

import {
  deviceTitle,
  hdmiPort,
  liveTarget,
  nameInputs,
  parseInputStatus,
  type LiveInputs,
} from "./live";

const ready: LiveInputs = {
  enabled: true,
  channel: "inputs",
  itemId: "com.webos.app.hdmi2",
  settled: true,
  covered: false,
  statuses: [{ port: 2, label: "AVR", connected: true, signal: true }],
};

describe("live input previews", () => {
  it("read a port out of an input's app id", () => {
    expect(hdmiPort("com.webos.app.hdmi3")).toBe(3);
    expect(hdmiPort("com.webos.app.livetv")).toBeNull();
    expect(hdmiPort("com.webos.app.hdmi12")).toBeNull();
  });

  it("name the source for a settled pane with a signal", () => {
    expect(liveTarget(ready)).toEqual({ port: 2, src: "ext://hdmi:2" });
  });

  it("stay down unless every condition holds", () => {
    expect(liveTarget({ ...ready, enabled: false })).toBeNull();
    expect(liveTarget({ ...ready, settled: false })).toBeNull();
    expect(liveTarget({ ...ready, covered: true })).toBeNull();
    expect(liveTarget({ ...ready, channel: "apps" })).toBeNull();
    expect(liveTarget({ ...ready, itemId: "com.webos.app.livetv" })).toBeNull();
    expect(liveTarget({ ...ready, itemId: null })).toBeNull();
  });

  it("need a device and a picture on that port", () => {
    const off = (over: object) => ({
      ...ready,
      statuses: [{ port: 2, label: "AVR", connected: true, signal: true, ...over }],
    });
    expect(liveTarget(off({ signal: false }))).toBeNull();
    expect(liveTarget(off({ connected: false }))).toBeNull();
    expect(liveTarget({ ...ready, statuses: [] })).toBeNull();
  });

  it("parse the input service's reply and ignore junk", () => {
    expect(
      parseInputStatus({
        devices: [
          { port: 2, label: "AVR-S760H", connected: true, hdmiSignalExist: false },
          { label: "no port" },
        ],
      }),
    ).toEqual([{ port: 2, label: "AVR-S760H", connected: true, signal: false }]);
    expect(parseInputStatus(null)).toEqual([]);
  });
});

describe("input device names", () => {
  const statuses = [
    { port: 2, label: "AVR-S760H", connected: true, signal: false },
    { port: 1, label: "HDMI 1", connected: true, signal: true },
    { port: 3, label: "Console", connected: false, signal: false },
  ];

  it("add the device to a connected port's title", () => {
    expect(deviceTitle("HDMI 2", 2, statuses)).toBe("HDMI 2 - AVR-S760H");
  });

  it("leave a title alone when there is nothing to add", () => {
    expect(deviceTitle("HDMI 1", 1, statuses)).toBe("HDMI 1");
    expect(deviceTitle("HDMI 3", 3, statuses)).toBe("HDMI 3");
    expect(deviceTitle("HDMI 4", 4, statuses)).toBe("HDMI 4");
  });

  it("rename only the ports in a row", () => {
    const row = [
      { id: "com.webos.app.hdmi2", title: "HDMI 2" },
      { id: "com.webos.app.livetv", title: "Live TV" },
    ];
    expect(nameInputs(row, statuses).map((item) => item.title)).toEqual([
      "HDMI 2 - AVR-S760H",
      "Live TV",
    ]);
    expect(nameInputs(row, [])[0]?.title).toBe("HDMI 2");
  });
});
