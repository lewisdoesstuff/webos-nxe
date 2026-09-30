import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vitest/config";

import type { SteamApi } from "./app/src/steam/types";
import { steamHandler } from "./service/steam/http";
import { createMockBackend } from "./service/steam/mock";

const root = import.meta.dirname;
const appDir = resolve(root, "app");
const outDir = resolve(root, "dist/app");

/** Files that live beside the page in `app/` but must ship at the payload root. */
const PACKAGE_FILES = ["appinfo.json", "icons"];

/**
 * `dist/app/` IS the IPK payload: the Vite output plus the app manifest and
 * icons, copied in after the bundle is written. `dist/` is gitignored, so the
 * source tree stays free of hashed assets and stale build files.
 */
function copyPackageFiles(): Plugin {
  return {
    name: "blades:copy-package-files",
    apply: "build",
    closeBundle() {
      for (const entry of PACKAGE_FILES) {
        const from = resolve(appDir, entry);
        if (!existsSync(from)) {
          this.warn(`missing package file: app/${entry}`);
          continue;
        }
        cpSync(from, resolve(outDir, entry), { recursive: true });
      }
    },
  };
}

/**
 * In dev, `hack/<absolute path>` is served from `mock-tv/`, a mirror of the
 * TV's icon files, so the mock's real paths resolve the way they do on the TV.
 */
function serveMockTv(): Plugin {
  const mirror = resolve(root, "mock-tv");
  return {
    name: "nxe:mock-tv",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/hack", (request, response, next) => {
        const file = resolve(mirror, `.${decodeURIComponent(request.url ?? "").split("?")[0]}`);
        if (!file.startsWith(mirror) || !existsSync(file)) return next();
        response.setHeader("Content-Type", "image/png");
        response.end(readFileSync(file));
      });
    },
  };
}

/**
 * `/steam/*` in dev: the live backend, or the mock when the page sends
 * `x-steam-mock`. The live one is built on first use, so a dev session that
 * never signs in never loads steam-session.
 */
function serveSteam(): Plugin {
  return {
    name: "nxe:steam",
    apply: "serve",
    configureServer(server) {
      let loaded: SteamApi | null = null;
      const live = lazy(async () => {
        loaded ??= (await import("./service/steam/index")).createLiveBackend();
        return loaded;
      });
      const mock = createMockBackend();
      server.middlewares.use(
        "/steam",
        steamHandler((request) => (request.headers["x-steam-mock"] !== undefined ? mock : live)),
      );
    },
  };
}

/** A backend that loads its real one on the first call. */
function lazy(load: () => Promise<SteamApi>): SteamApi {
  return {
    status: async () => (await load()).status(),
    beginQr: async () => (await load()).beginQr(),
    pollQr: async () => (await load()).pollQr(),
    friends: async () => (await load()).friends(),
    signOut: async () => (await load()).signOut(),
  };
}

export default defineConfig({
  root: appDir,
  base: "./",
  publicDir: false,
  resolve: {
    alias: { "@": resolve(appDir, "src") },
  },
  plugins: [vue(), copyPackageFiles(), serveMockTv(), serveSteam()],
  build: {
    outDir,
    emptyOutDir: true,
    // Chromium 108 on the TV. A floor, not a ceiling (PLAN §12).
    target: "chrome108",
    cssTarget: "chrome108",
    sourcemap: true,
    reportCompressedSize: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    // Node's export condition routes `vue` and the `@vue/*` runtimes through
    // their CJS builds, which do not carry the Vapor runtime that
    // `<script setup vapor>` compiles against. Tests load the same
    // esm-bundler builds the browser does.
    alias: (
      [
        ["vue", "vue/dist/vue.runtime.esm-bundler.js"],
        ["@vue/shared", "@vue/shared/dist/shared.esm-bundler.js"],
        ["@vue/reactivity", "@vue/reactivity/dist/reactivity.esm-bundler.js"],
        ["@vue/runtime-core", "@vue/runtime-core/dist/runtime-core.esm-bundler.js"],
        ["@vue/runtime-dom", "@vue/runtime-dom/dist/runtime-dom.esm-bundler.js"],
        ["@vue/runtime-vapor", "@vue/runtime-vapor/dist/runtime-vapor.esm-bundler.js"],
      ] as const
    ).map(([find, replacement]) => ({
      find: new RegExp(`^${find}$`),
      replacement: resolve(root, "node_modules", replacement),
    })),
  },
});
