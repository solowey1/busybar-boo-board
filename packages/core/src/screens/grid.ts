import type { El } from "../types";
import { xpm } from "../util";

/** Weeks shown by the small grid, and its size: 7 days of 2x2 pixels across, one row of cells per week. */
export const WEEKS = 5;
export const GRID_W = 20;

/**
 * A grid of days like GitHub's activity graph: a row is a week, a column a weekday (Monday first), a cell is 2x2 pixels
 * with a pixel between. `levels` has WEEKS*7 entries: -1 is not a day, 0 is nothing, 1..4 are the shades given
 * (faintest first). `today` is the index of today's cell, or -1: its top half is white so it can be found.
 */
export function weekGrid(id: string, levels: number[], shades: string[], today: number, x: number, y: number): El {
  const keys = "abcde";
  const rows: string[] = [];
  for (let r = 0; r < WEEKS; r++) {
    for (let dy = 0; dy < 2; dy++) {
      let line = "";
      for (let col = 0; col < 7; col++) {
        const i = r * 7 + col;
        const lv = levels[i];
        const ch = lv < 0 ? "." : i === today && dy === 0 ? "w" : keys.charAt(Math.min(4, lv));
        line += ch + ch + (col < 6 ? "." : "");
      }
      rows.push(line);
    }
    if (r < WEEKS - 1) rows.push(".".repeat(GRID_W));
  }
  const colors: Record<string, string> = { w: "#FFFFFF" };
  shades.forEach((c, i) => (colors[keys.charAt(i)] = c));
  return xpm(id, rows, x, y, colors);
}
