import glyphs from "../glyphs.json";
import type { Config, El, Screen, ServerItem } from "../types";
import { centered, label, rgba, status, tr, xpm } from "../util";

/** One string of 81 characters per glyph; the rows are cut out only for the glyphs on the screen. */
const GLYPHS = glyphs as unknown as Record<string, string>;
const glyphRows = (name: string | undefined): string[] => {
  const g = GLYPHS[name || "server"] || GLYPHS.server;
  const rows: string[] = [];
  for (let y = 0; y < 9; y++) rows.push(g.slice(y * 9, y * 9 + 9));
  return rows;
};

/** "#RRGGBB", or the fallback when the server has none of its own. */
const pick = (own: string | undefined, fallback: string): string => (own && own.length === 7 ? own : fallback);

const tileColor = (cfg: Config, it: ServerItem): string => (it.ok ? pick(it.color, cfg.s.serversColorOk) : pick(it.downColor, cfg.s.serversTileDown));
const textColor = (cfg: Config, it: ServerItem): string => rgba(it.ok ? pick(it.color, cfg.s.serversColorOk) : pick(it.downColor, cfg.s.serversColorDown));

/**
 * How the tiles sit on the 72x16 screen: up to 5 servers in one row (the fewer, the bigger),
 * more in two rows of 7-pixel tiles.
 */
export function tileLayout(n: number): { size: number; gap: number; rows: number[] } {
  if (n <= 3) return { size: 16, gap: 4, rows: [n] };
  if (n === 4) return { size: 14, gap: 4, rows: [4] };
  if (n === 5) return { size: 12, gap: 3, rows: [5] };
  const first = Math.ceil(n / 2);
  return { size: 7, gap: 2, rows: [first, n - first] };
}

/** Where each tile goes on the screen (x, y, size), left to right, top to bottom. */
function tilePlaces(n: number): { x: number; y: number; size: number }[] {
  const { size, gap, rows } = tileLayout(n);
  const height = rows.length * size + (rows.length - 1) * gap;
  const out: { x: number; y: number; size: number }[] = [];
  rows.forEach((count, ry) => {
    const rowWidth = count * size + (count - 1) * gap;
    for (let i = 0; i < count; i++) out.push({ x: Math.floor((72 - rowWidth) / 2) + i * (size + gap), y: Math.floor((16 - height) / 2) + ry * (size + gap), size });
  });
  return out;
}

/**
 * A glyph cut down to its ink and, where the room around it would be odd (a 9-pixel icon on a 16-pixel tile
 * leaves 3.5 each side), made one pixel wider or taller by doubling its middle column or row, so that the
 * margins come out equal on all four sides.
 */
function fitGlyph(gl: string[], size: number): string[] {
  let x0 = 9;
  let y0 = 9;
  let x1 = -1;
  let y1 = -1;
  gl.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row.charAt(x) === "#") {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  });
  if (x1 < 0) return gl;
  let rows = gl.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
  if ((size - rows[0].length) % 2 !== 0) {
    const mid = Math.floor(rows[0].length / 2);
    rows = rows.map((r) => r.slice(0, mid + 1) + r.slice(mid));
  }
  if ((size - rows.length) % 2 !== 0) {
    const mid = Math.floor(rows.length / 2);
    rows = rows.slice(0, mid + 1).concat(rows.slice(mid));
  }
  return rows;
}

/**
 * What a tile of this size carries: the server's icon on big tiles; on a medium one the icon gets
 * hard to read, so the name's first letter takes its place; on small ones nothing, the colour alone tells.
 */
const ICON_MIN = 14;
const LETTER_MIN = 12;

