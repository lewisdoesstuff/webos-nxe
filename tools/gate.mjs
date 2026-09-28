#!/usr/bin/env node
/**
 * Gate a transition on the rule the whole design rests on: it must not allocate.
 *
 *   node tools/gate.mjs                    # arrow right, 700ms window
 *   node tools/gate.mjs --keys 37
 *   node tools/gate.mjs --at 60,150,300     # sample the layer tree at these ms
 *   node tools/gate.mjs --match localhost   # pick a CDP target by URL instead
 *   CDP_URL=http://localhost:9222 node tools/gate.mjs
 *
 * The layer set and its texture bytes are read before the key and again while
 * the transition runs. Every layer the transition will draw has to be a texture
 * that already exists, so the two snapshots must agree: no layer may appear, and
 * total bytes may not grow.
 *
 * That is a boolean, not a benchmark. Frame coverage is printed for context and
 * is deliberately not part of the verdict, because it moves fifteen points run to
 * run and a gate on a number that noisy gates on nothing. LG-XMB holds 102%
 * through a transition on this hardware with a byte-identical layer set, so a
 * coverage number is a consequence of passing, not the thing to assert.
 *
 * Needs a real compositor, so it will not run against headless Chrome, which
 * builds no layer tree at all and makes this exit 2 rather than pass. It is built
 * for the TV, which has one and a CDP endpoint on :9998. Coverage measured
 * locally is about seven times faster than the TV's and means nothing; the
 * layer set and its byte counts are geometry and do carry over.
 *
 * Exits 0 on pass, 1 on fail, 2 if the run cannot be trusted. Needs Node >= 22.
 */

const argv = process.argv.slice(2);

function flag(name, fallback) {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
}

const host = process.env.TV_HOST ?? "192.168.1.37";
const port = process.env.CDP_PORT ?? "9998";
const endpoint = process.env.CDP_URL ?? `http://${host}:${port}`;
const appId = process.env.APP_ID ?? "ooo.lew.xne";
const match = flag("match", appId);
const keyCode = Number(flag("keys", "39"));
const span = Number(flag("window", "700"));
const settle = Number(flag("settle", "500"));
const samples = flag("at", "60,150,300")
  .split(",")
  .map(Number)
  .filter((n) => Number.isFinite(n));

/** Bytes may wobble by a little rounding; a megabyte is not a real change. */
const TOLERANCE_MB = 1;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target =
  targets.find((t) => t.url?.includes(match)) ?? targets.find((t) => t.type === "page");
if (!target?.webSocketDebuggerUrl) {
  console.error(`gate: no CDP target matching "${match}" at ${endpoint}`);
  process.exit(2);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
let cached = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "LayerTree.layerTreeDidChange") cached = message.params.layers ?? [];
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

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return response.result?.result?.value;
}

await send("Page.enable");
await send("Page.bringToFront");
await send("Page.setWebLifecycleState", { state: "active" });
await send("DOM.enable");
await send("LayerTree.enable");

const dpr = (await evaluate("window.devicePixelRatio")) ?? 2;
const labels = new Map();
const repeat = new Map();

/**
 * Label a layer by its element, preferring whatever stable handle it exposes.
 *
 * Two elements both reporting as `div.frame` is how the biggest item in an
 * earlier attribution went to the wrong element, so a `data-*` attribute is read
 * before the class, and a class with no handle is numbered.
 */
async function labelFor(layer) {
  if (!layer.backendNodeId) return layer.name || "(root)";
  if (!labels.has(layer.backendNodeId)) {
    const { result } = await send("DOM.describeNode", { backendNodeId: layer.backendNodeId });
    const attrs = result?.node?.attributes ?? [];
    const at = (name) => {
      const i = attrs.indexOf(name);
      return i >= 0 ? attrs[i + 1] : "";
    };
    const node = result?.node?.nodeName.toLowerCase() ?? "node";
    const key = ["data-slot", "data-card", "id"].find((name) => at(name));
    const cls = at("class");
    let selector = key
      ? `${node}[${key}="${at(key)}"]`
      : `${node}${cls ? `.${cls.split(" ").filter(Boolean).join(".")}` : ""}`;
    if (!key) {
      const n = (repeat.get(selector) ?? 0) + 1;
      repeat.set(selector, n);
      if (n > 1) selector += `#${n}`;
    }
    labels.set(layer.backendNodeId, selector);
  }
  return labels.get(layer.backendNodeId);
}

