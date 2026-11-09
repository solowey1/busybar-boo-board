import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (file, args) =>
  new Promise((resolve, reject) => execFile(file, args, { timeout: 10_000 }, (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(out))));

/** Reads an uncompressed 24/32-bit BMP (what `sips -s format bmp` writes) into [{r,g,b}] rows, top first. */
export function parseBmp(buf) {
  if (buf.length < 54 || buf.toString("latin1", 0, 2) !== "BM") throw new Error("not a BMP");
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bits = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if ((bits !== 24 && bits !== 32) || (compression !== 0 && compression !== 3)) throw new Error(`unsupported BMP (${bits} bit, compression ${compression})`);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const bytes = bits / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const pixels = [];
  for (let y = 0; y < height; y++) {
    const row = bottomUp ? height - 1 - y : y;
    for (let x = 0; x < width; x++) {
      const i = offset + row * stride + x * bytes;
      pixels.push({ r: buf[i + 2], g: buf[i + 1], b: buf[i] });
    }
  }
  return { width, height, pixels };
}

/** Median-cut palette of at most `n` colours. */
export function quantize(pixels, n) {
  let boxes = [pixels.map((p, i) => ({ ...p, i }))];
  const range = (box, ch) => {
    let lo = 255;
    let hi = 0;
    for (const p of box) {
      lo = Math.min(lo, p[ch]);
      hi = Math.max(hi, p[ch]);
    }
    return hi - lo;
  };
  while (boxes.length < n) {
    // Split the box that spans the widest colour range.
    let best = -1;
    let bestSpan = 0;
    let bestCh = "r";
    boxes.forEach((box, idx) => {
      if (box.length < 2) return;
      for (const ch of ["r", "g", "b"]) {
        const span = range(box, ch);
        if (span > bestSpan) {
          bestSpan = span;
          best = idx;
          bestCh = ch;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  const palette = boxes.map((box) => {
    const sum = box.reduce((s, p) => ({ r: s.r + p.r, g: s.g + p.g, b: s.b + p.b }), { r: 0, g: 0, b: 0 });
    return { r: Math.round(sum.r / box.length), g: Math.round(sum.g / box.length), b: Math.round(sum.b / box.length) };
  });
  const index = new Array(pixels.length);
  boxes.forEach((box, k) => box.forEach((p) => (index[p.i] = k)));
  return { palette, index };
}

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEF"; // 32 symbols: at most 31 colours + "none"
const hex = (v) => v.toString(16).padStart(2, "0");

/**
 * XPM2 text for the bar's `xpmbitmap` element (<= 32 colours, cpp 1).
 * With `rounded`, the four corner pixels become transparent (`none`).
 */
export function toXpm2({ width, height, pixels }, { rounded = true } = {}) {
  const corner = (i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
  };
  const solid = pixels.filter((_, i) => !(rounded && corner(i)));
  const { palette, index } = quantize(solid, rounded ? 31 : 32);
  const lines = ["! XPM2", `${width} ${height} ${palette.length + (rounded ? 1 : 0)} 1`];
  palette.forEach((c, k) => lines.push(`${CHARS[k]} c #${hex(c.r)}${hex(c.g)}${hex(c.b)}`));
  const none = CHARS[palette.length];
  if (rounded) lines.push(`${none} c none`);
  let s = 0;
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      row += rounded && corner(i) ? none : CHARS[index[s++]];
    }
    lines.push(row);
  }
  return lines.join("\n");
}

/** Album art (base64 JPEG/PNG) -> 16x16 XPM2 text, via macOS `sips`. Returns null when it cannot be done. */
export async function artworkToXpm(base64, { size = 16, rounded = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "bbs-art-"));
  try {
    const src = join(dir, "in");
    const out = join(dir, "out.bmp");
    await writeFile(src, Buffer.from(base64, "base64"));
    const info = await run("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", src]);
    const w = Number(/pixelWidth:\s*(\d+)/.exec(info)?.[1]);
    const h = Number(/pixelHeight:\s*(\d+)/.exec(info)?.[1]);
    if (!w || !h) return null;
    const side = Math.min(w, h);
    // Centre-crop to a square, then shrink. Two calls: one sips invocation applies the operations in its own order.
    const square = join(dir, "square");
    await run("/usr/bin/sips", ["-s", "format", "png", "-c", String(side), String(side), src, "--out", square]);
    // BMP is the one format that is trivial to read back.
    await run("/usr/bin/sips", ["-z", String(size), String(size), "-s", "format", "bmp", square, "--out", out]);
    return toXpm2(parseBmp(await readFile(out)), { rounded });
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
