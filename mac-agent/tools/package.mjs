#!/usr/bin/env node
// Builds a self-contained package of the Mac agent (with its own Node, so nothing needs installing):
//   node tools/package.mjs <target>     target: darwin-arm64 | darwin-x64 | linux-x64 | linux-arm64 | win-x64
// Run `npm run build` in the repository root first; the archives of the bar apps (apps/*/dist) go into an apps folder.
// Output: release/boo-board-<version>-<target>.(zip|tar.gz)
//
// macOS gets an app bundle (menu-bar icon, calendar access); Windows and Linux get the agent with a start
// script that opens the settings page: there is no menu-bar app there, and the music and calendar
// sources are macOS-only (see README).
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT = join(HERE, "..");
const ROOT = join(AGENT, "..");
const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win-x64"];
const target = process.argv[2];
if (!TARGETS.includes(target)) {
  console.error(`usage: package.mjs <${TARGETS.join("|")}>`);
  process.exit(1);
}
const [osName, arch] = target.split("-");
const manifest = JSON.parse(readFileSync(join(ROOT, "apps", "board", "src", "appmeta", "manifest.json"), "utf8"));
const name = `boo-board-${manifest.version}-${target}`;
const OUT = join(AGENT, "release");
const stage = join(OUT, name);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// ---- Node for the target ---------------------------------------------------------------------
const v = process.version;
const archive = osName === "win" ? `node-${v}-win-${arch}.zip` : `node-${v}-${osName}-${arch}.tar.gz`;
const work = join(tmpdir(), `bbs-node-${v}-${target}`);
mkdirSync(work, { recursive: true });
const archivePath = join(work, archive);
if (!existsSync(archivePath)) {
  console.log(`downloading ${archive}`);
  // curl ships with macOS, Linux and Windows 10+, resumes nothing but fails loudly and can be given a timeout.
  sh("curl", ["-fsSL", "--retry", "3", "--max-time", "300", "-o", archivePath + ".part", `https://nodejs.org/dist/${v}/${archive}`]);
  renameSync(archivePath + ".part", archivePath);
}
const unpacked = join(work, "x");
rmSync(unpacked, { recursive: true, force: true });
mkdirSync(unpacked);
// bsdtar (macOS, Windows) reads zip files too; on Linux a zip needs unzip.
if (osName === "win" && process.platform === "linux") sh("unzip", ["-q", archivePath, "-d", unpacked]);
else sh("tar", [osName === "win" ? "-xf" : "-xzf", archivePath, "-C", unpacked]);
const nodeDir = join(unpacked, readdirSync(unpacked)[0]);
const nodeBin = osName === "win" ? join(nodeDir, "node.exe") : join(nodeDir, "bin", "node");

// ---- the agent -------------------------------------------------------------------------------
/** Where the agent's files go, relative to the package's root: it expects mac-agent/ next to src/. */
function putAgent(dest) {
  const skip = (p) => /node_modules|\.DS_Store/.test(p);
  mkdirSync(join(dest, "mac-agent"), { recursive: true });
  for (const part of ["src", "ui", "bin", "package.json"]) cpSync(join(AGENT, part), join(dest, "mac-agent", part), { recursive: true, filter: (p) => !skip(p) });
  // The agent reads the bar app's settings schema and the server glyphs from where they are in the repository.
  mkdirSync(join(dest, "apps", "board", "src", "appmeta"), { recursive: true });
  cpSync(join(ROOT, "apps", "board", "src", "appmeta", "settings.json"), join(dest, "apps", "board", "src", "appmeta", "settings.json"));
  mkdirSync(join(dest, "packages", "core", "src"), { recursive: true });
  cpSync(join(ROOT, "packages", "core", "src", "glyphs.json"), join(dest, "packages", "core", "src", "glyphs.json"));
}

/** The apps for the bar, built by `npm run build`: the one with all the screens and one for each screen, in an `apps` folder. */
function putApps(dest) {
  const dir = join(ROOT, "apps");
  mkdirSync(join(dest, "apps"), { recursive: true });
  let n = 0;
  for (const app of readdirSync(dir)) {
    const dist = join(dir, app, "dist");
    if (!existsSync(dist)) continue;
    for (const f of readdirSync(dist)) if (f.endsWith(".tgz")) {
      cpSync(join(dist, f), join(dest, "apps", f));
      n++;
    }
  }
  if (n === 0) console.warn("no built apps found: run `npm run build` first");
}

if (osName === "darwin") {
  if (process.platform !== "darwin") throw new Error("the macOS app is built on macOS (swiftc, iconutil)");
  const app = join(stage, "Boo Board.app");
  const res = join(app, "Contents", "Resources");
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(res, "node"), { recursive: true });
  cpSync(join(AGENT, "tray", "Info.plist"), join(app, "Contents", "Info.plist"));
  sh("/usr/bin/swiftc", ["-O", "-target", `${arch === "arm64" ? "arm64" : "x86_64"}-apple-macos13.0`, "-o", join(app, "Contents", "MacOS", "BusyBarStatus"), join(AGENT, "tray", "BusyBarStatus.swift")]);
  cpSync(nodeBin, join(res, "node", "node"));
  putAgent(res);
  sh("node", [join(HERE, "icons.mjs"), "tray", res]);
  const iconset = join(work, "AppIcon.iconset");
  rmSync(iconset, { recursive: true, force: true });
  sh("node", [join(HERE, "icons.mjs"), "iconset", iconset]);
  sh("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", join(res, "AppIcon.icns")]);
  // An ad-hoc signature: the app has an identity for the privacy prompts, but it is not notarised,
  // so the first start needs a right click -> Open.
  sh("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app]);
  putApps(stage);
  sh("/usr/bin/ditto", ["-c", "-k", "--keepParent", stage, join(OUT, `${name}.zip`)]);
} else {
  const bin = join(stage, "node");
  mkdirSync(bin);
  cpSync(nodeBin, join(bin, osName === "win" ? "node.exe" : "node"));
  putAgent(stage);
  putApps(stage);
  if (osName === "win") {
    writeFileSync(join(stage, "start.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nset BUSYBAR_OPEN=1\r\nnode\\node.exe mac-agent\\src\\index.mjs\r\n');
  } else {
    writeFileSync(join(stage, "start.sh"), '#!/bin/sh\ncd "$(dirname "$0")"\nBUSYBAR_OPEN=1 exec ./node/node mac-agent/src/index.mjs\n');
    chmodSync(join(stage, "start.sh"), 0o755);
    chmodSync(join(bin, "node"), 0o755);
  }
  writeFileSync(join(stage, "README.txt"), `Boo Board ${manifest.version} (${target})\n\n1. ${osName === "win" ? "start.cmd" : "./start.sh"} starts the agent and opens the settings page in your browser.\n2. On the settings page: enter the bar's address and password, press "Bind".\n3. Put the apps for the bar from the apps folder on it (busy-cli app install FILE, or any other way): "${manifest.id}.tgz" has all the screens in one, the others are one screen each. The settings page tells which is missing.\n\nThe now-playing and calendar screens work on macOS only; work time works everywhere the system reports idle time.\nSee https://github.com/solowey1/busybar-boo-board for the full guide.\n`);
  if (osName === "win") sh("tar", ["-a", "-c", "-f", join(OUT, `${name}.zip`), "-C", OUT, name]);
  else sh("tar", ["-czf", join(OUT, `${name}.tar.gz`), "-C", OUT, name]);
}
rmSync(stage, { recursive: true, force: true });
console.log(`done: ${join(OUT, name)}.${osName === "linux" ? "tar.gz" : "zip"}`);
