import glyphs from "../glyphs.json";
import type { Config, El, Screen, ServerItem } from "../types";
import { DIM, WHITE, label, rgba, status, tr, xpm } from "../util";

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

/** The views, OK steps through them: icons, a list, a table of two columns; the setting names the first. */
const MODES = ["tiles", "list", "table"];
const modeOf = (cfg: Config, view: number): string => MODES[(Math.max(0, MODES.indexOf(cfg.s.serversView)) + view) % MODES.length];

/** A row of the list or the table is 8 pixels high; Play / Pause moves the rows up one row, in a few steps. */
const ROW = 8;
/** How far the rows have gone after each step of a move, as a fraction of the way: quick at first, then settling. */
const STEPS = [0.4, 0.7, 0.9, 1];
let lastMode = "";
let animFrom = 0;
let animTo = 0;
let animStep = STEPS.length;
let moving = false;

/**
 * Takes where the rows should end up (in pixels) and returns where to draw them now. A move takes one step for every picture
 * sent, not for every tick of the clock: the bar needs about a tenth of a second per picture, and steps tied to the clock
 * would be dropped or bunched up.
 */
function scrollPx(mode: string, target: number): number {
  if (mode !== lastMode) {
    lastMode = mode;
    animFrom = animTo = target;
    animStep = STEPS.length;
  }
  if (target !== animTo) {
    animFrom = animFrom + Math.round((animTo - animFrom) * (animStep < STEPS.length ? STEPS[animStep] : 1));
    animTo = target;
    animStep = 0;
  }
  const px = animStep < STEPS.length ? animFrom + Math.round((animTo - animFrom) * STEPS[animStep]) : animTo;
  if (animStep < STEPS.length) animStep++;
  moving = animStep < STEPS.length;
  return px;
}

const dotColor = (cfg: Config, it: ServerItem): string => pick(it.ok ? pick(it.color, cfg.s.serversColorOk) : pick(it.downColor, cfg.s.serversTileDown), "#6A6A6A");

/**
 * The list (one column) or the table (two): a 5x5 square in the server's colour and the name beside it, the name scrolling
 * when it does not fit. The squares of all rows are drawn into one screen-high bitmap, cut to what is visible (a bitmap may
 * not be taller than the display), and each name is a label placed by its bottom edge, so that one moving out at the top is
 * cut off by the screen. Three rows are always drawn (a row uses the slot of its number modulo 3), so while the rows move no
 * element goes away or appears, only positions change: one request per picture and no clearing.
 */
function rowsOf(cfg: Config, items: ServerItem[], cols: number, px: number): El[] {
  const width = cols === 1 ? 72 : 36;
  const rows = Math.ceil(items.length / cols);
  const first = Math.floor(px / ROW);
  const picture: string[][] = [];
  const colors: Record<string, string> = { z: "#000000" };
  const keyOf: Record<string, string> = {};
  const key = (hex: string): string => {
    if (!keyOf[hex]) {
      keyOf[hex] = "abcdefghijklmnopqrstuvwxy".charAt(Object.keys(keyOf).length);
      colors[keyOf[hex]] = hex;
    }
    return keyOf[hex];
  };
  for (let y = 0; y < 16; y++) {
    const line: string[] = [];
    for (let x = 0; x < (cols - 1) * width + 5; x++) line.push(".");
    picture.push(line);
  }
  const names: El[] = [];
  for (let r = 0; r < 3; r++) {
    const k = first + r;
    if (k >= rows) break;
    const bottom = ROW * (k + 1) - px;
    for (let c = 0; c < cols; c++) {
      const i = k * cols + c;
      if (i >= items.length) break;
      const it = items[i];
      const ch = key(dotColor(cfg, it));
      for (let dy = 0; dy < 5; dy++) {
        // The text of a row has its capitals on the 1st to the 5th pixel row above the row's bottom edge minus 2; so does the square.
        const y = bottom - 7 + dy;
        if (y < 0 || y > 15) continue;
        for (let dx = 0; dx < 5; dx++) if (DOT[dy].charAt(dx) !== ".") picture[y][c * width + dx] = ch;
      }
      names.push(label("s.n" + (k % 3) + c, it.name, bottom, { x: c * width + 8, width: width - 9, color: textColor(cfg, it), align: "bottom_left" }));
    }
  }
  return [xpm("s.dots", picture.map((l) => l.join("")), 0, 0, colors)].concat(names);
}