/** One bitmap with all the tiles: rounded squares in the server's colour, with its icon cut out of them. */
function tilesBitmap(cfg: Config, items: ServerItem[], places: { x: number; y: number; size: number }[]): El {
  const x0 = Math.min.apply(null, places.map((p) => p.x));
  const y0 = Math.min.apply(null, places.map((p) => p.y));
  const w = Math.max.apply(null, places.map((p) => p.x + p.size)) - x0;
  const h = Math.max.apply(null, places.map((p) => p.y + p.size)) - y0;
  const keys = "abcdefghijklmnopqrstuvwxyzABCDEF";
  const colors: Record<string, string> = {};
  const keyOf: Record<string, string> = {};
  const key = (hex: string): string => {
    if (!keyOf[hex]) {
      keyOf[hex] = keys.charAt(Object.keys(keyOf).length);
      colors[keyOf[hex]] = hex;
    }
    return keyOf[hex];
  };
  const grid: string[][] = [];
  for (let y = 0; y < h; y++) {
    const r: string[] = [];
    for (let x = 0; x < w; x++) r.push(".");
    grid.push(r);
  }
  places.forEach((pl, i) => {
    const it = items[i];
    const k = key(tileColor(cfg, it));
    const gl = pl.size >= ICON_MIN ? fitGlyph(glyphRows(it.icon), pl.size) : null;
    const gw = gl ? gl[0].length : 0;
    const gh = gl ? gl.length : 0;
    const gx = (pl.size - gw) / 2;
    const gy = (pl.size - gh) / 2;
    for (let y = 0; y < pl.size; y++) {
      for (let x = 0; x < pl.size; x++) {
        // Rounded corners: one pixel off a small tile, a 3-pixel notch off a big one.
        const cx = Math.min(x, pl.size - 1 - x);
        const cy = Math.min(y, pl.size - 1 - y);
        if (cx + cy < (pl.size >= 14 ? 2 : 1)) continue;
        const gxp = x - gx;
        const gyp = y - gy;
        const lit = gl !== null && gxp >= 0 && gxp < gw && gyp >= 0 && gyp < gh && gl[gyp].charAt(gxp) === "#";
        grid[pl.y - y0 + y][pl.x - x0 + x] = lit ? "." : k;
      }
    }
  });
  return xpm("s.tiles", grid.map((r) => r.join("")), x0, y0, colors);
}

/** The first letters on the medium tiles: black text over the tile, so it reads as cut out. */
function tileLetters(items: ServerItem[], places: { x: number; y: number; size: number }[]): El[] {
  const out: El[] = [];
  places.forEach((pl, i) => {
    if (pl.size >= ICON_MIN || pl.size < LETTER_MIN) return;
    const ch = (items[i].name.charAt(0) || "?").toUpperCase();
    // A capital of the small font is 5 px tall and starts 2 px below the label's top.
    out.push(label("s.l" + i, ch, pl.y + Math.ceil((pl.size - 5) / 2) - 2, { color: "#000000FF", align: "top_mid", x: pl.x + Math.ceil(pl.size / 2), width: undefined, scroll_rate: 0, z_index: 2 }));
  });
  return out;
}

const DOT = [".aaa.", "aaaaa", "aaaaa", "aaaaa", ".aaa."];

/** Two centred lines; a line too long for the screen scrolls. */
const two = (id: string, a: string, aColor: string, b: string, bColor: string) => [centered(id + ".1", a, 0, 0, 72, "top", { color: aColor }), centered(id + ".2", b, 8, 0, 72, "top", { color: bColor })];

export const servers: Screen = {
  id: "servers",
  title: (cfg) => tr(cfg, "servers"),
  // Tiles: OK steps through the servers one by one, after the tiles. List: OK turns the page.
  views: ({ cfg, data }) => {
    const n = data.servers ? data.servers.items.length : 0;
    return cfg.s.serversView === "list" ? Math.max(1, Math.ceil(n / 2)) : n > 0 ? n + 1 : 1;
  },
  elements({ cfg, data, view }) {
    const s = data.servers;
    const name = tr(cfg, "servers");
    if (!s) return status("s", name, tr(cfg, "noData"));
    if (s.items.length === 0) return status("s", name, tr(cfg, "notSet"));

    if (cfg.s.serversView === "list") {
      // Two servers a page: a square in the server's colour, the name beside it.
      const page = s.items.slice(view * 2, view * 2 + 2);
      const els: El[] = [];
      page.forEach((it, i) => {
        const y = i * 8;
        // A 5x5 square with rounded corners, in the server's colour.
        els.push(xpm("s.d" + i, DOT, 0, y + 2, { a: pick(it.ok ? pick(it.color, cfg.s.serversColorOk) : pick(it.downColor, cfg.s.serversTileDown), "#6A6A6A") }));
        els.push(label("s.n" + i, it.name, y, { x: 8, width: 64, color: textColor(cfg, it) }));
      });
      return els;
    }

    if (view > 0 && s.items[view - 1]) {
      const it = s.items[view - 1];
      return two("s", it.name, rgba(it.ok ? pick(it.color, cfg.s.serversColorOk) : pick(it.downColor, cfg.s.serversTileDown), "C0"), it.ok ? tr(cfg, "online") : tr(cfg, "offline"), textColor(cfg, it));
    }
    const places = tilePlaces(s.items.length);
    return [tilesBitmap(cfg, s.items, places)].concat(tileLetters(s.items, places));
  },
};
