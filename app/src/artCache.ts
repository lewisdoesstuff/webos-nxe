import { shallowReactive, shallowRef } from "vue";

import cardBokeh from "./assets/hub/card-bokeh.svg";

/**
 * Every pane's art, redrawn once at the size it is shown, with its reflections
 * baked.
 *
 * Launch point icons come at 130 to 600 px square and are shown at 240. A
 * channel change repaints eight panes, and scaling those sources on the GPU
 * held a frame for up to 300 ms on the TV. Scaled once when the apps load, a
 * repaint only copies a small bitmap that is already the right size.
 *
 * The in-card echo and the floor mirror are baked the same way, fade and
 * opacity included, so a pane draws them as plain images: no mask and no group
 * opacity, each of which costs an offscreen pass on every repaint.
 */

/** The size the hub shows art at, in CSS px, which is what this TV rasters at. */
export const ART_PX = 240;

const CARD_W = 630;
const CARD_H = 480;
const CARD_RADIUS = 4;
const ART_RADIUS = 34;

/** The echo under the icon, inside the card. */
const ECHO = { x: 195, y: 334, w: ART_PX, h: 120, opacity: 0.6 } as const;

/** The card's floor mirror: the card flipped below it, faded out. */
const MIRROR = { gap: 2, h: 144, opacity: 0.34 } as const;

/** The part of the mirror that shows the echo, which is the only part an item changes. */
const PATCH = {
  x: ECHO.x,
  y: CARD_H - 1 - (ECHO.y + ECHO.h - 1),
  w: ECHO.w,
  h: MIRROR.h - (CARD_H - 1 - (ECHO.y + ECHO.h - 1)),
} as const;

const FACE_STOPS: readonly [number, string][] = [
  [0, "#d2dd1c"],
  [0.25, "#c0d818"],
  [0.53, "#9fc905"],
  [0.71, "#75aa01"],
  [0.8, "#628a08"],
  [0.9, "#3e5e08"],
  [0.97, "#1e3402"],
  [1, "#182d01"],
];

interface Baked {
  art: string;
  echo: string;
  floor: string;
}

const baked = shallowReactive(new Map<string, Baked>());
/** The mirror of a bare card, with a hole where the echo goes, and the patch for a card with no echo. */
const floorFace = shallowRef<{ face: string; patch: string } | null>(null);
const held: HTMLImageElement[] = [];

/** The art to draw for a source: its scaled copy once there is one, the source until then. */
export function shownArt(url: string | null): string | null {
  return url === null ? null : (baked.get(url)?.art ?? url);
}

/** The baked echo for a source, or null until there is one. */
export function shownEcho(url: string | null): string | null {
  return url === null ? null : (baked.get(url)?.echo ?? null);
}

/** The mirror behind every card, or null until it is drawn. */
export function shownFloorFace(): string | null {
  return floorFace.value?.face ?? null;
}

/** The mirror's echo patch for a source, the bare card's until the source has one. */
export function shownFloorPatch(url: string | null): string | null {
  const own = url === null ? undefined : baked.get(url)?.floor;
  return own ?? floorFace.value?.patch ?? null;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const element = document.createElement("canvas");
  element.width = w;
  element.height = h;
  const context = element.getContext("2d", { willReadFrequently: true });
  return context ? [element, context] : null;
}

async function decoded(src: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    return null;
  }
  return image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
}

/** Encode a canvas and keep the result decoded, so a repaint never waits on it. */
async function keep(element: HTMLCanvasElement): Promise<string | null> {
  let blob: Blob | null = null;
  try {
    blob = await new Promise<Blob | null>((resolve) => element.toBlob(resolve, "image/png"));
  } catch {
    return null;
  }
  if (!blob) return null;
  const copy = await decoded(URL.createObjectURL(blob));
  if (!copy) return null;
  held.push(copy);
  return copy.src;
}

/** Multiply what is drawn by alpha stops that run top to bottom from `top` over `h`. */
function fade(
  context: CanvasRenderingContext2D,
  top: number,
  h: number,
  stops: readonly [number, number][],
): void {
  const gradient = context.createLinearGradient(0, top, 0, top + h);
  for (const [at, alpha] of stops) gradient.addColorStop(at, `rgba(0, 0, 0, ${alpha})`);
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = gradient;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  context.globalCompositeOperation = "source-over";
}

