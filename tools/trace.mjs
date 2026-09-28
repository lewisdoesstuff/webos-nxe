#!/usr/bin/env node
/**
 * Trace a transition on the TV and break down where the frame time goes.
 *
 *   node tools/trace.mjs            # one blade switch
 *   node tools/trace.mjs --keys 13  # whatever key code you want to press
 *
 * Reads the Chromium timeline over CDP (`Tracing`), so the answer is Paint,
 * Raster, Layout or Composite — measured, not inferred. Needs Node >= 22.
 */
const argv = process.argv.slice(2);
const keyIndex = argv.indexOf("--keys");
const keyCodes = (keyIndex === -1 ? "39" : argv[keyIndex + 1]).split(",").map(Number);

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
const events = [];
let nextId = 1;
let tracingFinished = () => undefined;
const tracingDone = new Promise((resolve) => {
  tracingFinished = resolve;
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Tracing.dataCollected") {
    for (const item of message.params.value) events.push(item);
  } else if (message.method === "Tracing.tracingComplete") {
    tracingFinished();
  }
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

const start = await send("Tracing.start", {
  categories:
    "devtools.timeline,disabled-by-default-devtools.timeline,blink,compositor,toplevel,viz,loading",
});
if (start.error) {
  console.error("Tracing.start failed:", JSON.stringify(start.error));
  process.exit(1);
}
await sleep(300);

// Never press Enter blind: on a blade row it drills, but on an `app:` row it
// launches the app and takes the foreground away from us, which silently
// turns every later frame count into fiction (AGENTS.md).
const guard = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const sel = document.querySelector("[data-row].on")?.getAttribute("data-row") ?? "";
    // A retained page always leaves a warm layer behind, so only a layer
    // without that class means a page is genuinely open.
    const pageOpen = !!document.querySelector(".frame .layer:not(.warm)");
    return {
      visible: document.visibilityState === "visible",
      sel,
      pageOpen,
      unsafe: ${JSON.stringify(keyCodes)}.includes(13) && (pageOpen || sel !== "launcher-settings"),
    };
  })()`,
});
const state = guard.result?.result?.value;
if (!state?.visible) {
  console.error(
    "page is not in the foreground; a backgrounded page has no rAF, so this would be a false reading",
  );
  process.exit(1);
}
if (state.unsafe) {
  console.error(
    `refusing Enter: selected row is "${state.sel}"${state.pageOpen ? ", and a page is already open" : ""}`,
  );
  process.exit(1);
}

await send("Runtime.evaluate", {
  expression: `(() => {
    for (const code of ${JSON.stringify(keyCodes)}) {
      for (const type of ["keydown", "keyup"]) {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(e, "keyCode", { value: code });
        window.dispatchEvent(e);
      }
    }
  })()`,
});

await sleep(900);
await send("Tracing.end");
await Promise.race([tracingDone, sleep(2000)]);

// Leave the app as it was found: a drill opens a page that would make the next
// Enter launch instead of drilling.
await send("Runtime.evaluate", {
  expression: `(() => {
    if (!document.querySelector(".frame .layer:not(.warm)")) return false;
    for (const type of ["keydown", "keyup"]) {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "keyCode", { value: 27 });
      window.dispatchEvent(e);
    }
    return true;
  })()`,
});

// Trace timestamps are microseconds since the browser started, while
// performance.now() is milliseconds since this page loaded. The two clocks do
// not share an origin, so the window is taken from the trace itself: the
// capture is 1.2s long, the keypress lands just before the end, so the
// transition is the last 900ms of it.
const tMax = events.reduce((max, e) => (typeof e.ts === "number" ? Math.max(max, e.ts) : max), 0);
const t0 = tMax - 900e3;
const windowed = events.filter(
  (e) => typeof e.dur === "number" && e.dur > 0 && e.ts >= t0 && e.ts <= tMax,
);
const withDur = events.filter((e) => typeof e.dur === "number" && e.dur > 0);
console.log(
  `events in transition window: ${windowed.length} (of ${events.length}); dur>0: ${withDur.length}`,
);

// Metadata events carry thread names, which is how an event gets attributed to
// the renderer, the compositor or the GPU process.
const threadNames = new Map();
for (const e of events) {
  if (e.name === "thread_name" && e.args?.name) threadNames.set(`${e.pid}/${e.tid}`, e.args.name);
}

const byName = new Map();
for (const e of windowed) {
  const entry = byName.get(e.name) ?? { name: e.name, totalUs: 0, count: 0, maxUs: 0 };
  entry.count += 1;
  if (typeof e.dur === "number") {
    entry.totalUs += e.dur;
    entry.maxUs = Math.max(entry.maxUs, e.dur);
  }
  byName.set(e.name, entry);
}
console.log("\nlongest single events in window:");
const longest = [...windowed].sort((a, b) => b.dur - a.dur).slice(0, 8);
for (const e of longest) {
  const thread = threadNames.get(`${e.pid}/${e.tid}`) ?? `${e.pid}/${e.tid}`;
  const args = e.args ? JSON.stringify(e.args).slice(0, 240) : "";
  console.log(`  ${(e.dur / 1000).toFixed(1).padStart(7)} ms  ${e.name}  [${thread}]`);
  if (args) console.log(`           ${args}`);
}

const ranked = [...byName.values()].sort((a, b) => b.totalUs - a.totalUs);
const byThread = new Map();
for (const e of windowed) {
  const key = `${e.pid}/${e.tid}`;
  const entry = byThread.get(key) ?? {
    label: threadNames.get(key) ?? key,
    totalUs: 0,
    count: 0,
    names: new Map(),
  };
  entry.totalUs += e.dur;
  entry.count += 1;
  const child = entry.names.get(e.name) ?? { totalUs: 0, count: 0 };
  child.totalUs += e.dur;
  child.count += 1;
  entry.names.set(e.name, child);
  byThread.set(key, entry);
}
console.log("\nper-thread totals in window (summed, may overlap):");
for (const t of [...byThread.values()].sort((a, b) => b.totalUs - a.totalUs).slice(0, 6)) {
  const top = [...t.names.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs).slice(0, 5);
  console.log(
    `  ${t.label.padEnd(24)} ${(t.totalUs / 1000).toFixed(1).padStart(7)} ms  ` +
      top.map(([n, v]) => `${n}=${(v.totalUs / 1000).toFixed(1)}`).join(", "),
  );
}

console.log("\nname                             count    total ms   max ms");
for (const row of ranked.slice(0, 22)) {
  console.log(
    `${row.name.padEnd(32)} ${String(row.count).padStart(5)} ${(row.totalUs / 1000).toFixed(1).padStart(9)} ${(row.maxUs / 1000).toFixed(1).padStart(8)}`,
  );
}

socket.close();
process.exit(0);
