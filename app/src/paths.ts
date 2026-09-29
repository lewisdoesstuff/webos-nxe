/**
 * Paths that reach outside the app's own directory.
 *
 * A file:// page on webOS cannot load files outside its own directory, so
 * `tools/deploy.sh` puts a `hack -> /` symlink in the app's directory and an
 * absolute path is reached as `hack<path>`. The dev server serves `mock-tv/`
 * there instead.
 */

export const HACK_PREFIX = "hack";
