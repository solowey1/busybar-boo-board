#!/usr/bin/env node
// Draws every icon of the project from one picture: a rainbow ghost made of LED dots.
//   icons.mjs appmeta <dir>   the app's icons for the bar (8x8 colour, 11x11 grey)
//   icons.mjs modules <apps>  the icons of the single-screen apps, a picture and the screen's colour for each (apps/<name>/src/appmeta)
//   icons.mjs tray <dir>      menu-bar icons, one PNG per style (@2x, 44x36 px)
//   icons.mjs iconset <dir>   the macOS app icon as an .iconset folder (turn it into .icns with iconutil)
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const COLORS = { orange: "#D97757", green: "#3DDC84", blue: "#4DA3FF", yellow: "#FFD000" };
/** The colour of each band, by style: "rainbow" keeps the bands, the others use one colour; "mono" is black, a template. */
export const STYLES = {
  mono: null,
  orange: COLORS.orange,
  rainbow: "bands",
  green: COLORS.green,
  blue: COLORS.blue,
};
const colorOf = (style, band) => (style === "mono" ? "#000000" : STYLES[style] === "bands" ? COLORS[band] : STYLES[style]);

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---- a minimal PNG writer ---------------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** channels: 1 = grey, 4 = RGBA; `px` holds width*height*channels bytes. */
export function png(width, height, channels, px) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = channels === 1 ? 0 : 6;
  const rows = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * channels + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * width * channels, width * channels).copy(rows, y * (width * channels + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- the picture -------------------------------------------------------------------------------
// A ghost: eleven by eleven dots, a colour band per row, eyes cut out, a wavy hem.
export const GHOST = ["...xxxxx...", "..xxxxxxx..", ".xxxxxxxxx.", ".xx.xxx.xx.", ".xx.xxx.xx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxx.xxxx.", ".xxx...xxx."];
/** Orange, yellow, green and blue, as on the screen. */
export const BANDS = ["orange", "orange", "orange", "yellow", "yellow", "yellow", "green", "green", "blue", "blue", "blue"];

/** An RGBA canvas with simple, antialiased-by-supersampling shapes. */
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  rect(x0, y0, x1, y1, [r, g, b], a = 255) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        const i = (y * this.w + x) * 4;
        this.px[i] = r;
        this.px[i + 1] = g;
        this.px[i + 2] = b;
        this.px[i + 3] = a;
      }
  }
  /** A rounded square: pixels whose centre lies inside it. */
  round(x0, y0, x1, y1, rad, rgb) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        const dx = Math.max(x0 + rad - cx, 0, cx - (x1 - rad));
        const dy = Math.max(y0 + rad - cy, 0, cy - (y1 - rad));
        if (dx * dx + dy * dy <= rad * rad) this.rect(x, y, x + 1, y + 1, rgb);
      }
  }
  /** Halves the size, averaging 2x2 blocks (premultiplied), for smooth edges. */
  half() {
    const out = new Canvas(this.w >> 1, this.h >> 1);
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const i = ((y * 2 + dy) * this.w + x * 2 + dx) * 4;
          const al = this.px[i + 3];
          r += this.px[i] * al;
          g += this.px[i + 1] * al;
          b += this.px[i + 2] * al;
          a += al;
        }
        const o = (y * out.w + x) * 4;
        if (a) {
          out.px[o] = r / a;
          out.px[o + 1] = g / a;
          out.px[o + 2] = b / a;
        }
        out.px[o + 3] = a / 4;
      }
    return out;
  }
}

/** The ghost as LED dots. `cell` is the pitch in pixels, `dot` the lit part of it. */
function ghost(cv, ox, oy, cell, dot, style, round = 0) {
  GHOST.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "x") continue;
      const rgb = hex(colorOf(style, BANDS[y]));
      const px = ox + x * cell;
      const py = oy + y * cell;
      round ? cv.round(px, py, px + dot, py + dot, round, rgb) : cv.rect(px, py, px + dot, py + dot, rgb);
    }
  });
}

/** The 8x8 colour icon for the bar's menu: the same ghost, smaller. */
export function appIconFront() {
  const small = ["..xxxx..", ".xxxxxx.", "xx.xx.xx", "xx.xx.xx", "xxxxxxxx", "xxxxxxxx", "xxxxxxxx", "x.xx.xx."];
  const bands = ["orange", "orange", "yellow", "yellow", "green", "green", "blue", "blue"];
  const cv = new Canvas(8, 8);
  small.forEach((row, y) => row.split("").forEach((c, x) => c === "x" && cv.rect(x, y, x + 1, y + 1, hex(COLORS[bands[y]]))));
  return png(8, 8, 4, cv.px);
}

/** The 11x11 greyscale icon: the ghost on black, a lighter grey for each band. */
export function appIconBack() {
  const grey = { orange: 170, yellow: 235, green: 200, blue: 130 };
  const px = new Uint8Array(11 * 11);
  GHOST.forEach((row, y) => row.split("").forEach((c, x) => c === "x" && (px[y * 11 + x] = grey[BANDS[y]])));
  return png(11, 11, 1, px);
}

/**
 * The icons of the single-screen apps: a picture of the screen in the screen's own colour (the default accent colour of its
 * settings), 8x8 for the colour menu and 11x11 for the grey one.
 */
