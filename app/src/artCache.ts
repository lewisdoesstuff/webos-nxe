import { shallowReactive, shallowRef } from "vue";

import { readAllArt, type StoredArt, writeArt } from "./artStore";
import cardBokeh from "./assets/hub/card-bokeh.svg";
import { CARDS } from "./cards";
import { css, edgeColor, faceStops } from "./tileColor";

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
 *
 * What is baked is kept between launches (`artStore.ts`), so a cold start only
 * decodes it. An icon is checked against its stored bake once the dashboard is
 * up, and baked again only if it has changed.
 */

/** Bumped whenever what a bake draws changes, so older stored bakes are ignored. */
const BAKE_VERSION = 4;
const FLOOR_KEY = "floor-face";

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

/** The foot `HubPane.vue`'s `.face` lays over the card background, as alpha stops of one dark green. */
const FOOT_STOPS: readonly [number, number][] = [
  [0, 0],
  [0.45, 0.05],
  [0.58, 0.08],
  [0.71, 0.25],
  [0.83, 0.55],
  [0.92, 0.75],
  [0.98, 0.9],
  [1, 0.9],
];

interface Baked {
  art: string;
  echo: string | null;
  floor: string;
  /** Set for an icon drawn on its own flat colour: the whole card, echo included, at half size. */
  face?: string;
  /** The flat colour of a face, as CSS. */
  color?: string;
}

/** The logo of a flat-colour card, in card px, and the card scale it is baked at. */
const FLAT = { x: 165, y: 36, size: 300, scale: 0.5 } as const;

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
  const own = url === null ? undefined : baked.get(url);
  if (own?.face) return null;
  return own?.floor ?? floorFace.value?.patch ?? null;
}

/** The flat colour an icon sits on, as CSS, or null. */
export function shownColor(url: string | null): string | null {
  return url === null ? null : (baked.get(url)?.color ?? null);
}

/** The card face of an icon on a flat colour, or null for the lime card. */
export function shownFace(url: string | null): string | null {
  return url === null ? null : (baked.get(url)?.face ?? null);
}

