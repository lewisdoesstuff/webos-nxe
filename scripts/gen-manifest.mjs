#!/usr/bin/env node
// Generate the Homebrew Channel package manifest for a built IPK.
// Usage: node scripts/gen-manifest.mjs <ipk-path> > <id>.manifest.json
import crypto from "node:crypto";
import fs from "node:fs";

const REPO = "https://github.com/lewisdoesstuff/webos-nxe";

const ipkPath = process.argv[2];
if (!ipkPath) {
  console.error("usage: gen-manifest.mjs <ipk-path>");
  process.exit(2);
}

const appinfo = JSON.parse(fs.readFileSync("app/appinfo.json", "utf8"));
const bytes = fs.readFileSync(ipkPath);
const id = appinfo.id;

const manifest = {
  id,
  version: appinfo.version,
  type: appinfo.type,
  title: appinfo.title,
  appDescription:
    "A home screen that recreates the look and motion of the late-2008 console dashboard.",
  iconUri: REPO.replace("github.com", "raw.githubusercontent.com") + "/main/app/icons/icon-256.png",
  sourceUrl: REPO,
  rootRequired: true,
  ipkUrl: REPO + "/releases/latest/download/" + id + ".ipk",
  ipkHash: { sha256: crypto.createHash("sha256").update(bytes).digest("hex") },
};

process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
