#!/usr/bin/env node
/**
 * Writes the two bokeh sheets, seeded so the output is stable:
 *
 *   node tools/bokeh.mjs
 *
 * `sky.svg` is the sky's: mostly small dots and faint rings, some dark on the
 * light glow and some light on the dark corners, with a few large soft discs.
 * `card.svg` is a hub pane's: dense clusters of small concentric rings and
 * dots along the left foot and right edge and in the top corners, clear of the
 * icon tile. Both are static paint.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "app", "src", "assets", "hub");

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

function ring(rand, x, y, r, tone, alpha, into) {
  const rings = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < rings; i++) {
    const rr = r * (1 - i * (0.22 + rand() * 0.12));
    if (rr < 2) break;
    into.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" stroke="rgba(${tone},${f(alpha * (0.6 + rand() * 0.5))})" stroke-width="${f(1 + rand() * 1.6)}"/>`,
    );
  }
}

function dot(rand, x, y, r, tone, alpha, into) {
  into.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="rgba(${tone},${f(alpha)})"/>`);
}

function sky() {
  const rand = rng(2008);
  const parts = [];
  for (let i = 0; i < 26; i++) {
    const x = rand() * 1920;
    const y = rand() * 560;
    const dark = x > 1100 && y < 200;
    const tone = dark ? "255,255,255" : rand() < 0.45 ? "0,30,0" : "255,255,255";
    dot(rand, x, y, 3 + rand() * 6, tone, 0.05 + rand() * 0.06, parts);
  }
  for (let i = 0; i < 30; i++) {
    const x = rand() * 1920;
    const y = rand() * 560;
    const tone = rand() < 0.4 ? "0,30,0" : "255,255,255";
    ring(rand, x, y, 9 + rand() * 16, tone, 0.06 + rand() * 0.05, parts);
  }
  for (let i = 0; i < 4; i++) {
    const x = 200 + rand() * 1500;
    const y = 120 + rand() * 300;
    ring(rand, x, y, 50 + rand() * 40, "255,255,255", 0.04, parts);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620" viewBox="0 0 1920 620" fill="none">\n${parts.join("\n")}\n</svg>\n`;
}

function card() {
  const rand = rng(360);
  const parts = [];
  const clear = { x0: 170, x1: 460, y0: 70, y1: 360 };
  const free = (x, y, r) =>
    x + r < clear.x0 || x - r > clear.x1 || y + r < clear.y0 || y - r > clear.y1;
  const cluster = (cx, cy, w, h, count, rMax) => {
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - 0.5) * w;
      const y = cy + (rand() - 0.5) * h;
      const r = 4 + rand() * rMax;
      if (!free(x, y, r)) continue;
      const tone = rand() < 0.3 ? "255,255,120" : "255,255,255";
      if (rand() < 0.35) dot(rand, x, y, r * 0.6, tone, 0.07 + rand() * 0.06, parts);
      else ring(rand, x, y, r, tone, 0.1 + rand() * 0.07, parts);
    }
  };
  cluster(80, 420, 200, 130, 20, 18);
  cluster(550, 260, 160, 420, 34, 16);
  cluster(60, 90, 130, 130, 6, 26);
  cluster(520, 60, 170, 110, 7, 22);
  cluster(315, 420, 300, 90, 8, 12);
  ring(rand, 60, 380, 62, "255,255,255", 0.16, parts);
  ring(rand, 585, 330, 44, "255,255,255", 0.13, parts);
  ring(rand, 585, 60, 40, "255,255,200", 0.18, parts);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="630" height="480" viewBox="0 0 630 480" fill="none">\n${parts.join("\n")}\n</svg>\n`;
}

writeFileSync(join(out, "bokeh.svg"), sky());
writeFileSync(join(out, "card-bokeh.svg"), card());
