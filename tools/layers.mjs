#!/usr/bin/env node
/**
 * List the compositor's layers, what element each one belongs to, and what it
 * costs in texture memory.
 *
 *   node tools/layers.mjs            # idle, then 60ms into a switch
 *   node tools/layers.mjs --keys 37  # which switch to make
 *
 * The TV rasterises at devicePixelRatio 2, so a layer of W x H CSS pixels holds
 * W x 2 x H x 2 x 4 bytes of RGBA. This is the answer to "what is on the GPU and
 * how big is it", read from the compositor rather than guessed from the markup.
 * Needs Node >= 22.
 */
const argv = process.argv.slice(2);
const keyIndex = argv.indexOf("--keys");
const keyCode = Number(keyIndex === -1 ? "39" : argv[keyIndex + 1]);

const host = process.env.TV_HOST ?? "192.168.1.37";
const appId = process.env.APP_ID ?? "ooo.lew.blades";
const endpoint = `http://${host}:9998`;

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const page = targets.find((t) => t.url?.includes(appId));
if (!page?.webSocketDebuggerUrl) {
  console.error(`no CDP target for ${appId}`);
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
let announced = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "LayerTree.layerTreeDidChange") announced = message.params.layers ?? [];
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

await send("Page.enable");
await send("Page.bringToFront");
await send("Page.setWebLifecycleState", { state: "active" });
await send("DOM.enable");
await send("LayerTree.enable");

const dprResult = await send("Runtime.evaluate", { expression: "window.devicePixelRatio" });
const dpr = dprResult.result?.result?.value ?? 2;

const nodeLabels = new Map();

async function labelFor(layer) {
  if (!layer.backendNodeId) return layer.name || "(root)";
  if (!nodeLabels.has(layer.backendNodeId)) {
    const response = await send("DOM.describeNode", { backendNodeId: layer.backendNodeId });
    const node = response.result?.node;
    const attrs = node?.attributes ?? [];
    const idIndex = attrs.indexOf("id");
    const classIndex = attrs.indexOf("class");
    const id = idIndex >= 0 ? attrs[idIndex + 1] : "";
    const className = classIndex >= 0 ? attrs[classIndex + 1] : "";
    const selector = node
      ? `${node.nodeName.toLowerCase()}${id ? `#${id}` : ""}${
          className ? `.${className.split(" ").filter(Boolean).join(".")}` : ""
        }`
      : `node#${layer.backendNodeId}`;
    nodeLabels.set(layer.backendNodeId, selector);
  }
  return nodeLabels.get(layer.backendNodeId);
}

async function report(label) {
  const response = await send("LayerTree.getLayerTree");
  const layers = response.result?.layers ?? announced ?? [];
  const rows = [];
  for (const layer of layers) {
    if (layer.drawsContent === false) continue;
    const w = layer.width ?? layer.bounds?.width ?? 0;
    const h = layer.height ?? layer.bounds?.height ?? 0;
    if (w <= 0 || h <= 0) continue;
    rows.push({
      name: await labelFor(layer),
      size: `${Math.round(w)}x${Math.round(h)}`,
      mb: +((w * dpr * (h * dpr) * 4) / 1048576).toFixed(1),
      paints: layer.paintCount ?? 0,
    });
  }
  rows.sort((a, b) => b.mb - a.mb);
  const totalMb = +rows.reduce((sum, row) => sum + row.mb, 0).toFixed(1);

  console.log(`\n${label}  (dpr ${dpr}: ${rows.length} drawing layers, ~${totalMb} MB)`);
  console.log(
    `  ${"element".padEnd(42)} ${"bounds".padStart(10)} ${"MB".padStart(7)} ${"paints".padStart(7)}`,
  );
  for (const row of rows.slice(0, 20)) {
    console.log(
      `  ${row.name.slice(0, 42).padEnd(42)} ${row.size.padStart(10)} ${String(row.mb).padStart(7)} ${String(row.paints).padStart(7)}`,
    );
  }

  const byName = new Map();
  for (const row of rows) {
    const key = row.name.replace(/\.(in|out|drilling|fade|sliding|front|back)\b/g, "");
    const entry = byName.get(key) ?? { name: key, count: 0, mb: 0 };
    entry.count += 1;
    entry.mb += row.mb;
    byName.set(key, entry);
  }
  console.log("\n  by element (count, total MB):");
  for (const entry of [...byName.values()].sort((a, b) => b.count - a.count)) {
    console.log(
      `    ${entry.name.slice(0, 40).padEnd(40)} x${String(entry.count).padStart(3)}  ${entry.mb.toFixed(1).padStart(6)} MB`,
    );
  }
}

await sleep(400);
await report("idle");

// Same guard as trace.mjs: Enter on an `app:` row launches an app and steals
// the foreground, which would make the snapshot after it meaningless.
const guard = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const sel = document.querySelector("[data-row].on")?.getAttribute("data-row") ?? "";
    const pageOpen = !!document.querySelector(".frame .layer:not(.warm)");
    return {
      visible: document.visibilityState === "visible",
      unsafe: ${keyCode} === 13 && (pageOpen || sel !== "launcher-settings"),
      sel,
    };
  })()`,
});
const state = guard.result?.result?.value;
if (!state?.visible || state.unsafe) {
  console.error(
    state?.visible
      ? `refusing Enter: selected row is "${state.sel}"${state.pageOpen ? ", page open" : ""}`
      : "page is not in the foreground; skipping",
  );
  socket.close();
  process.exit(1);
}

await send("Runtime.evaluate", {
  expression: `(() => {
    for (const type of ["keydown", "keyup"]) {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "keyCode", { value: ${keyCode} });
      window.dispatchEvent(e);
    }
  })()`,
});

await sleep(60);
await report("60ms into a switch");

await sleep(400);
socket.close();
process.exit(0);
