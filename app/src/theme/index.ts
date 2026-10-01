/**
 * The active theme.
 *
 * `main.ts` loads the chosen theme before the app's modules are evaluated, so
 * anything that reads `theme()` at import time sees the final theme. Until
 * something is installed the default is active, which is what the tests see.
 */

import { DEFAULT_THEME } from "./default";
import type { Theme } from "./types";

export { DEFAULT_THEME } from "./default";
export * from "./types";

let active: Theme = DEFAULT_THEME;

export function theme(): Theme {
  return active;
}

export function setTheme(next: Theme): void {
  active = next;
}
