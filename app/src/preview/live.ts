/**
 * Live input previews: when a video element may take the place of the focused
 * input pane's icon, and which source it plays.
 *
 * Pure. The video is a plane the TV composes, not a texture, so it is only ever
 * up when the hub has stood still on an HDMI pane the TV says has a signal, and
 * it is taken down the moment anything moves.
 */

/** One HDMI port as the TV's input service reports it. */
export interface InputStatus {
  readonly port: number;
  readonly label: string;
  readonly connected: boolean;
  readonly signal: boolean;
}

/** The pane's picture area, in the frame's 1080p pixels: 16:9 above the name. */
export const LIVE_BOX = { x: 181, y: 412, width: 560, height: 315 } as const;

/** `com.webos.app.hdmi2` is port 2. */
export function hdmiPort(appId: string): number | null {
  const match = /^com\.webos\.app\.hdmi(\d)$/.exec(appId);
  return match ? Number(match[1]) : null;
}

/** The input service's reply, reduced to the fields the previews use. */
export function parseInputStatus(reply: unknown): InputStatus[] {
  const devices = (reply as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(devices)) return [];
  const out: InputStatus[] = [];
  for (const raw of devices) {
    const device = raw as {
      port?: unknown;
      label?: unknown;
      connected?: unknown;
      hdmiSignalExist?: unknown;
    };
    if (typeof device.port !== "number") continue;
    out.push({
      port: device.port,
      label: typeof device.label === "string" ? device.label : `HDMI ${device.port}`,
      connected: device.connected === true,
      signal: device.hdmiSignalExist === true,
    });
  }
  return out;
}

export interface LiveInputs {
  readonly enabled: boolean;
  /** The channel on screen, by section id. */
  readonly channel: string;
  /** The focused pane's item id, or null. */
  readonly itemId: string | null;
  /** Nothing has moved for a moment. */
  readonly settled: boolean;
  /** A page, the Guide or the settings screen is over the hub. */
  readonly covered: boolean;
  readonly statuses: readonly InputStatus[];
}

export interface LiveTarget {
  readonly port: number;
  readonly src: string;
}

export function liveTarget(state: LiveInputs): LiveTarget | null {
  if (!state.enabled || !state.settled || state.covered) return null;
  if (state.channel !== "inputs" || state.itemId === null) return null;
  const port = hdmiPort(state.itemId);
  if (port === null) return null;
  const status = state.statuses.find((entry) => entry.port === port);
  if (!status || !status.connected || !status.signal) return null;
  return { port, src: `ext://hdmi:${port}` };
}

/**
 * A port's pane title with the device on it: "HDMI 2 - AVR-S760H". Left as it
 * was for a port with nothing connected, or whose device name is only the
 * port's own.
 */
export function deviceTitle(title: string, port: number, statuses: readonly InputStatus[]): string {
  const status = statuses.find((entry) => entry.port === port);
  if (!status || !status.connected) return title;
  const name = status.label.trim();
  if (name === "" || name.toLowerCase() === title.toLowerCase() || /^hdmi[ _]?\d$/i.test(name)) {
    return title;
  }
  return `${title} - ${name}`;
}

/** A row of panes with each HDMI input's device named. Items that are not ports pass through. */
export function nameInputs<T extends { readonly id: string; readonly title: string }>(
  row: readonly T[],
  statuses: readonly InputStatus[],
): T[] {
  if (statuses.length === 0) return [...row];
  return row.map((item) => {
    const port = hdmiPort(item.id);
    if (port === null) return item;
    const title = deviceTitle(item.title, port, statuses);
    return title === item.title ? item : { ...item, title };
  });
}
