import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { TokenStore } from "./core";

/** The refresh token in a file only its owner can read. */
export function fileTokenStore(path: string): TokenStore {
  return {
    async read() {
      try {
        const token = (await readFile(path, "utf8")).trim();
        return token === "" ? null : token;
      } catch {
        return null;
      }
    },
    async write(token) {
      if (token === null) {
        await rm(path, { force: true });
        return;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, token, { mode: 0o600 });
    },
  };
}