/** 5 -> "5m", 130 -> "2h", 4000 -> "2d" */
function fmtAge(cfg: Config, minutes: number): string {
  const u = tr(cfg, "ageUnits").split(",");
  if (minutes < 60) return minutes + u[0];
  if (minutes < 48 * 60) return Math.floor(minutes / 60) + u[1];
  return Math.floor(minutes / 1440) + u[2];
}

/** The small font is about 4 px a character; the card's text starts here, to the right of the tile. */
const CARD_X = 19;
const CARD_W = 72 - CARD_X;

/**
 * A line of the card in two tones: the text, then (semi-transparent, so it reads as secondary) what goes with it, such as the
 * address or how long the server has been up. The second part takes the room that is left and scrolls when it does not fit; if
 * the text itself leaves less than a few characters of room, it scrolls alone.
 */
function twoTone(id: string, text: string, color: string, extra: string, extraColor: string, bottom: number): El[] {
  const w = text.length * 4 + 4;
  if (!extra || w > CARD_W - 8) return [label(id, text, bottom, { x: CARD_X, width: CARD_W, color, align: "bottom_left" })];
  const room = CARD_W - w;
  return [
    label(id, text, bottom, { x: CARD_X, width: w, color, align: "bottom_left", scroll_rate: 0 }),
    label(id + "x", extra, bottom, { x: CARD_X + w, width: room, color: extraColor, align: "bottom_left", scroll_rate: extra.length * 4 > room ? 1200 : 0 }),
  ];
}

export const servers: Screen = {
  id: "servers",
  title: (cfg) => tr(cfg, "servers"),
  // OK changes the view: icons, list, table.
  views: ({ data }) => (data.servers && data.servers.items.length > 0 ? MODES.length : 1),
  // Play / Pause depends on the view. Icons: one server at a time, with its details, then back to the icons.
  // List and table: the rows move up one at a time (and round to the first again when the last has been shown).
  start({ cfg, data, view, extra }) {
    const n = data.servers ? data.servers.items.length : 0;
    if (n === 0) return {};
    const mode = modeOf(cfg, view);
    if (mode === "tiles") return { extra: (extra + 1) % (n + 1) };
    const rows = mode === "list" ? n : Math.ceil(n / 2);
    // Two rows fit on the screen; the rows beyond them are what Play / Pause brings up.
    return rows > 2 ? { extra: (extra + 1) % (rows - 1) } : {};
  },
  // While the rows are moving the screen is drawn often.
  tickMs: () => (moving ? 20 : 333),
  leave() {
    lastMode = "";
    moving = false;
  },
  elements({ cfg, data, view, extra, at, recvAt }) {
    const s = data.servers;
    const name = tr(cfg, "servers");
    if (!s) return status("s", name, tr(cfg, "noData"));
    if (s.items.length === 0) return status("s", name, tr(cfg, "notSet"));
    const mode = modeOf(cfg, view);

    if (mode === "tiles") {
      lastMode = mode;
      moving = false;
      if (extra > 0 && s.items[extra - 1]) {
        // One server: its tile with the icon on the left; its name and address above, below whether it answers and for how long.
        const it = s.items[extra - 1];
        const age = (it.age || 0) + Math.floor((at - recvAt) / 60000);
        const color = textColor(cfg, it);
        const stateText = it.ok ? tr(cfg, "online") : tr(cfg, "offline");
        return [
          tilesBitmap(cfg, [it], [{ x: 0, y: 0, size: 16 }]),
          ...twoTone("s.c1", it.name, WHITE, it.host && it.host !== it.name ? it.host : "", DIM, 8),
          ...twoTone("s.c2", stateText, color, fmtAge(cfg, age), color.slice(0, 7) + "80", 15),
        ];
      }
      const places = tilePlaces(s.items.length);
      return [tilesBitmap(cfg, s.items, places)].concat(tileLetters(s.items, places));
    }

    const cols = mode === "list" ? 1 : 2;
    const rows = Math.ceil(s.items.length / cols);
    const span = Math.max(0, rows - 2);
    const px = scrollPx(mode, Math.min(extra, span) * ROW);
    return rowsOf(cfg, s.items, cols, px);
  },
};
