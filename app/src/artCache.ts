import { shallowReactive } from "vue";

/**
 * Every pane's art, redrawn once at the size it is shown.
 *
 * Launch point icons come at 130 to 600 px square and are shown at 240, up to
 * four times a pane (the icon, its echo and their floor mirror). A channel
 * change repaints eight panes at once, and scaling those sources on the GPU
 * held a frame for up to 300 ms on the TV. Scaled once when the apps load, a
 * repaint only copies a small bitmap that is already the right size.
 */

/** The size the hub shows art at, in CSS px, which is what this TV rasters at. */
export const ART_PX = 240;

const scaled = shallowReactive(new Map<string, string>());
const held: HTMLImageElement[] = [];

/** The art to draw for a source: its scaled copy once there is one, the source until then. */
export function shownArt(url: string | null): string | null {
  return url === null ? null : (scaled.get(url) ?? url);
}

/** Scale one source, keep the result decoded, and leave the source in place if anything refuses. */
export async function prepareArt(url: string): Promise<void> {
  if (scaled.has(url)) return;
  const source = new Image();
  source.src = url;
  try {
    await source.decode();
  } catch {
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = ART_PX;
  canvas.height = ART_PX;
  const context = canvas.getContext("2d");
  if (!context || source.naturalWidth === 0 || source.naturalHeight === 0) return;
  const fit = Math.min(ART_PX / source.naturalWidth, ART_PX / source.naturalHeight);
  const w = source.naturalWidth * fit;
  const h = source.naturalHeight * fit;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, (ART_PX - w) / 2, (ART_PX - h) / 2, w, h);
  let blob: Blob | null = null;
  try {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return;
  }
  if (!blob) return;
  const copy = new Image();
  copy.src = URL.createObjectURL(blob);
  try {
    await copy.decode();
  } catch {
    return;
  }
  held.push(copy);
  scaled.set(url, copy.src);
}
