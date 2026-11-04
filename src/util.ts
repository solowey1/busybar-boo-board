import type { El } from "./types";

export { tr } from "./i18n";

export const WHITE = "#FFFFFFFF";
export const DIM = "#FFFFFF80";
export const FAINT = "#FFFFFF30";
export const GREEN = "#00E060FF";
export const RED = "#FF3030FF";
export const AMBER = "#FFB000FF";
export const BLUE = "#40A0FFFF";
export const YELLOW = "#FFD000FF";
/** Claude's brand orange, and a slightly darker one that sets text apart from the mascot. */
export const BRAND = "#D97757FF";
/** Text next to the mascot is lighter than the mascot itself, so the two stay apart. */
export const BRAND_TEXT = "#F2AE92FF";
/** A grey lighter than DIM, for secondary figures. */
export const DIM_LIGHT = "#FFFFFFB0";

/** "#RRGGBB" and an alpha byte as hex -> "#RRGGBBAA", the form the device takes. */
export const rgba = (hex: string, alpha: string = "FF"): string => hex.slice(0, 7).toUpperCase() + alpha;

/** Mixes a "#RRGGBB" colour with `with` ("#RRGGBB"); `f` of 0 keeps it, 1 gives `with`. */
export function mix(hex: string, f: number, withHex: string = "#FFFFFF"): string {
  let out = "#";
  for (let i = 1; i < 7; i += 2) {
    const a = parseInt(hex.slice(i, i + 2), 16);
    const b = parseInt(withHex.slice(i, i + 2), 16);
    const v = Math.round(a + (b - a) * f);
    out += (v < 16 ? "0" : "") + v.toString(16);
  }
  return out.toUpperCase();
}

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

/** 451_615 -> "452K", 1_478_036 -> "1.5M" */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (Math.round(n / 100_000) / 10).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

/** Seconds -> "3:42" (hours:minutes). */
export function fmtHM(sec: number): string {
  const m = Math.floor(sec / 60);
  return Math.floor(m / 60) + ":" + pad2(m % 60);
}

/** A text label; text wider than `width` is scrolled by the firmware. */
export function label(id: string, text: string, y: number, o: Partial<El> = {}): El {
  return {
    id,
    type: "text",
    text: text.length ? text : " ",
    font: "small",
    color: WHITE,
    x: 0,
    y,
    align: "top_left",
    display: "front",
    width: 72,
    scroll_rate: 1200,
    scroll_start_delay: 1500,
    scroll_repeat_delay: 2500,
    ...o,
  };
}

/** Two lines centred on the screen: a title and a status, e.g. "Календарь" / "Доступа нет". */
export function status(id: string, title: string, text: string, titleColor: string = WHITE, textColor: string = DIM): El[] {
  const mid = { align: "top_mid", x: 36, width: undefined, scroll_rate: 0 };
  return [label(id + ".1", title, 0, { color: titleColor, ...mid }), label(id + ".2", text, 8, { color: textColor, ...mid })];
}

/**
 * A text centred in the strip [x, x + width). A text too long for the strip starts at its left edge and
 * is scrolled by the firmware instead.
 */
export function centered(id: string, text: string, y: number, x: number, width: number, anchor: "top" | "bottom", o: Partial<El> = {}): El {
  const fits = text.length * 4.5 <= width;
  return fits
    ? label(id, text, y, { align: anchor + "_mid", x: x + Math.floor(width / 2), width: undefined, scroll_rate: 0, ...o })
    : label(id, text, y, { align: anchor + "_left", x, width, ...o });
}

/** A filled bar `w` pixels wide. */
export function bar(id: string, x: number, y: number, w: number, h: number, color: string): El {
  return { id, type: "rectangle", x, y, width: w, height: h, fill: "solid", fill_colors: [color], border_width: 0, align: "top_left", display: "front" };
}

/** Counts down (or up) on the firmware's own clock; no redraw needed. */
export function countdown(id: string, toEpochSec: number, x: number, y: number, o: Partial<El> = {}): El {
  return { id, type: "countdown", timestamp: String(toEpochSec), direction: "time_left", show_hours: "when_non_zero", color: WHITE, x, y, align: "top_left", display: "front", ...o };
}

/**
 * An XPM2 bitmap element. `rows` are strings of one character per pixel, "." is transparent;
 * `colors` maps every other character to "#RRGGBB".
 */
export function xpm(id: string, rows: string[], x: number, y: number, colors: Record<string, string>, o: Partial<El> = {}): El {
  const keys = Object.keys(colors);
  const head = "! XPM2\n" + rows[0].length + " " + rows.length + " " + (keys.length + 1) + " 1\n. c none\n";
  const table = keys.map((k) => k + " c " + colors[k]).join("\n");
  return { id, type: "xpmbitmap", data: head + table + "\n" + rows.join("\n"), x, y, align: "top_left", display: "front", ...o };
}

/** A thin progress line along the bottom edge: a faint track and, over it, the filled part. */
export function progressLine(prefix: string, x: number, width: number, fraction: number, color: string): El[] {
  const els = [bar(prefix + ".bg", x, 15, width, 1, FAINT)];
  const w = Math.max(0, Math.min(width, Math.round(width * fraction)));
  if (w > 0) els.push(bar(prefix + ".fg", x, 15, w, 1, color));
  return els;
}
