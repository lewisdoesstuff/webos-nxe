import { APP_ID } from "./homeTakeover";
import { callLuna } from "./luna";

const EXEC_URI = "luna://org.webosbrew.hbchannel.service/exec";
const THEMES = "/media/internal/nxe-themes";

interface ExecReply {
  stdoutString?: string;
}

/** Whether this build knows where to fetch the NXE theme from. */
export function themeDownloadable(): boolean {
  return NXE_THEME_URL !== "" && /^[0-9a-f]{64}$/.test(NXE_THEME_SHA256);
}

/** Fetches the zip, checks it against the pinned hash, and swaps it in for the installed copy. */
export function downloadCommand(url: string, sha256: string): string {
  const zip = "/tmp/nxe-theme.zip";
  return [
    "set -e",
    `mkdir -p ${THEMES}`,
    `curl -fsSL --max-time 180 -o ${zip} '${url}'`,
    `echo '${sha256}  ${zip}' | sha256sum -c - >/dev/null`,
    `rm -rf ${THEMES}/.nxe-new && mkdir ${THEMES}/.nxe-new`,
    `unzip -q ${zip} -d ${THEMES}/.nxe-new`,
    `test -f ${THEMES}/.nxe-new/nxe/theme.json`,
    `rm -rf ${THEMES}/nxe && mv ${THEMES}/.nxe-new/nxe ${THEMES}/nxe`,
    `rm -rf ${THEMES}/.nxe-new ${zip}`,
    `cd ${THEMES} && ls -d */ | tr -d / | sed 's/.*/"&"/' | paste -sd, - | sed 's/.*/[&]/' > index.json`,
    "echo ok",
  ].join(" && ");
}

/** Resolves true once the theme is on the TV. */
export async function downloadTheme(): Promise<boolean> {
  try {
    const reply = await callLuna<ExecReply>(EXEC_URI, {
      command: downloadCommand(NXE_THEME_URL, NXE_THEME_SHA256),
    });
    return (reply.stdoutString ?? "").trim().endsWith("ok");
  } catch {
    return false;
  }
}

/** Closes and reopens this app so a newly chosen theme is read. */
export async function restartApp(): Promise<void> {
  const luna = (method: string) =>
    `luna-send -n 1 -f luna://com.webos.applicationManager/${method} '{"id":"${APP_ID}"}'`;
  try {
    await callLuna<ExecReply>(EXEC_URI, {
      command: `(sleep 1; ${luna("closeByAppId")}; sleep 2; ${luna("launch")}) </dev/null >/dev/null 2>&1 &`,
    });
  } catch {
    // the theme still takes effect at the next start
  }
}