const MIRROR_FADE: readonly [number, number][] = [
  [0, MIRROR.opacity],
  [1, 0],
];

let bareCard: Promise<HTMLCanvasElement | null> | null = null;

/** The card's face, as `HubPane.vue`'s `.face` draws it below its top band and highlight, which never reach the mirror. Drawn once. */
function drawCard(): Promise<HTMLCanvasElement | null> {
  bareCard ??= (async () => {
    const made = canvas(CARD_W, CARD_H);
    if (!made) return null;
    const [element, context] = made;
    context.beginPath();
    context.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS);
    context.clip();
    const gradient = context.createLinearGradient(0, 0, 0, CARD_H);
    for (const [at, color] of FACE_STOPS) gradient.addColorStop(at, color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, CARD_W, CARD_H);
    const dots = await decoded(cardBokeh);
    if (dots) context.drawImage(dots, 0, 0, CARD_W, CARD_H);
    return element;
  })();
  return bareCard;
}

/** A region of the floor mirror: the card flipped under itself with an echo on it, faded out. */
function drawMirror(
  card: HTMLCanvasElement,
  echo: HTMLCanvasElement | null,
  region: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement | null {
  const made = canvas(region.w, region.h);
  if (!made) return null;
  const [element, context] = made;
  context.setTransform(1, 0, 0, -1, -region.x, CARD_H - region.y);
  context.drawImage(card, 0, 0);
  if (echo) context.drawImage(echo, ECHO.x, ECHO.y);
  context.setTransform(1, 0, 0, 1, 0, 0);
  fade(context, -region.y, MIRROR.h, MIRROR_FADE);
  return element;
}

let facing: Promise<void> | null = null;

/** Draw the bare card's mirror once. */
export function prepareFloor(): Promise<void> {
  facing ??= (async () => {
    const card = await drawCard();
    const mirror = card && drawMirror(card, null, { x: 0, y: 0, w: CARD_W, h: MIRROR.h });
    const patch = card && drawMirror(card, null, PATCH);
    if (!mirror || !patch) return;
    mirror.getContext("2d")?.clearRect(PATCH.x, PATCH.y, PATCH.w, PATCH.h);
    const [face, patchUrl] = await Promise.all([keep(mirror), keep(patch)]);
    if (face && patchUrl) floorFace.value = { face, patch: patchUrl };
  })();
  return facing;
}

/** Scale one source and bake its reflections, and leave the source in place if anything refuses. */
export async function prepareArt(url: string): Promise<void> {
  if (baked.has(url)) return;
  const [source, card] = await Promise.all([decoded(url), drawCard()]);
  const scaledCanvas = canvas(ART_PX, ART_PX);
  const echoCanvas = canvas(ECHO.w, ECHO.h);
  if (!source || !card || !scaledCanvas || !echoCanvas) return;

  const [scaled, context] = scaledCanvas;
  const fit = Math.min(ART_PX / source.naturalWidth, ART_PX / source.naturalHeight);
  const w = source.naturalWidth * fit;
  const h = source.naturalHeight * fit;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, (ART_PX - w) / 2, (ART_PX - h) / 2, w, h);

  const [echo, echoContext] = echoCanvas;
  echoContext.beginPath();
  echoContext.roundRect(0, 0, ART_PX, ART_PX, ART_RADIUS);
  echoContext.clip();
  echoContext.setTransform(1, 0, 0, -1, 0, ECHO.h);
  echoContext.drawImage(scaled, 0, ECHO.h - ART_PX);
  echoContext.setTransform(1, 0, 0, 1, 0, 0);
  fade(echoContext, 0, ECHO.h, [
    [0, ECHO.opacity],
    [0.35, ECHO.opacity * 0.5],
    [1, 0],
  ]);

  const patch = drawMirror(card, echo, PATCH);
  if (!patch) return;
  const [art, echoUrl, floor] = await Promise.all([keep(scaled), keep(echo), keep(patch)]);
  if (art && echoUrl && floor) baked.set(url, { art, echo: echoUrl, floor });
}
