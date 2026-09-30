/**
 * The TV's own inputs, and where a still of one lives.
 *
 * An input is a full-screen app on this TV (`com.webos.app.hdmi1`), not a video
 * plane, which is why the only way to photograph one is to photograph the panel
 * while that app is up. `isInputAppId` is the single test for "is this app an
 * input", used both to pick the glyph a row falls back to and to decide whether
 * a launch is worth taking a picture of.
 */

/** Ids the TV reports for its own sources. */
const INPUT_PREFIXES = ["com.webos.app.hdmi", "com.webos.app.livetv"];

export function isInputAppId(appId: string): boolean {
  const id = appId.toLowerCase();
  return INPUT_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Which of an input's two still files a capture writes to.
 *
 * Two, because a capture writes straight to its path and cannot be held back
 * until it has been judged. A rejected attempt still lands on disk, so it is
 * given the slot the last good still is not in, and the row keeps the picture it
 * had until the new one proves itself or the old one goes stale.
 */
export type PreviewSlot = "a" | "b";

export const PREVIEW_SLOTS: readonly PreviewSlot[] = ["a", "b"];

export function otherSlot(slot: PreviewSlot): PreviewSlot {
  return slot === "a" ? "b" : "a";
}

/** The panel is 16:9 and this is a thumbnail in a 56px slot, so 480 wide is
 *  already more than the row can show. Measured: 23 to 76 kB as jpeg, against
 *  287 kB as png for the same frame. */
export const PREVIEW_WIDTH = 480;
export const PREVIEW_HEIGHT = 270;

/** The capture service writes a file and returns no image data, so the file is
 *  the only channel out. It has to land inside our own origin to be loadable:
 *  the page is a `file://` app and cross-app reads are blocked. */
const PREVIEW_DIR = "/media/developer/apps/usr/palm/applications/ooo.lew.nxe";

export function previewFileName(appId: string, slot: PreviewSlot): string {
  return `preview-${appId}-${slot}.jpg`;
}

/** Absolute TV path, for the capture service, which runs as root. */
export function previewPath(appId: string, slot: PreviewSlot): string {
  return `${PREVIEW_DIR}/${previewFileName(appId, slot)}`;
}

/**
 * Relative URL for the row to load.
 *
 * The query is the cache-bust: Chromium will not re-read a `file://` image it
 * has already decoded, and a fresh capture overwrites the same path, so without
 * it a new still would never appear until the page restarted.
 */
export function previewUrl(appId: string, slot: PreviewSlot, capturedAt: number): string {
  return `./${previewFileName(appId, slot)}?v=${capturedAt}`;
}
