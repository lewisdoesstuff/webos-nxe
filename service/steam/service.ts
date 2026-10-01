import { STEAM_METHODS } from "../../app/src/steam/types.ts";
import { createLiveBackend } from "./index.ts";

/**
 * The webOS JS service the app reaches over Luna as `luna://ooo.lew.nxe.steam/<method>`.
 * Every reply is `{ returnValue, result }`; a failure is `{ returnValue: false, errorText }`.
 * The refresh token lives in this process's data directory and never crosses Luna.
 */
interface Message {
  payload?: { steamId?: string };
  respond(payload: Record<string, unknown>): void;
}
interface ServiceHandle {
  register(name: string, handler: (message: Message) => void): void;
}

const Service = require("webos-service") as new (id: string) => ServiceHandle;

/**
 * The service runs in its own jail, whose root is writable and whose /var is not, so this path is inside the service's sandbox and
 * nowhere else on the TV. It is fixed rather than built from `__dirname`, which the
 * bundler turns into the build machine's source path.
 */
const JAIL_DATA = "/nxe-steam";

const service = new Service("ooo.lew.nxe.steam");
const backend = createLiveBackend(process.env["NXE_STEAM_DIR"] ?? JAIL_DATA);

for (const method of STEAM_METHODS) {
  service.register(method, (message) => {
    const call =
      method === "games"
        ? backend.games(String(message.payload?.steamId ?? ""))
        : backend[method]();
    call.then(
      (result) => message.respond({ returnValue: true, result: result ?? null }),
      (error: unknown) =>
        message.respond({
          returnValue: false,
          errorText: error instanceof Error ? error.message : String(error),
        }),
    );
  });
}
