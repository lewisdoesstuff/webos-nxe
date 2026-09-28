#!/usr/bin/env node
/**
 * Evaluate an expression in the running app page on the TV, over CDP (:9998).
 *
 *   node tools/eval.mjs "document.querySelectorAll('.app-tile').length"
 *   node tools/eval.mjs --file /tmp/probe.js               # long expressions
 *   node tools/eval.mjs --console --wait 2000              # console/errors
 *   TV_HOST=192.168.1.40 node tools/eval.mjs "..."
 *
 * This is the hardware-truth counterpart to `bun run dev`: the TV's page is a
 * real `file://` origin on a weak GPU, so it is the only place latency and icon
 * behaviour can be measured honestly.
 * Needs Node >= 22 for the global WebSocket.
 */
const argv = process.argv.slice(2);
const consoleMode = argv.includes("--console");

/** Strip flags, so the expression may be passed quoted or as loose args. */
const positional = [];
let waitMs = 1500;
let fromFile = null;
let screenshotPath = null;
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index];
  if (arg === "--console") continue;
  if (arg === "--wait") {
    waitMs = Number(argv[++index] ?? 1500);
    continue;
  }
  if (arg === "--file") {
    fromFile = argv[++index];
    continue;
  }
  if (arg === "--screenshot") {
    screenshotPath = argv[++index];
    continue;
  }
  positional.push(arg);
}
let expression = positional.join(" ");
if (fromFile) {
  const { readFileSync } = await import("node:fs");
  expression = readFileSync(fromFile, "utf8");
}

const host = process.env.TV_HOST ?? "192.168.1.37";
const appId = process.env.APP_ID ?? "ooo.lew.lemmonlauncher";
const endpoint = `http://${host}:9998`;

if (!consoleMode && !expression && !screenshotPath) {
  console.error(
    "usage: node tools/eval.mjs <expression> | --file <path> | --screenshot <path> | --console [--wait ms]",
  );
  process.exit(2);
}

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const page = targets.find((target) => target.url?.includes(appId));
if (!page?.webSocketDebuggerUrl) {
  const seen = targets.map((target) => `  ${target.type}  ${target.url}`).join("\n");
  console.error(`no CDP target for ${appId} on ${host}. Targets:\n${seen}`);
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const events = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled") {
    events.push(
      `[${message.params.type}] ${message.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ")}`,
    );
  } else if (message.method === "Runtime.exceptionThrown") {
    const d = message.params.exceptionDetails;
    events.push(`[exception] ${d.exception?.description ?? d.text}`);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
});

let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

await send("Runtime.enable");
// WAM throttles the renderer hard, which stalls CSS animations and stretches
// timers. Activating the page first is what makes measurements meaningful.
await send("Page.enable");
await send("Page.bringToFront");
await send("Page.setWebLifecycleState", { state: "active" });

if (consoleMode) {
  // Nothing is replayed: enable, then let the page do whatever it does.
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  console.log(events.length ? events.join("\n") : "(no console output)");
  socket.close();
  process.exit(0);
}

if (screenshotPath) {
  // Hardware truth: what the TV is actually rendering, which no desktop browser
  // can stand in for (PLAN §12 on dpr and fonts).
  await send("Page.enable");
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const data = shot.result?.data;
  if (!data) {
    console.error(`screenshot failed: ${JSON.stringify(shot.error ?? shot)}`);
    socket.close();
    process.exit(1);
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync(screenshotPath, Buffer.from(data, "base64"));
  console.log(`wrote ${screenshotPath}`);
  socket.close();
  process.exit(0);
}

const response = await send("Runtime.evaluate", {
  expression: `(() => (${expression}))()`,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true,
});

if (response.result?.exceptionDetails) {
  console.error(response.result.exceptionDetails.exception?.description ?? "evaluation failed");
  socket.close();
  process.exit(1);
}

console.log(JSON.stringify(response.result?.result?.value, null, 2));
if (events.length) console.error(`-- console --\n${events.join("\n")}`);
socket.close();
process.exit(0);
