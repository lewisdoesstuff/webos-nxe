import { createVaporApp } from "@vue/runtime-vapor";
import { createPinia } from "pinia";

import { bootstrapInstall } from "./bootstrap";
import { loadDeviceSeed } from "./deviceSeed";
import { createPalmTransport, setTransport, type LunaTransport } from "./luna";
import { loadTheme } from "./theme/loader";

import "./styles/main.css";

/**
 * Pick the transport for wherever we are running.
 *
 * On the TV, WAM injects `PalmServiceBridge`, so Luna is called directly from
 * the page. In desktop Chrome it is absent, and the mock is pulled in by
 * dynamic import — which also keeps the mock (and its sample data) out of the
 * bundle the TV runs. See PLAN §4.
 */
async function selectTransport(): Promise<LunaTransport> {
  if (typeof window.PalmServiceBridge === "function") {
    return createPalmTransport();
  }
  const { mockTransport } = await import("./mock/transport");
  return mockTransport;
}

async function boot(): Promise<void> {
  setTransport(await selectTransport());
  if (typeof window.PalmServiceBridge === "function" && (await bootstrapInstall())) return;
  await loadDeviceSeed();
  await loadTheme();
  // Imported only now: modules read the active theme as they are evaluated.
  const { default: App } = await import("./App.vue");
  createVaporApp(App).use(createPinia()).mount("#app");
}

void boot().catch((cause: unknown) => {
  console.error("[nxe] boot failed", cause);
  const root = document.querySelector("#app");
  if (root) {
    root.textContent = `NXE failed to start. See the remote console. (${String(cause)})`;
  }
});
