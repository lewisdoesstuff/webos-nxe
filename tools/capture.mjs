#!/usr/bin/env node
/**
 * Drive the TV page and capture it in one CDP session.
 *
 *   node tools/capture.mjs --shot /tmp/s.png
 *   node tools/capture.mjs --keys 39,39 --state --shot /tmp/s.png
 *   node tools/capture.mjs --keys 39 --burst 6 --interval 45 --shot /tmp/s
 *   node tools/capture.mjs --state
 *
 * Key codes: 37 left, 38 up, 39 right, 40 down, 13 enter, 461 back.
 *
 * `Page.captureScreenshot` on this firmware answers with the previously
 * presented frame, so a frame is primed before the keys go out and the shot
 * that matters is never the first. `--single` skips the trailing pair, for
 * catching an animation mid-flight. Needs Node >= 22 for the global WebSocket.
 */
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};

const keys = (flag("--keys") ?? "").split(",").filter(Boolean).map(Number);
const waitMs = Number(flag("--wait") ?? 350);
const shotPath = flag("--shot");
const burst = Number(flag("--burst") ?? 0);
const interval = Number(flag("--interval") ?? 45);
const wantState = argv.includes("--state");
const host = process.env.TV_HOST ?? "192.168.1.37";
const appId = process.env.APP_ID ?? "ooo.lew.xne";
const endpoint = `http://${host}:9998`;

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const page = targets.find((target) => target.url?.includes(appId));
if (!page?.webSocketDebuggerUrl) {
  console.error(`no CDP target for ${appId} on ${host}`);
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function snap() {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  return shot.result?.data ?? null;
}

await send("Runtime.enable");
await send("Page.enable");
// WAM leaves the renderer throttled, so CDP keeps returning the last frame it
// produced. Bringing the page to the front makes it paint again.
await send("Page.bringToFront");
await send("Page.setWebLifecycleState", { state: "active" });

await snap();

if (keys.length > 0) {
  await send("Runtime.evaluate", {
    expression: `(() => {
      const codes = ${JSON.stringify(keys)};
      for (const code of codes) {
        for (const type of ["keydown", "keyup"]) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, "keyCode", { value: code });
          window.dispatchEvent(event);
        }
      }
    })()`,
  });
}

await sleep(waitMs);

if (wantState) {
  const state = await send("Runtime.evaluate", {
    expression: `(() => ({
      blade: window.bladesDebug?.blades.bladeId.value,
      domTitle: document.querySelector("h1")?.textContent,
      row: window.bladesDebug?.blades.selected.value?.label,
      rows: window.bladesDebug?.blades.rows.value.length,
      apps: window.bladesDebug?.apps.launchPoints.length,
      status: window.bladesDebug?.apps.status,
      error: window.bladesDebug?.apps.error
    }))()`,
    returnByValue: true,
  });
  console.log(JSON.stringify(state.result?.result?.value ?? state, null, 2));
}

if (shotPath && burst > 0) {
  const { writeFileSync } = await import("node:fs");
  for (let index = 0; index < burst; index++) {
    const data = await snap();
    if (data) writeFileSync(`${shotPath}-${index}.png`, Buffer.from(data, "base64"));
    await sleep(interval);
  }
  console.log(`wrote ${burst} frames to ${shotPath}-*.png`);
} else if (shotPath) {
  if (!argv.includes("--single")) {
    await snap();
    await sleep(250);
  }
  const data = await snap();
  if (!data) {
    console.error("screenshot failed");
    process.exit(1);
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync(shotPath, Buffer.from(data, "base64"));
  console.log(`wrote ${shotPath}`);
}

socket.close();
process.exit(0);