/**
 * `LayerTree` reports a layer's width and height in **device** pixels: already
 * multiplied by `devicePixelRatio`, and unaffected by any transform on the
 * element. A `1280x720` box on this TV is a `2560x1440` layer, and a
 * `scale(1.5)` on it does not change the texture. So the texture is `w * h * 4`
 * and nothing more. The `layers.mjs` this was derived from multiplies by the dpr
 * a second time, which reports every layer four times its real size.
 */
function textureMb(w, h) {
  return +((w * h * 4) / 1048576).toFixed(2);
}

async function snapshot() {
  const { result } = await send("LayerTree.getLayerTree");
  /**
   * `getLayerTree` has been observed returning an empty result on a page whose
   * `layerTreeDidChange` events carry a full tree, so the event is the source of
   * truth and the getter is only a fallback. Preferring the getter made the gate
   * read zero layers and pass on no data at all.
   */
  const layers = cached.length ? cached : (result?.layers ?? []);
  const rows = [];
  for (const layer of layers) {
    if (layer.drawsContent === false) continue;
    const w = layer.width ?? layer.bounds?.width ?? 0;
    const h = layer.height ?? layer.bounds?.height ?? 0;
    if (w <= 0 || h <= 0) continue;
    rows.push({
      name: await labelFor(layer),
      w: Math.round(w),
      h: Math.round(h),
      mb: textureMb(w, h),
      paints: layer.paintCount ?? 0,
    });
  }
  const totalMb = +rows.reduce((sum, row) => sum + row.mb, 0).toFixed(2);
  return { rows, totalMb, byName: new Map(rows.map((row) => [row.name, row])) };
}

function table(snap, limit = 12) {
  return [...snap.rows]
    .sort((a, b) => b.mb - a.mb)
    .slice(0, limit)
    .map(
      (row) =>
        `    ${row.name.slice(0, 46).padEnd(46)} ${`${row.w}x${row.h}`.padStart(11)} ` +
        `${row.mb.toFixed(1).padStart(7)} MB  paints ${row.paints}`,
    )
    .join("\n");
}

/** A layer that nearly fills the frame without filling it is a wasted upload. */
function spansFrame(row) {
  return row.w >= 1920 * 0.9 && row.h >= 1080 * 0.9 && !(row.w >= 1920 && row.h >= 1080);
}

const visible = await evaluate("document.visibilityState");
if (visible !== "visible") {
  console.error("gate: page is not in the foreground; a backgrounded page has no rAF");
  socket.close();
  process.exit(2);
}

await sleep(settle);
const rest = await snapshot();

/**
 * A gate that passes on an empty read is worse than no gate, because it reports
 * a clean result it never measured. An empty layer tree means the page navigated
 * under us, or the tree event never arrived, and either way the run means nothing.
 */
if (rest.rows.length === 0) {
  console.error(
    "gate: read an empty layer tree, so there is nothing to compare against.\n" +
      "      The page probably navigated after the run started. Re-run it.",
  );
  socket.close();
  process.exit(2);
}

await evaluate(`(() => {
  const g = { gaps: [], frames: 0, last: null, t0: performance.now() };
  window.__gate = g;
  const tick = (t) => {
    if (g.last !== null) g.gaps.push(t - g.last);
    g.last = t;
    g.frames++;
    if (t - g.t0 < ${span}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`);

await evaluate(`(() => {
  for (const type of ["keydown", "keyup"]) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "keyCode", { value: ${keyCode} });
    window.dispatchEvent(e);
  }
  return true;
})()`);

const during = [];
for (const at of samples) {
  await sleep(at - (during.at(-1) ?? 0));
  during.push({ at, snap: await snapshot() });
}

const timing = await evaluate(
  `(() => {
    const g = window.__gate ?? { gaps: [], frames: 0 };
    const gaps = g.gaps.slice().sort((a, b) => a - b);
    return {
      frames: g.frames,
      worst: gaps.length ? gaps[gaps.length - 1] : 0,
      median: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0,
      over20: gaps.filter((x) => x > 20).length,
    };
  })()`,
);

