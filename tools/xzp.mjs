#!/usr/bin/env node
/**
 * Unpack Xbox 360 XZP resource packages (XUIZ), versions 1 and 3.
 *
 *   node tools/xzp.mjs dashmain.xzp out/            one package
 *   node tools/xzp.mjs dir/ out/                    every .xzp under dir, each into out/<its path>
 *
 * Version 1 (2008 to 2009 dashboards) names its entries in UTF-16BE, version 3
 * in single bytes. Entry paths keep their folders, with `\` turned into `/`.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const unpack = (file, out) => {
  const d = readFileSync(file);
  if (d.toString("latin1", 0, 4) !== "XUIZ") throw new Error("not an XZP");
  const version = d.readUInt32BE(4);
  const count = d.readUInt16BE(0x14);
  const wide = version === 1;
  let o = 0x16;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const size = d.readUInt32BE(o);
    const offset = d.readUInt32BE(o + 4);
    const length = d[o + 8];
    o += 9;
    let name;
    if (wide) {
      name = Buffer.from(d.subarray(o, o + length * 2))
        .swap16()
        .toString("utf16le");
      o += length * 2;
    } else {
      name = d.toString("latin1", o, o + length);
      o += length;
    }
    entries.push({ name: name.replace(/\\/g, "/"), offset, size });
  }
  for (const e of entries) {
    const path = join(out, e.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, d.subarray(o + e.offset, o + e.offset + e.size));
  }
  return entries.length;
};

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.xzp$/i.test(f) ? [p] : [];
  });

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: xzp.mjs <file.xzp|dir> <outdir>");
  process.exit(2);
}
if (statSync(src).isDirectory()) {
  let total = 0;
  for (const f of walk(src)) {
    try {
      total += unpack(f, join(out, relative(src, f).replace(/\.xzp$/i, "")));
    } catch (e) {
      console.error(`${f}: ${e.message}`);
    }
  }
  console.log(`${total} entries`);
} else console.log(`${unpack(src, out)} entries`);
