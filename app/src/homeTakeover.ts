import { callLuna } from "./luna";

/** Homebrew Channel's elevated shell, the only way the page reaches root. */
export const EXEC_URI = "luna://org.webosbrew.hbchannel.service/exec";

const KEYFILTER = "/usr/lib/qml/KeyFilters/systemUi.js";
const SCRIPT = "/var/lib/webosbrew/nxe/service/tactics/3-keyfilter.sh";
const CUSTOMHOME_HOOK = "/var/lib/webosbrew/init.d/49-custom-homescreen";
export const APP_ID = "ooo.lew.nxe";

/** Counts our app id in the keyfilter the TV reads, which is non-zero once the patched copy is mounted. */
export const ARMED_COMMAND = `grep -c '"${APP_ID}"' ${KEYFILTER}`;

/**
 * Arms the keyfilter patch and restarts sam, which takes about 90 seconds. It
 * refuses while the third-party home hook is live, and when the script was
 * never synced to the TV, rather than half arming.
 */
export const ARM_COMMAND = [
  `test -f ${SCRIPT}`,
  `! test -e ${CUSTOMHOME_HOOK}`,
  `BLADES_APP_ID=${APP_ID} sh ${SCRIPT} arm`,
  "/sbin/restart sam",
].join(" && ");

interface ExecReply {
  stdoutString?: string;
}

/** Whether the TV's Home key already goes to this app. Null when the elevated shell cannot be reached. */
export async function homeArmed(): Promise<boolean | null> {
  try {
    const reply = await callLuna<ExecReply>(EXEC_URI, { command: ARMED_COMMAND });
    const count = Number.parseInt((reply.stdoutString ?? "").trim(), 10);
    return Number.isNaN(count) ? null : count > 0;
  } catch {
    return null;
  }
}

/** Runs the takeover. Resolves true when the commands ran, false when they were refused. */
export async function armHome(): Promise<boolean> {
  try {
    await callLuna(EXEC_URI, { command: ARM_COMMAND });
    return true;
  } catch {
    return false;
  }
}

const AUTOSTART = "/var/lib/webosbrew/nxe/service/autostart.sh";
const BOOT_HOOK = "/var/lib/webosbrew/init.d/60-blades-homekey";

export const HOOK_COMMAND = `test -L ${BOOT_HOOK} && echo 1 || echo 0`;

/** Links the autostart script into init.d. It re-arms and restarts sam on every boot, and does nothing if the patch no longer applies. */
export const ENABLE_HOOK_COMMAND = `test -f ${AUTOSTART} && chmod +x ${AUTOSTART} && ln -sf ${AUTOSTART} ${BOOT_HOOK}`;

/** Whether the boot hook is in place. Null when the elevated shell cannot be reached. */
export async function bootHookEnabled(): Promise<boolean | null> {
  try {
    const reply = await callLuna<ExecReply>(EXEC_URI, { command: HOOK_COMMAND });
    const out = (reply.stdoutString ?? "").trim();
    return out === "1" ? true : out === "0" ? false : null;
  } catch {
    return null;
  }
}

export async function enableBootHook(): Promise<boolean> {
  try {
    await callLuna(EXEC_URI, { command: ENABLE_HOOK_COMMAND });
    return true;
  } catch {
    return false;
  }
}

const LAUNCH_SCRIPT = "/var/lib/webosbrew/nxe/service/launch-at-boot.sh";
const LAUNCH_HOOK = "/var/lib/webosbrew/init.d/61-nxe-launch";

export const LAUNCH_HOOK_COMMAND = `test -L ${LAUNCH_HOOK} && echo 1 || echo 0`;

/** Links the script that opens this app after boot into init.d. */
export const ENABLE_LAUNCH_COMMAND = `test -f ${LAUNCH_SCRIPT} && chmod +x ${LAUNCH_SCRIPT} && ln -sf ${LAUNCH_SCRIPT} ${LAUNCH_HOOK}`;

/** Whether the open-at-boot link is in place. Null when the elevated shell cannot be reached. */
export async function launchHookEnabled(): Promise<boolean | null> {
  try {
    const reply = await callLuna<ExecReply>(EXEC_URI, { command: LAUNCH_HOOK_COMMAND });
    const out = (reply.stdoutString ?? "").trim();
    return out === "1" ? true : out === "0" ? false : null;
  } catch {
    return null;
  }
}

export async function enableLaunchHook(): Promise<boolean> {
  try {
    await callLuna(EXEC_URI, { command: ENABLE_LAUNCH_COMMAND });
    return true;
  } catch {
    return false;
  }
}
