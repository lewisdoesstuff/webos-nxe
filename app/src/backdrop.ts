/**
 * The settings screen's sky and floor, drawn once into a canvas.
 *
 * Swapping the hub's own backdrop for this one restyled two full-frame boxes
 * painted into the root layer, and on the TV re-rastering the root stalled the
 * settings transition for 150ms. A canvas is one texture that keeps its pixels
 * at opacity 0, so showing it is an opacity change and nothing is rastered.
 * The styles are the ones the stage used to switch to, rendered through an SVG
 * `foreignObject`, so the canvas is the same picture the CSS drew.
 */
import bokeh from "./assets/hub/bokeh.svg?raw";

export const BACKDROP_W = 1920;
export const BACKDROP_H = 1080;

const BOKEH = `url('data:image/svg+xml,${encodeURIComponent(bokeh)}') 0 0 / 1920px 620px no-repeat`;

const SKY = [
  BOKEH,
  "radial-gradient(ellipse 34% 60% at 100% 100%, #f9f77a 0%, rgba(249, 247, 122, 0) 100%)",
  "radial-gradient(ellipse 30% 55% at 0% 100%, #dff3ef 0%, rgba(223, 243, 239, 0) 100%)",
  "radial-gradient(ellipse 40% 60% at 100% 0%, rgba(8, 20, 8, 0.9) 0%, rgba(8, 20, 8, 0) 100%)",
  "linear-gradient(180deg, #002400 0%, #225600 24%, #4c8a0a 48%, #7fac66 75%, #b8d6a6 100%)",
].join(",");

const FLOOR = [
  "radial-gradient(ellipse 520px 90px at 2420px 0, #f9f77a 0%, rgba(249, 247, 122, 0) 100%)",
  "radial-gradient(ellipse 560px 260px at 2420px 170px, #f3c274 0%, rgba(243, 194, 116, 0) 100%)",
  "radial-gradient(ellipse 620px 300px at 300px 0, #d9f0ee 0%, rgba(217, 240, 238, 0) 100%)",
  "linear-gradient(180deg, #cfe0d8 0%, #b0bdbc 30%, #9b9e99 60%, #929592 100%)",
].join(",");

const POOL =
  "radial-gradient(ellipse 640px 300px at 1037px 380px, rgba(28, 35, 40, 0.94) 0%, " +
  "rgba(34, 42, 48, 0.8) 38%, rgba(44, 52, 58, 0.4) 70%, rgba(50, 58, 64, 0) 100%)";

const MASK = "linear-gradient(180deg, transparent 0, #000 35px)";

function markup(): string {
  const html =
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${BACKDROP_W}px;height:${BACKDROP_H}px;overflow:hidden">` +
    `<div style="position:absolute;left:0;top:0;right:0;height:620px;background:${SKY}"></div>` +
    `<div style="position:absolute;top:585px;left:-300px;right:-300px;bottom:0;-webkit-mask:${MASK};mask:${MASK};background:${FLOOR}"></div>` +
    `<div style="position:absolute;left:700px;top:640px;width:1220px;height:440px;background:${POOL}"></div>` +
    `</div>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BACKDROP_W}" height="${BACKDROP_H}">` +
    `<foreignObject width="100%" height="100%">${html.replace(/&/g, "&amp;")}</foreignObject></svg>`
  );
}

/** Draw the settings backdrop into `canvas`. Resolves once it is drawn. */
export async function drawBackdrop(canvas: HTMLCanvasElement): Promise<void> {
  canvas.width = BACKDROP_W;
  canvas.height = BACKDROP_H;
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) return;
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(markup())}`;
  try {
    await image.decode();
  } catch {
    return;
  }
  context.drawImage(image, 0, 0);
}
