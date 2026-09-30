#!/usr/bin/env node
/**
 * What does a layer on this TV actually cost?
 *
 * Injects boxes of known CSS size, forces each into its own composited layer,
 * and reads back what the compositor allocated. The question it settles is
 * whether `devicePixelRatio: 2` is real here or masked, because that decides
 * whether the app can be authored at 1920x1080 natively or has to be authored
 * at 720p and scaled up.
 *
 *   node tools/raster.mjs
 *   node tools/raster.mjs --dpr 1        force a dpr for comparison
 */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};

const host = process.env.TV_HOST ?? "192.168.1.37";
const port = process.env.CDP_PORT ?? "9998";
const endpoint = process.env.CDP_URL ?? `http://${host}:${port}`;
const appId = process.env.APP_ID ?? "ooo.lew.nxe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target =
  targets.find((t) => t.url?.includes(appId)) ?? targets.find((t) => t.type === "page");
if (!target?.webSocketDebuggerUrl) {
  console.error(`raster: no CDP target for ${appId}`);
  process.exit(2);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
let cached = [];
socket.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.id !== undefined) {
    pending.get(m.id)?.(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "LayerTree.layerTreeDidChange") cached = m.params.layers ?? [];
});
await new Promise((res, rej) => {
  socket.addEventListener("open", res, { once: true });
  socket.addEventListener("error", () => rej(new Error("CDP socket error")), { once: true });
});
const send = (method, params = {}) => {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => pending.set(id, res));
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Page.bringToFront");
await send("Page.setWebLifecycleState", { state: "active" });
await send("DOM.enable");
await send("LayerTree.enable");

const forcedDpr = flag("dpr", "");
if (forcedDpr) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: Number(forcedDpr),
    mobile: false,
  });
}

const env = await evaluate(`JSON.stringify({
  dpr: devicePixelRatio,
  inner: [innerWidth, innerHeight],
  outer: [outerWidth, outerHeight],
  screen: [screen.width, screen.height],
  docEl: [document.documentElement.clientWidth, document.documentElement.clientHeight],
})`);
const info = JSON.parse(env);

/**
 * A probe per size, each promoted so it gets its own layer. `will-change:
 * transform` is the promotion; the sizes are the thing being measured.
 */
const SIZES = [1280, 1920];
await evaluate(`(() => {
  document.getElementById("__raster")?.remove();
  const host = document.createElement("div");
  host.id = "__raster";
  host.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none";
  for (const w of ${JSON.stringify(SIZES)}) {
    const box = document.createElement("div");
    box.className = "probe";
    box.dataset.probe = String(w);
    box.style.cssText = \`position:absolute;top:0;left:0;width:\${w}px;height:\${w / 2}px;background:rgba(0,0,0,0.001);will-change:transform\`;
    host.appendChild(box);
  }
  document.body.appendChild(host);
  return true;
})()`);

await evaluate(
  "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))",
);
await sleep(400);

const { result } = await send("LayerTree.getLayerTree");
const layers = cached.length ? cached : (result?.layers ?? []);

console.log(`\n  dpr ${info.dpr}${forcedDpr ? ` (forced from ${flag("dpr", "?")})` : ""}`);
console.log(
  `  inner ${info.inner.join("x")}  outer ${info.outer.join("x")}  screen ${info.screen.join("x")}`,
);
console.log(`  documentElement ${info.docEl.join("x")}\n`);

console.log("  Every drawing layer, with both readings of its size:\n");
console.log(
  `    ${"reported".padEnd(12)} ${"as device px".padStart(14)} ${"as css px".padStart(14)}   verdict`,
);
let totalDevice = 0;
let totalCss = 0;
const rows = [];
for (const layer of layers) {
  if (layer.drawsContent === false) continue;
  const w = Math.round(layer.width ?? 0);
  const h = Math.round(layer.height ?? 0);
  if (w <= 0 || h <= 0) continue;
  const dev = +((w * h * 4) / 1048576).toFixed(2);
  const css = +((w * info.dpr * h * info.dpr * 4) / 1048576).toFixed(2);
  totalDevice += dev;
  totalCss += css;
  rows.push({ w, h, dev, css });
}
for (const r of rows.sort((a, b) => b.dev - a.dev)) {
  console.log(
    `    ${`${r.w}x${r.h}`.padEnd(12)} ${`${r.dev} MB`.padStart(14)} ${`${r.css} MB`.padStart(14)}`,
  );
}
console.log(
  `\n  total: ${totalDevice.toFixed(1)} MB if the numbers are device pixels,` +
    ` ${totalCss.toFixed(1)} MB if they are CSS pixels.\n`,
);

/**
 * The document layer settles it. A 1920x1080 CSS viewport at dpr 2 has a
 * 3840x2160 device surface, so a root layer reporting 3840x2160 means the
 * reported numbers are device pixels and the dpr is real. A root layer
 * reporting 1920x1080 means either the dpr is 1 or the numbers are CSS pixels.
 */
const root = rows.find((r) => r.w >= 1900 && r.w <= 3900 && r.h >= 1000 && r.h <= 2300);
if (root) {
  console.log(`  root layer reports ${root.w}x${root.h}.`);
  if (root.w >= 3800) {
    console.log(
      `  3840 wide is 1920 CSS x dpr 2, so the reported numbers ARE device pixels` +
        ` and the dpr is real.\n` +
        `  => authoring at 1920x1080 costs 33.2MB for one full-frame layer.`,
    );
  } else {
    console.log(
      `  1920 wide is the CSS viewport, so either the dpr is 1 here or the` +
        ` reported numbers are CSS pixels.\n` +
        `  => check before trusting either column above.`,
    );
  }
} else {
  console.log("  no root layer in the expected range; nothing to conclude from it.");
}

await evaluate('document.getElementById("__raster")?.remove()');
socket.close();
process.exit(0);
