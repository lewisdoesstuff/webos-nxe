#!/usr/bin/env node
/**
 * Screenshot the dev build at 1920x1080 and set it beside a reference frame.
 *
 *   node tools/compare.mjs --ref docs/refs/hub/focused.png --out /tmp/c.png
 *   node tools/compare.mjs --url "http://localhost:5173/?boot=2000" --ref docs/refs/boot/0120.png --out /tmp/c.png
 *   node tools/compare.mjs --keys 40,39 --wait 800 --out /tmp/shot.png
 *   node tools/compare.mjs --ref r.png --blend 0.5 --out /tmp/c.png
 *
 * Without `--ref` it writes the shot alone. With `--ref` it writes ours on the
 * left and the reference on the right, both at 1920x1080, and with `--blend`
 * a third panel of the two mixed at that weight. Needs `bun run dev` running,
 * Google Chrome, ffmpeg and Node >= 22. Headless is fine: this compares
 * pixels, not compositor layers, so it is no substitute for `tools/gate.mjs`.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};

const url = flag("--url", "http://localhost:5173/?boot=off");
const ref = flag("--ref");
const out = flag("--out", "/tmp/xne-compare.png");
const keys = (flag("--keys") ?? "").split(",").filter(Boolean).map(Number);
const waitMs = Number(flag("--wait", 1200));
const keyGapMs = Number(flag("--key-gap", 450));
const blend = flag("--blend");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "xne-compare-"));

const browser = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1920,1080",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function finish(code) {
  browser.once("exit", () => {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    process.exit(code);
  });
  browser.kill();
  return new Promise(() => {});
}

let page;
for (let attempt = 0; attempt < 50 && !page; attempt++) {
  await sleep(100);
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = targets.find((target) => target.type === "page");
  } catch {
    // Chrome is not listening yet.
  }
}
if (!page) {
  console.error("chrome did not start");
  await finish(2);
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
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url });
await sleep(waitMs);

for (const code of keys) {
  await send("Runtime.evaluate", {
    expression: `(() => {
      for (const type of ["keydown", "keyup"]) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "keyCode", { value: ${code} });
        window.dispatchEvent(event);
      }
    })()`,
  });
  await sleep(keyGapMs);
}
if (keys.length > 0) await sleep(waitMs);

const shot = await send("Page.captureScreenshot", { format: "png" });
const data = shot.result?.data;
if (!data) {
  console.error("no screenshot", JSON.stringify(shot.error ?? shot));
  await finish(2);
}

if (!ref) {
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`wrote ${out}`);
  await finish(0);
}

const ours = join(profile, "ours.png");
writeFileSync(ours, Buffer.from(data, "base64"));
const fit =
  "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2";
const graph =
  blend === null
    ? `[0:v]${fit}[a];[1:v]${fit}[b];[a][b]hstack=inputs=2`
    : `[0:v]${fit},split[a][a2];[1:v]${fit},split[b][b2];` +
      `[a2][b2]blend=all_mode=normal:all_opacity=${Number(blend)}[m];[a][b][m]hstack=inputs=3`;
const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-i",
    ours,
    "-i",
    ref,
    "-filter_complex",
    graph,
    "-frames:v",
    "1",
    out,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) await finish(2);
console.log(`wrote ${out} (ours | reference${blend === null ? "" : " | blend"})`);
await finish(0);
