import { STEAM_METHODS } from "../../app/src/steam/types";
import { createLiveBackend } from "./index";

/**
 * The webOS JS service the app reaches over Luna as `luna://ooo.lew.nxe.steam/<method>`.
 * Every reply is `{ returnValue, result }`; a failure is `{ returnValue: false, errorText }`.
 * The refresh token lives in this process's data directory and never crosses Luna.
 */
interface Message {
  respond(payload: Record<string, unknown>): void;
}
interface ServiceHandle {
  register(name: string, handler: (message: Message) => void): void;
}

const Service = require("webos-service") as new (id: string) => ServiceHandle;

const service = new Service("ooo.lew.nxe.steam");
const backend = createLiveBackend(process.env["NXE_STEAM_DIR"] ?? "/media/developer/nxe");

for (const method of STEAM_METHODS) {
  service.register(method, (message) => {
    backend[method]().then(
      (result) => message.respond({ returnValue: true, result: result ?? null }),
      (error: unknown) =>
        message.respond({
          returnValue: false,
          errorText: error instanceof Error ? error.message : String(error),
        }),
    );
  });
}
