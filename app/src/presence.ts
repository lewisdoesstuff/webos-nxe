import { callLuna } from "./luna";

/**
 * Tells sleep from backgrounding. The TV exposes no power state to this app, so
 * sleep is read off the clock: a timer that was running on screen and then did
 * not fire for a long while means the TV was suspended. Whether the app was
 * last sent to the background is kept as a file in /tmp, which a reboot wipes,
 * so a restart always counts as a power-on.
 */
const EXEC_URI = "luna://org.webosbrew.hbchannel.service/exec";
const MARKER = "/tmp/nxe-hidden";
const PROBE_MS = 1500;

export const BEAT_MS = 5000;
/** A beat this late on a visible page means the TV was suspended. */
export const SLEEP_GAP_MS = 60000;

interface ExecReply {
  stdoutString?: string;
}

function exec(command: string): Promise<ExecReply> {
  return Promise.race([
    callLuna<ExecReply>(EXEC_URI, { command }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), PROBE_MS)),
  ]);
}

/** True when the app was last sent to the background since the TV last started. */
export async function wasHiddenSinceStart(): Promise<boolean> {
  try {
    const reply = await exec(`test -f ${MARKER} && echo hidden || echo fresh`);
    return (reply.stdoutString ?? "").includes("hidden");
  } catch {
    return false;
  }
}

export function markHidden(hidden: boolean): void {
  exec(hidden ? `touch ${MARKER}` : `rm -f ${MARKER}`).catch(() => {});
}

/** True when the page was on screen at the last beat and the next one came far too late. */
export function sleptThrough(lastBeat: number, now: number, visibleAtLastBeat: boolean): boolean {
  return visibleAtLastBeat && now - lastBeat >= SLEEP_GAP_MS;
}