/** The whole mirror of a flat-colour card, or null when the shared one serves. */
export function shownFloorOwn(url: string | null): string | null {
  const own = url === null ? undefined : baked.get(url);
  return own?.face ? own.floor : null;
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

async function encode(element: HTMLCanvasElement): Promise<Blob | null> {
  try {
    return await new Promise<Blob | null>((resolve) => element.toBlob(resolve, "image/png"));
  } catch {
    return null;
  }
}

/** Keep an image decoded, so a repaint never waits on it. */
async function show(blob: Blob): Promise<string | null> {
  const copy = await decoded(URL.createObjectURL(blob));
  if (!copy) return null;
  held.push(copy);
  return copy.src;
}

/** Show every image of a record, or none. */
async function showAll(images: Record<string, Blob>): Promise<Record<string, string> | null> {
  const names = Object.keys(images);
  const urls = await Promise.all(names.map((name) => show(images[name]!)));
  if (urls.some((url) => url === null)) return null;
  return Object.fromEntries(names.map((name, index) => [name, urls[index]!]));
}

/** Encode canvases, store them under a key, and show them. */
async function store(
  key: string,
  hash: number,
  canvases: Record<string, HTMLCanvasElement>,
  color?: string,
): Promise<Record<string, string> | null> {
  const names = Object.keys(canvases);
  const blobs = await Promise.all(names.map((name) => encode(canvases[name]!)));
  if (blobs.some((blob) => blob === null)) return null;
  const images = Object.fromEntries(names.map((name, index) => [name, blobs[index]!]));
  void writeArt({ key, version: BAKE_VERSION, hash, images, ...(color ? { color } : {}) });
  return showAll(images);
}

let stored: Promise<Map<string, StoredArt>> | null = null;

/** A stored bake of this version, if there is one. */
async function storedFor(key: string): Promise<StoredArt | undefined> {
  stored ??= readAllArt();
  const record = (await stored).get(key);
  return record?.version === BAKE_VERSION ? record : undefined;
}

/** FNV-1a over the pixels, enough to tell one icon from its replacement. */
function hashPixels(context: CanvasRenderingContext2D): number {
  const data = context.getImageData(0, 0, ART_PX, ART_PX).data;
  let hash = 0x811c9dc5;
  for (let index = 0; index < data.length; index++) {
    hash = Math.imul(hash ^ data[index]!, 0x01000193);
  }
  return hash >>> 0;
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

/** Fade the edges of a square to nothing, so an icon's own background melts into the card behind it. */
function feather(context: CanvasRenderingContext2D, width: number): void {
  const size = context.canvas.width;
  const edge = width / size;
  context.globalCompositeOperation = "destination-in";
  for (const horizontal of [true, false]) {
    const gradient = horizontal
      ? context.createLinearGradient(0, 0, size, 0)
      : context.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(edge, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1 - edge, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  context.globalCompositeOperation = "source-over";
}

const MIRROR_FADE: readonly [number, number][] = [
  [0, MIRROR.opacity],
  [1, 0],
];

let bareCard: Promise<HTMLCanvasElement | null> | null = null;

/** The card's face, as `HubPane.vue`'s `.face` draws it on the first background. Drawn once. */
function drawCard(): Promise<HTMLCanvasElement | null> {
  bareCard ??= (async () => {
    const made = canvas(CARD_W, CARD_H);
    if (!made) return null;
    const [element, context] = made;
    context.beginPath();
    context.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS);
    context.clip();
    const background = await decoded(CARDS[0]);
    if (background) context.drawImage(background, 0, 0, CARD_W, CARD_H);
    const gradient = context.createLinearGradient(0, 0, 0, CARD_H);
    for (const [at, alpha] of FOOT_STOPS) gradient.addColorStop(at, `rgba(15, 29, 0, ${alpha})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, CARD_W, CARD_H);
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

/** Draw the bare card's mirror once, or take it from the store. */
export function prepareFloor(): Promise<void> {
  facing ??= (async () => {
    const record = await storedFor(FLOOR_KEY);
    let urls = record ? await showAll(record.images) : null;
    if (!urls) {
      const card = await drawCard();
      const mirror = card && drawMirror(card, null, { x: 0, y: 0, w: CARD_W, h: MIRROR.h });
      const patch = card && drawMirror(card, null, PATCH);
      if (!mirror || !patch) return;
      mirror.getContext("2d")?.clearRect(PATCH.x, PATCH.y, PATCH.w, PATCH.h);
      urls = await store(FLOOR_KEY, 0, { face: mirror, patch });
    }
    if (urls?.["face"] && urls["patch"])
      floorFace.value = { face: urls["face"], patch: urls["patch"] };
  })();
  return facing;
}

/** Sources shown from the store this session, still to be checked against their icon. */
const unchecked = new Map<string, number>();

/** Show a source's art, from the store when it has it, baked otherwise. */
export async function prepareArt(url: string): Promise<void> {
  if (baked.has(url)) return;
  const record = await storedFor(url);
  const urls = record ? await showAll(record.images) : null;
  if (record && urls?.["art"] && urls["floor"] && (urls["echo"] || urls["face"])) {
    baked.set(url, {
      art: urls["art"],
      echo: urls["echo"] ?? null,
      floor: urls["floor"],
      ...(urls["face"] ? { face: urls["face"] } : {}),
      ...(record.color ? { color: record.color } : {}),
    });
    unchecked.set(url, record.hash);
    return;
  }
  await bake(url, null);
}

/** Bake a source again if its icon no longer matches what was stored. */
export async function checkArt(url: string): Promise<void> {
  const hash = unchecked.get(url);
  if (hash === undefined) return;
  unchecked.delete(url);
  await bake(url, hash);
}

/** Scale one source and bake its reflections, and leave what is shown in place if anything refuses. */
async function bake(url: string, unless: number | null): Promise<void> {
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
  const hash = hashPixels(context);
  if (hash === unless) return;

  const edge = edgeColor(context.getImageData(0, 0, ART_PX, ART_PX).data, ART_PX);
  if (edge) {
    await bakeFlat(url, hash, source, edge.rgb);
    return;
  }

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
  const urls = await store(url, hash, { art: scaled, echo, floor: patch });
  if (urls?.["art"] && urls["echo"] && urls["floor"]) {
    baked.set(url, { art: urls["art"], echo: urls["echo"], floor: urls["floor"] });
  }
}

/**
 * An icon that sits on one flat colour: that colour is the card, the logo is
 * drawn large with no frame, and the card and its mirror are baked at half
 * size because a gradient and a soft echo lose nothing to it.
 */
async function bakeFlat(
  url: string,
  hash: number,
  source: HTMLImageElement,
  base: readonly [number, number, number],
): Promise<void> {
  const k = FLAT.scale;
  const faceCanvas = canvas(CARD_W * k, CARD_H * k);
  const artCanvas = canvas(FLAT.size, FLAT.size);
  const mirrorCanvas = canvas(CARD_W * k, MIRROR.h * k);
  if (!faceCanvas || !artCanvas || !mirrorCanvas) return;

  const [face, faceContext] = faceCanvas;
  const gradient = faceContext.createLinearGradient(0, 0, 0, face.height);
  for (const [at, color] of faceStops(base)) gradient.addColorStop(at, color);
  faceContext.fillStyle = gradient;
  faceContext.fillRect(0, 0, face.width, face.height);
  const dots = await decoded(cardBokeh);
  if (dots) {
    faceContext.globalAlpha = 0.2;
    faceContext.drawImage(dots, 0, 0, face.width, face.height);
    faceContext.globalAlpha = 1;
  }

  const [art, artContext] = artCanvas;
  artContext.imageSmoothingQuality = "high";
  const fit = Math.min(FLAT.size / source.naturalWidth, FLAT.size / source.naturalHeight);
  const w = source.naturalWidth * fit;
  const h = source.naturalHeight * fit;
  artContext.drawImage(source, (FLAT.size - w) / 2, (FLAT.size - h) / 2, w, h);
  feather(artContext, 36);

  const echoH = 110;
  const echoCanvas = canvas(FLAT.size, echoH);
  if (!echoCanvas) return;
  const [echo, echoContext] = echoCanvas;
  echoContext.setTransform(1, 0, 0, -1, 0, echoH);
  echoContext.drawImage(art, 0, echoH - FLAT.size);
  echoContext.setTransform(1, 0, 0, 1, 0, 0);
  fade(echoContext, 0, echoH, [
    [0, 0.45],
    [0.4, 0.2],
    [1, 0],
  ]);
  faceContext.drawImage(echo, FLAT.x * k, (FLAT.y + FLAT.size) * k, FLAT.size * k, echoH * k);

  const [mirror, mirrorContext] = mirrorCanvas;
  mirrorContext.setTransform(1, 0, 0, -1, 0, face.height);
  mirrorContext.drawImage(face, 0, 0);
  mirrorContext.setTransform(1, 0, 0, 1, 0, 0);
  fade(mirrorContext, 0, mirror.height, MIRROR_FADE);

  const color = css(base);
  const urls = await store(url, hash, { art, face, floor: mirror }, color);
  if (urls?.["art"] && urls["face"] && urls["floor"]) {
    baked.set(url, {
      art: urls["art"],
      echo: null,
      floor: urls["floor"],
      face: urls["face"],
      color,
    });
  }
}
