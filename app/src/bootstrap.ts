import { callLuna } from "./luna";

const EXEC_URI = "luna://org.webosbrew.hbchannel.service/exec";

interface ExecReply {
  stdoutString?: string;
}

/**
 * Finishes a fresh install through Homebrew Channel's root shell. Resolves true
 * when the app is about to restart itself, so the caller should stop starting.
 */
export async function bootstrapInstall(): Promise<boolean> {
  const dir = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, "");
  try {
    const reply = await Promise.race([
      callLuna<ExecReply>(EXEC_URI, {
        command: `test -f '${dir}/tv/bootstrap.sh' && sh '${dir}/tv/bootstrap.sh' '${dir}'`,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 4000)),
    ]);
    return (reply.stdoutString ?? "").includes("changed");
  } catch (cause) {
    console.warn("[nxe] install bootstrap skipped", cause);
    return false;
  }
}
