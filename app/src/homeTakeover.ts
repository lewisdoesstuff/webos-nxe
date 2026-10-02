import { callLuna } from "./luna";

/** Homebrew Channel's elevated shell, the only way the page reaches root. */
export const EXEC_URI = "luna://org.webosbrew.hbchannel.service/exec";

const HOOK_DIR = "/var/lib/webosbrew/nxe/service/home-hook";
const PIDFILE = "/tmp/nxe-homehook.pid";
export const APP_ID = "ooo.lew.nxe";

/** Prints 1 while the hook controller is running, which is when the Home key goes to this app. */
export const ARMED_COMMAND = `test -r ${PIDFILE} && kill -0 $(cat ${PIDFILE}) 2>/dev/null && echo 1 || echo 0`;

/** Starts the controller, which hooks Home with no restart of any service. */
export const ARM_COMMAND = `test -f ${HOOK_DIR}/start.sh && sh ${HOOK_DIR}/start.sh`;

interface ExecReply {
  stdoutString?: string;
}

/** Whether the Home key hook is running. Null when the elevated shell cannot be reached. */
export async function homeArmed(): Promise<boolean | null> {
  try {
    const reply = await callLuna<ExecReply>(EXEC_URI, { command: ARMED_COMMAND });
    const out = (reply.stdoutString ?? "").trim();
    return out === "1" ? true : out === "0" ? false : null;
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

export const INPUT_HOOK_COMMAND = "test -d /home/root/.config/lginputhook && echo 1 || echo 0";

/** Whether LG Input Hook has been run on this TV. Null when the elevated shell cannot be reached. */
export async function inputHookPresent(): Promise<boolean | null> {
  try {
    const reply = await callLuna<ExecReply>(EXEC_URI, { command: INPUT_HOOK_COMMAND });
    const out = (reply.stdoutString ?? "").trim();
    return out === "1" ? true : out === "0" ? false : null;
  } catch {
    return null;
  }
}

const AUTOSTART = `${HOOK_DIR}/autostart.sh`;
const BOOT_HOOK = "/var/lib/webosbrew/init.d/62-nxe-homehook";

export const HOOK_COMMAND = `test -L ${BOOT_HOOK} && echo 1 || echo 0`;

/** Links the autostart script into init.d, so the controller starts with the TV. */
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
