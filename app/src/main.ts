import { createVaporApp } from "@vue/runtime-vapor";
import { createPinia } from "pinia";

import App from "./App.vue";
import { createPalmTransport, setTransport, type LunaTransport } from "./luna";

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
  createVaporApp(App).use(createPinia()).mount("#app");
}

void boot().catch((cause: unknown) => {
  console.error("[xne] boot failed", cause);
  const root = document.querySelector("#app");
  if (root) {
    root.textContent = `XNE failed to start. See the remote console. (${String(cause)})`;
  }
});
