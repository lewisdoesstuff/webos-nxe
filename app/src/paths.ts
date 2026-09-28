/**
 * Paths that reach outside the app's own directory.
 *
 * A webOS app is confined to its install directory, so a file the user has put
 * somewhere else is reached through the `hack` URI prefix, which is the
 * platform's own escape hatch. It is a real scheme and not a symlink, so it is
 * the only way in.
 */

export const HACK_PREFIX = "hack";
