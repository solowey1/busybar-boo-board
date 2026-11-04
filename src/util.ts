import type { El } from "./types";

export const WHITE = "#FFFFFFFF";
export const DIM = "#FFFFFF80";
export const FAINT = "#FFFFFF30";
export const GREEN = "#00E060FF";
export const RED = "#FF3030FF";
export const AMBER = "#FFB000FF";
export const BLUE = "#40A0FFFF";

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

/** A filled bar `w` pixels wide. */
export function bar(id: string, x: number, y: number, w: number, h: number, color: string): El {
  return { id, type: "rectangle", x, y, width: w, height: h, fill: "solid", fill_colors: [color], border_width: 0, align: "top_left", display: "front" };
}

/** Counts down (or up) on the firmware's own clock; no redraw needed. */
export function countdown(id: string, toEpochSec: number, x: number, y: number, o: Partial<El> = {}): El {
  return { id, type: "countdown", timestamp: String(toEpochSec), direction: "time_left", show_hours: "when_non_zero", color: WHITE, x, y, align: "top_left", display: "front", ...o };
}

/** An XPM2 bitmap element; `rows` use "#" for ink and "." for transparent. */
export function icon(id: string, rows: string[], x: number, y: number, color: string): El {
  const body = rows.map((r) => r.replace(/#/g, "a").replace(/\./g, "b")).join("\n");
  const data = "! XPM2\n" + rows[0].length + " " + rows.length + " 2 1\na c " + color.slice(0, 7) + "\nb c none\n" + body;
  return { id, type: "xpmbitmap", data, x, y, align: "top_left", display: "front" };
}

export const ICON_PLAY = ["#..", "##.", "###", "##.", "#.."];
export const ICON_PAUSE = ["#.#", "#.#", "#.#", "#.#", "#.#"];

/** A thin progress line along the bottom edge: a faint track and, over it, the filled part. */
export function progressLine(prefix: string, x: number, width: number, fraction: number, color: string): El[] {
  const els = [bar(prefix + ".bg", x, 15, width, 1, FAINT)];
  const w = Math.max(0, Math.min(width, Math.round(width * fraction)));
  if (w > 0) els.push(bar(prefix + ".fg", x, 15, w, 1, color));
  return els;
}
