import { get } from "node:https";

/** The TV's Node predates global `fetch`, so the two calls this backend makes go through `https`. */
export const httpsFetch = ((url: string) =>
  new Promise<Response>((resolve, reject) => {
    get(url, (reply) => {
      const parts: Buffer[] = [];
      reply.on("data", (part: Buffer) => parts.push(part));
      reply.on("end", () => {
        const status = reply.statusCode ?? 0;
        const ok = status >= 200 && status < 300;
        const text = Buffer.concat(parts).toString("utf8");
        resolve({ ok, status, json: async () => JSON.parse(text) as unknown } as Response);
      });
    }).on("error", reject);
  })) as typeof fetch;