export const MODULE_ICONS = {
  music: {
    color: "#FFFFFF",
    front: ["..######", "..#....#", "..#....#", "..#....#", ".##...##", "###..###", ".##...##", "........"],
    back: ["..#########", "..#.......#", "..#.......#", "..#.......#", "..#.......#", "..#.......#", ".##......##", "###.....###", ".##......##", "...........", "..........."],
  },
  agents: {
    color: "#D97757",
    front: [".######.", ".#.##.#.", ".######.", "########", "########", ".######.", ".#.##.#.", "........"],
    back: ["..#######..", ".#########.", ".##.###.##.", ".#########.", "###########", "###########", ".#########.", ".#########.", ".##.###.##.", ".#.......#.", "..........."],
  },
  servers: {
    color: "#3DDC84",
    front: ["########", "#.#....#", "########", "........", "########", "#.#....#", "########", "........"],
    back: ["###########", "#.#.......#", "###########", "...........", "###########", "#.#.......#", "###########", "...........", "###########", "#.#.......#", "###########"],
  },
  calendar: {
    color: "#FF3B30",
    front: [".#....#.", "########", "#......#", "#.#.#..#", "#......#", "#.#.#..#", "########", "........"],
    back: ["..#.....#..", "###########", "###########", "#.........#", "#..#.#.#..#", "#.........#", "#..#.#.#..#", "#.........#", "#..#.#....#", "###########", "..........."],
  },
  work: {
    color: "#4DA3FF",
    front: ["..####..", ".#....#.", "#..#...#", "#..#...#", "#..###.#", "#......#", ".#....#.", "..####.."],
    back: ["...#####...", "..#.....#..", ".#...#...#.", "#....#....#", "#....#....#", "#....###..#", "#.........#", ".#.......#.", "..#.....#..", "...#####...", "..........."],
  },
};

/** The 8x8 colour icon of a single-screen app. */
export function moduleIconFront(name) {
  const { color, front } = MODULE_ICONS[name];
  const cv = new Canvas(8, 8);
  front.forEach((row, y) => row.split("").forEach((c, x) => c === "#" && cv.rect(x, y, x + 1, y + 1, hex(color))));
  return png(8, 8, 4, cv.px);
}

/** The 11x11 greyscale icon: the picture at the brightness of the screen's colour (not darker than a dim grey, so it can be seen). */
export function moduleIconBack(name) {
  const { color, back } = MODULE_ICONS[name];
  const [r, g, b] = hex(color);
  const grey = Math.max(110, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  const px = new Uint8Array(11 * 11);
  back.forEach((row, y) => row.split("").forEach((c, x) => c === "#" && (px[y * 11 + x] = grey)));
  return png(11, 11, 1, px);
}

/** A menu-bar icon at 44x36 px (22x18 pt @2x): solid pixels, three to a dot. */
export function trayIcon(style) {
  const cv = new Canvas(44, 36);
  ghost(cv, 5, 2, 3, 3, style);
  return png(44, 36, 4, cv.px);
}

/** The app icon at `size` px: a dark rounded square with the LED ghost on it. */
export function appIcon(size) {
  const s = size * 2;
  const cv = new Canvas(s, s);
  const pad = s * 0.06;
  cv.round(pad, pad, s - pad, s - pad, s * 0.2, [28, 28, 32]);
  const cell = Math.floor((s * 0.64) / 11);
  const dot = Math.max(1, Math.round(cell * 0.78));
  const ox = Math.round((s - 11 * cell) / 2 + (cell - dot) / 2);
  const oy = Math.round((s - 11 * cell) / 2 + (cell - dot) / 2);
  ghost(cv, ox, oy, cell, dot, "rainbow", dot * 0.22);
  const out = cv.half();
  return png(size, size, 4, new Uint8Array(out.px));
}

// ---- command line -----------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind, dir] = process.argv.slice(2);
  if (!dir) {
    console.error("usage: icons.mjs appmeta|modules|tray|iconset <dir>");
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  if (kind === "modules") {
    for (const name of Object.keys(MODULE_ICONS)) {
      const meta = join(dir, name, "src", "appmeta");
      mkdirSync(meta, { recursive: true });
      writeFileSync(join(meta, "icon_front_8x8.png"), moduleIconFront(name));
      writeFileSync(join(meta, "icon_back_11x11.png"), moduleIconBack(name));
    }
  } else if (kind === "appmeta") {
    writeFileSync(join(dir, "icon_front_8x8.png"), appIconFront());
    writeFileSync(join(dir, "icon_back_11x11.png"), appIconBack());
  } else if (kind === "tray") {
    for (const style of Object.keys(STYLES)) writeFileSync(join(dir, `tray-${style}.png`), trayIcon(style));
  } else if (kind === "iconset") {
    for (const [name, size] of [["16x16", 16], ["16x16@2x", 32], ["32x32", 32], ["32x32@2x", 64], ["128x128", 128], ["128x128@2x", 256], ["256x256", 256], ["256x256@2x", 512], ["512x512", 512], ["512x512@2x", 1024]]) {
      writeFileSync(join(dir, `icon_${name}.png`), appIcon(size));
    }
  } else {
    console.error("unknown kind " + kind);
    process.exit(1);
  }
}
