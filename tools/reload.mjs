#!/usr/bin/env node
/**
 * Reload the running LemmonLauncher page over CDP (port 9998 on the TV).
 *
 *   node tools/reload.mjs
 *   TV_HOST=192.168.1.40 APP_ID=ooo.lew.lemmonlauncher node tools/reload.mjs
 *
 * Reloading is enough to pick up a rebuilt bundle: apps load from `file://`
 * with no service worker, so there is nothing to invalidate (PLAN §2).
 * Needs Node >= 22 for the global WebSocket.
 */
const host = process.env.TV_HOST ?? "192.168.1.37";
const appId = process.env.APP_ID ?? "ooo.lew.lemmonlauncher";
const endpoint = `http://${host}:9998`;

const response = await fetch(`${endpoint}/json/list`).catch((cause) => {
  throw new Error(`cannot reach CDP at ${endpoint}/json/list (${cause.message})`);
});
if (!response.ok) {
  throw new Error(`CDP ${endpoint}/json/list -> HTTP ${response.status}`);
}

const targets = await response.json();
const page = targets.find((target) => target.url?.includes(appId));
if (!page?.webSocketDebuggerUrl) {
  const seen = targets.map((target) => `  ${target.type}  ${target.url}`).join("\n");
  throw new Error(`no CDP target for ${appId}. Targets:\n${seen}`);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
});

socket.send(JSON.stringify({ id: 1, method: "Page.reload", params: { ignoreCache: true } }));
socket.close();

console.log(`reloaded ${appId} on ${host}`);