const worst = during.reduce((a, b) => (b.snap.totalMb > a.snap.totalMb ? b : a), during[0]);
const newLayers = [];
const grown = [];
for (const { at, snap } of during) {
  for (const row of snap.rows) {
    const before = rest.byName.get(row.name);
    if (!before) {
      if (!newLayers.some((n) => n.name === row.name && n.at === at)) {
        newLayers.push({ name: row.name, at, mb: row.mb, w: row.w, h: row.h });
      }
    } else if (row.mb - before.mb > TOLERANCE_MB) {
      grown.push({ name: row.name, at, from: before.mb, to: row.mb });
    }
  }
}
const vanished = [...rest.byName.keys()].filter((name) => !worst.snap.byName.has(name));

const offLimits = worst.snap.rows.filter(spansFrame);

console.log(`\ndpr ${dpr}, key ${keyCode}, window ${span}ms, sampled at ${samples.join("/")}ms`);

const coverage =
  timing && timing.frames > 0 ? Math.round((timing.frames / (span / 16.667)) * 100) : 0;
console.log(
  `\n  frames ${timing?.frames ?? 0} in ${span}ms  (${coverage}% coverage, ` +
    `worst gap ${(timing?.worst ?? 0).toFixed(1)}ms, median ${(timing?.median ?? 0).toFixed(1)}ms, ` +
    `${timing?.over20 ?? 0} over 20ms)`,
);
console.log("  coverage is reported, not gated. The verdict below is the invariant.\n");

console.log(`  at rest   ${rest.rows.length} drawing layers, ${rest.totalMb} MB`);
console.log(
  `  peak      ${worst.at}ms into it, ${worst.snap.rows.length} layers, ${worst.snap.totalMb} MB`,
);
console.log(`\n  at rest, largest:\n${table(rest)}`);
console.log(`\n  at ${worst.at}ms, largest:\n${table(worst.snap)}`);

const delta = +(worst.snap.totalMb - rest.totalMb).toFixed(2);
const fail = [];
if (newLayers.length) {
  fail.push(`${newLayers.length} layer(s) allocated during the transition`);
}
if (delta > TOLERANCE_MB) {
  fail.push(`texture grew ${delta} MB (${rest.totalMb} -> ${worst.snap.totalMb})`);
}
if (grown.length) {
  fail.push(`${grown.length} layer(s) resized during the transition`);
}
if (offLimits.length) {
  fail.push(`${offLimits.length} layer(s) span the frame without filling it`);
}

console.log("");
if (newLayers.length) {
  console.log("  ALLOCATED DURING THE TRANSITION:");
  for (const layer of newLayers) {
    console.log(
      `    +${layer.at}ms  ${layer.name.slice(0, 46).padEnd(46)} ` +
        `${`${layer.w}x${layer.h}`.padStart(11)} ${layer.mb.toFixed(1)} MB`,
    );
  }
}
if (grown.length) {
  console.log("  RESIZED DURING THE TRANSITION:");
  for (const layer of grown) {
    console.log(
      `    ~${layer.at}ms  ${layer.name.slice(0, 46).padEnd(46)} ` +
        `${`${layer.from} -> ${layer.to}`.padStart(20)} MB`,
    );
  }
}
if (vanished.length) {
  console.log(`  gone by ${worst.at}ms (fine, if they are only covered): ${vanished.join(", ")}`);
}
if (offLimits.length) {
  console.log("  SPANS THE FRAME WITHOUT FILLING IT:");
  for (const row of offLimits) {
    console.log(`    ${row.name.slice(0, 46).padEnd(46)} ${row.w}x${row.h}  ${row.mb} MB`);
  }
}

if (fail.length) {
  console.log(`\n  FAIL  ${fail.join("; ")}\n`);
  socket.close();
  process.exit(1);
}

console.log(
  `\n  PASS  no layer allocated, no texture grown, nothing spanning the frame for nothing.\n` +
    `        ${rest.rows.length} layers and ${rest.totalMb} MB, before and during.\n`,
);
socket.close();
process.exit(0);
