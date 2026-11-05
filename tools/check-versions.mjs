#!/usr/bin/env node
// Every app of the repository has the same version: the one in package.json (and in mac-agent/package.json), and, in a release, the tag.
//   node tools/check-versions.mjs [tag]
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const want = read("package.json").version;
const found = { "package.json": want, "mac-agent/package.json": read("mac-agent/package.json").version };
for (const d of readdirSync(join(ROOT, "apps"))) found[`apps/${d}/src/appmeta/manifest.json`] = read(`apps/${d}/src/appmeta/manifest.json`).version;
const tag = process.argv[2];
if (tag) found[`the tag ${tag}`] = tag;
const bad = Object.entries(found).filter(([, v]) => v !== want);
if (bad.length) {
  console.error(`the version is ${want} in package.json, but:\n` + bad.map(([f, v]) => `  ${f}: ${v}`).join("\n"));
  process.exit(1);
}
console.log(`all at ${want}`);
