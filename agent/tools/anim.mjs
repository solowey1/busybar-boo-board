#!/usr/bin/env node
// Writes BUSY Bar animation files (.anim, format "bicycle1", see lib/anim_file/anim_file_format.h in
// github.com/busy-app/busybar-firmware and https://developer.busy.app/file_formats.html).
// The bar plays them on its own, with no work for the app's JavaScript:
//   node agent/tools/anim.mjs pulse     -> apps/{board,agents}/src/animations/pulse.anim  (the blue wave of the mascot page)
//
// Layout (all little-endian): a 34-byte header, one section "default" covering every frame, then the frames,
// each a 5-byte header (encodings, mask length, pixel length) and its pixels. This writer keeps it to the simplest
// form the format allows: BGRA8888 pixels stored raw, the mask "fully white" (every pixel present).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** `frames` are Buffers of width*height*4 bytes, blue-green-red-alpha per pixel, rows top to bottom. */
export function encodeAnim({ width, height, fps, frames }) {
  const pixelBytes = width * height * 4;
  if (width > 255 || height > 255 || pixelBytes > 0xffff) throw new Error("the picture is too big for one frame");
  for (const f of frames) if (f.length !== pixelBytes) throw new Error("a frame has the wrong size");

  const section = Buffer.alloc(12);
  const name = Buffer.from("default\0");
  const sectionsLength = section.length + name.length;
  const headerLength = 34;
  section.writeUInt32LE(0, 0); // first frame
  section.writeUInt32LE(frames.length - 1, 4); // last frame
  section.writeUInt32LE(headerLength + sectionsLength, 8); // where the first frame starts in the file

  const frameChunks = frames.map((px) => {
    const head = Buffer.alloc(5);
    head.writeUInt8((1 << 4) | 0, 0); // mask: fully white (1), pixels: raw (0)
    head.writeUInt16LE(0, 1); // no mask data
    head.writeUInt16LE(px.length, 3);
    return Buffer.concat([head, px]);
  });
  const framesLength = frameChunks.reduce((n, c) => n + c.length, 0);

  const header = Buffer.alloc(headerLength);
  header.write("bicycle1", 0, "ascii");
  header.writeUInt8(0, 8); // flags
  header.writeUInt8(width, 9);
  header.writeUInt8(height, 10);
  header.writeUInt8(2, 11); // colour format: Bgra8888 (the one the stock animations use)
  header.writeUInt16LE(0, 12); // longest mask
  header.writeUInt16LE(pixelBytes, 14); // longest pixel data
  header.writeUInt8(fps, 16);
  header.writeUInt8(0, 17);
  header.writeUInt32LE(sectionsLength, 18);
  header.writeUInt32LE(framesLength, 22);
  header.writeUInt32LE(1, 26); // sections
  header.writeUInt32LE(frames.length, 30);
  return Buffer.concat([header, section, name, ...frameChunks]);
}

// ---- the pulse -----------------------------------------------------------------------------------
// The same wave as the mascot page draws itself (src/screens/mascot.ts): fronts growing from the middle, each with a
// long tail that fades towards the centre and away with the distance; squashed circles, wider than tall.
const W = 72;
const H = 16;
const BLUE = [0x4d, 0xa3, 0xff];
const FRAMES = 16;
const FRONTS = 2;
const REACH = 9;
const TAIL = 6;

function pulseFrame(f) {
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2) / 4.5;
      const dy = Math.abs(y + 0.5 - H / 2);
      const d = Math.hypot(dx, dy);
      let v = 0;
      for (let k = 0; k < FRONTS; k++) {
        const front = (((f + (k * FRAMES) / FRONTS) % FRAMES) / FRAMES) * REACH;
        const behind = front - d;
        if (behind < -0.75 || behind > TAIL) continue;
        const shape = behind < 0 ? 1 + behind / 0.75 : 1 - behind / TAIL;
        v = Math.max(v, shape * shape * (1 - front / REACH));
      }
      const o = (y * W + x) * 4;
      px[o] = Math.round(BLUE[2] * v); // blue
      px[o + 1] = Math.round(BLUE[1] * v); // green
      px[o + 2] = Math.round(BLUE[0] * v); // red
      px[o + 3] = 255;
    }
  }
  return px;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const what = process.argv[2];
  if (what !== "pulse") {
    console.error("usage: anim.mjs pulse");
    process.exit(1);
  }
  const data = encodeAnim({ width: W, height: H, fps: 12, frames: Array.from({ length: FRAMES }, (_, f) => pulseFrame(f)) });
  // The two apps that have the mascot page each carry the file: an app's package holds all it plays.
  for (const app of ["board", "agents"]) {
    const out = join(ROOT, "apps", app, "src", "animations", "pulse.anim");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
    console.log(`${out}: ${data.length} bytes, ${FRAMES} frames`);
  }
}
