import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_THEME, setTheme, type ThemeManifest } from "./theme";
import { applyManifest } from "./theme/resolve";

/**
 * The geometry and wording tests were written against the retail names, so
 * they run with the NXE theme's strings over the default theme.
 */
const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "testFixtures/theme.json"), "utf8"),
) as ThemeManifest;
setTheme(
  applyManifest(
    DEFAULT_THEME,
    { id: DEFAULT_THEME.id, name: DEFAULT_THEME.name, strings: manifest.strings ?? {} },
    "",
  ),
);
