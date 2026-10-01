#!/usr/bin/env node
/**
 * Read an XUI scene (from tools/xur.sh) as a compact element tree and timeline.
 *
 *   node tools/xui.mjs tree GuideMain.xui            elements, geometry, notable properties
 *   node tools/xui.mjs anim GuideMain.xui [Id]       named frames and keyframes, per scene
 *   node tools/xui.mjs json GuideMain.xui            the whole scene as JSON
 *   node tools/xui.mjs find dir/ Position 852        grep properties across a folder
 *
 * Figure outlines (Points) are left out of `tree`; `json` keeps them.
 *
 * Times are XUI frames, printed as they are stored. A keyframe's interpolation
 * shapes the segment that leaves it: linear, hold, or ease(in, out, scale).
 * Colours are 0xAARRGGBB.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const parse = (xml) => {
  const root = { tag: "#root", children: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of xml.replace(/^﻿/, "").matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      const text = m[5].trim();
      if (text) top.text = (top.text ?? "") + decode(text);
      continue;
    }
    if (m[1]) {
      stack.pop();
      continue;
    }
    const node = { tag: m[2], attrs: attrs(m[3]), children: [] };
    top.children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
};
const attrs = (s) =>
  Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const child = (n, tag) => n.children.find((c) => c.tag === tag);
const kids = (n, tag) => n.children.filter((c) => c.tag === tag);

const props = (node) => {
  const p = child(node, "Properties");
  const out = {};
  if (!p) return out;
  for (const c of p.children) {
    const key = c.attrs.index !== undefined ? `${c.tag}[${c.attrs.index}]` : c.tag;
    out[key] = c.children.length ? props(c) : (c.text ?? "");
  }
  return out;
};

const element = (node) => ({
  class: node.tag,
  props: props(node),
  children: node.children
    .filter((c) => c.tag !== "Properties" && c.tag !== "Timelines")
    .map(element),
  timelines: child(node, "Timelines") ? timelines(child(node, "Timelines")) : null,
});

// Ease values are signed bytes; XUIHelper writes v5's unsigned, so -100 reads 156.
const signed = (n) => (n > 127 && n < 256 ? n - 256 : n);

const timelines = (t) => ({
  named: kids(child(t, "NamedFrames") ?? { children: [] }, "NamedFrame").map((f) => ({
    name: child(f, "Name")?.text,
    time: Number(child(f, "Time")?.text),
    command: child(f, "Command")?.text,
    target: child(f, "Target")?.text,
  })),
  tracks: kids(t, "Timeline").map((tl) => ({
    id: child(tl, "Id")?.text,
    props: kids(tl, "TimelineProp").map(
      (p) => p.text + (p.attrs.index !== undefined ? `[${p.attrs.index}]` : ""),
    ),
    keys: kids(tl, "KeyFrame").map((k) => ({
      time: Number(child(k, "Time").text),
      interp: Number(child(k, "Interpolation")?.text ?? 0),
      ease: ["EaseIn", "EaseOut", "EaseScale"].map((e) => signed(Number(child(k, e)?.text ?? 0))),
      values: kids(k, "Prop").map((p) => p.text ?? ""),
    })),
  })),
});

const num = (s) => {
  const n = Number(s);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
};
const vec = (s) => s.split(",").slice(0, 2).map(num).join(",");

const GEOMETRY = new Set([
  "Points",
  "Id",
  "Width",
  "Height",
  "Position",
  "Pivot",
  "Scale",
  "Opacity",
  "Show",
  "Visual",
  "Text",
  "ClassOverride",
]);
const summary = (p) => {
  const parts = [];
  if (p.Width || p.Height) parts.push(`${num(p.Width ?? 0)}x${num(p.Height ?? 0)}`);
  if (p.Position) parts.push(`@${vec(p.Position)}`);
  if (p.Pivot) parts.push(`pivot ${vec(p.Pivot)}`);
  if (p.Scale) parts.push(`scale ${vec(p.Scale)}`);
  if (p.Opacity) parts.push(`opacity ${num(p.Opacity)}`);
  if (p.Show === "false") parts.push("hidden");
  if (p.ClassOverride) parts.push(`class ${p.ClassOverride}`);
  if (p.Visual) parts.push(`visual ${p.Visual}`);
  if (p.Text) parts.push(JSON.stringify(p.Text));
  for (const [k, v] of Object.entries(p)) {
    if (GEOMETRY.has(k)) continue;
    parts.push(typeof v === "object" ? `${k}{${flat(v)}}` : `${k}=${v}`);
  }
  return parts.join("  ");
};
const flat = (o) =>
  Object.entries(o)
    .map(([k, v]) => (typeof v === "object" ? `${k}{${flat(v)}}` : `${k}=${v}`))
    .join(" ");

const printTree = (el, depth = 0) => {
  const id = el.props.Id ? ` #${el.props.Id}` : "";
  const anim = el.timelines
    ? `  [${el.timelines.named.length} named, ${el.timelines.tracks.length} tracks]`
    : "";
  console.log(`${"  ".repeat(depth)}${el.class}${id}  ${summary(el.props)}${anim}`);
  for (const c of el.children) printTree(c, depth + 1);
};

const easeName = (k) => {
  if (k.interp === 0) return "linear";
  if (k.interp === 1) return "hold";
  return `ease(${k.ease.join(",")})`;
};

const printAnim = (el, only, path = []) => {
  const here = [...path, el.props.Id ?? el.class];
  if (el.timelines && (!only || here.includes(only))) {
    console.log(`\n== ${here.join(" / ")}`);
    const named = [...el.timelines.named].sort((a, b) => a.time - b.time);
    for (const f of named)
      console.log(
        `  ${String(f.time).padStart(5)}  ${f.name}${f.command ? `  (${f.command}${f.target ? ` ${f.target}` : ""})` : ""}`,
      );
    for (const t of el.timelines.tracks) {
      console.log(`  ${t.id}: ${t.props.join(", ")}`);
      for (const k of t.keys)
        console.log(
          `    ${String(k.time).padStart(5)}  ${easeName(k).padEnd(18)} ${k.values.map((v) => (v.includes(",") ? vec(v) : v)).join("  ")}`,
        );
    }
  }
  for (const c of el.children) printAnim(c, only, here);
};

const load = (file) => element(child(parse(readFileSync(file, "utf8")), "XuiCanvas"));

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".xui") ? [p] : [];
  });

const [cmd, file, ...rest] = process.argv.slice(2);
if (cmd === "tree") printTree(load(file));
else if (cmd === "anim") printAnim(load(file), rest[0]);
else if (cmd === "json") console.log(JSON.stringify(load(file), null, 1));
else if (cmd === "find") {
  const [key, value] = rest;
  const visit = (el, f, path) => {
    const here = [...path, el.props.Id ?? el.class];
    const v = el.props[key];
    if (v !== undefined && (value === undefined || JSON.stringify(v).includes(value)))
      console.log(`${f}  ${here.join("/")}  ${typeof v === "object" ? flat(v) : v}`);
    for (const c of el.children) visit(c, f, here);
  };
  for (const f of walk(file)) {
    try {
      visit(load(f), f.slice(file.length).replace(/^\//, ""), []);
    } catch (e) {
      console.error(`${f}: ${e.message}`);
    }
  }
} else {
  console.error("usage: xui.mjs tree|anim|json <file.xui> | find <dir> <Property> [substring]");
  process.exit(2);
}
