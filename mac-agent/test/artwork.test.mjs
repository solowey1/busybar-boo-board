import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artworkToXpm, parseBmp, quantize, toXpm2 } from "../src/artwork.mjs";

/** A bottom-up 24-bit BMP, rows padded to 4 bytes, from [{r,g,b}] rows (top first). */
function makeBmp(width, height, pixel) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + stride * height);
  buf.write("BM", 0, "latin1");
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const { r, g, b } = pixel(x, y);
      const i = 54 + (height - 1 - y) * stride + x * 3;
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
    }
  return buf;
}

test("parseBmp reads rows top-first and handles row padding", () => {
  const bmp = parseBmp(makeBmp(3, 2, (x, y) => ({ r: x * 50, g: y * 100, b: 7 })));
  assert.equal(bmp.width, 3);
  assert.equal(bmp.height, 2);
  assert.deepEqual(bmp.pixels[0], { r: 0, g: 0, b: 7 });
  assert.deepEqual(bmp.pixels[5], { r: 100, g: 100, b: 7 });
});

test("quantize never returns more colours than asked and maps every pixel", () => {
  const pixels = Array.from({ length: 256 }, (_, i) => ({ r: i, g: 255 - i, b: (i * 7) % 256 }));
  const { palette, index } = quantize(pixels, 31);
  assert.ok(palette.length <= 31);
  assert.equal(index.length, 256);
  assert.ok(index.every((k) => k >= 0 && k < palette.length));
});

test("toXpm2 follows the bar's limits: <=32 colours, cpp 1, transparent corners", () => {
  const bmp = parseBmp(makeBmp(16, 16, (x, y) => ({ r: x * 16, g: y * 16, b: (x + y) * 8 })));
  const xpm = toXpm2(bmp, { rounded: true });
  const lines = xpm.split("\n");
  assert.equal(lines[0], "! XPM2");
  const [w, h, n, cpp] = lines[1].split(" ").map(Number);
  assert.deepEqual([w, h, cpp], [16, 16, 1]);
  assert.ok(n <= 32);
  assert.equal(lines.length, 2 + n + 16);
  const none = lines.slice(2, 2 + n).find((l) => l.endsWith(" c none")).split(" ")[0];
  const rows = lines.slice(2 + n);
  assert.ok(rows.every((r) => r.length === 16));
  for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) assert.equal(rows[y][x], none);
  assert.notEqual(rows[1][1], none);
  assert.ok(!toXpm2(bmp, { rounded: false }).includes(" c none"));
});

test("artworkToXpm: a real JPEG goes through sips into a 16x16 XPM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bbs-test-"));
  const bmpPath = join(dir, "src.bmp");
  writeFileSync(bmpPath, makeBmp(40, 30, (x) => (x < 20 ? { r: 220, g: 30, b: 30 } : { r: 20, g: 40, b: 200 })));
  const jpg = join(dir, "src.jpg");
  execFileSync("/usr/bin/sips", ["-s", "format", "jpeg", bmpPath, "--out", jpg], { stdio: "ignore" });
  const xpm = await artworkToXpm(readFileSync(jpg).toString("base64"));
  assert.ok(xpm?.startsWith("! XPM2\n16 16 "));
  assert.equal(await artworkToXpm(Buffer.from("not an image").toString("base64")), null);
});
