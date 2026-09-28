import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vitest/config";

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

export default defineConfig({
  root: appDir,
  base: "./",
  publicDir: false,
  resolve: {
    alias: { "@": resolve(appDir, "src") },
  },
  plugins: [vue(), copyPackageFiles()],
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
