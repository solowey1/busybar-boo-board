import type { Config, El, Screen, WorkData } from "../types";
import { DIM, GREEN, WHITE, YELLOW, fmtHM, label, mix, progressLine, rgba, status, tr, xpm } from "../util";

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

/** A label on the left and a value that ends at the right edge. */
const row = (id: string, name: string, value: string, y: number, nameColor: string, valueColor: string, x = 0): El[] => [
  label(id + ".n", name, y, { color: nameColor, scroll_rate: 0, width: 44, x }),
  label(id + ".v", value, y, { color: valueColor, scroll_rate: 0, width: undefined, align: "top_right", x: 72 }),
];

/** Last five weeks as squares, like GitHub's: a row is a week, a column is a weekday (Monday first). */
const WEEKS = 5;

function activityGrid(w: WorkData, today: number, cfg: Config, now: Date): { grid: El; week: number; month: number } {
  const days = (w.recent || []).concat([today]); // oldest first, today last
  const wd = (now.getDay() + 6) % 7; // Monday = 0
  const cells: number[] = [];
  for (let i = 0; i < WEEKS * 7; i++) cells.push(-1); // -1: not a day yet
  let max = 1;
  days.forEach((sec) => {
    if (sec > max) max = sec;
  });
  days.forEach((sec, i) => {
    const k = days.length - 1 - i; // days ago
    const c = (WEEKS - 1) * 7 + wd - k;
    if (c >= 0) cells[c] = sec;
  });
  // Five levels from "nothing" to the accent colour, mixed with black (the bitmap has no alpha).
  const accent = cfg.s.workColor;
  const shades = [mix(accent, 0.88, "#000000"), mix(accent, 0.62, "#000000"), mix(accent, 0.38, "#000000"), mix(accent, 0.15, "#000000"), accent];
  const keys = "abcde";
  const rows: string[] = [];
  for (let r = 0; r < WEEKS; r++) {
    for (let dy = 0; dy < 2; dy++) {
      let line = "";
      for (let col = 0; col < 7; col++) {
        const sec = cells[r * 7 + col];
        const ch = sec < 0 ? "." : keys.charAt(sec <= 0 ? 0 : Math.min(4, 1 + Math.floor((sec / max) * 3.999)));
        line += ch + ch + (col < 6 ? "." : "");
      }
      rows.push(line);
    }
    if (r < WEEKS - 1) rows.push(".".repeat(20));
  }
  const colors: Record<string, string> = {};
  keys.split("").forEach((k, i) => (colors[k] = shades[i]));
  let week = 0;
  let month = 0;
  days.forEach((sec, i) => {
    const k = days.length - 1 - i;
    if (k < 7) week += sec;
    if (k < 30) month += sec;
  });
  return { grid: xpm("w.grid", rows, 1, 1, colors), week, month };
}

export const work: Screen = {
  id: "work",
  title: (cfg) => tr(cfg, "work"),
  views: () => 3,
  elements({ cfg, data, at, recvAt, view }) {
    const w = data.work;
    if (!w) return status("w", tr(cfg, "work"), tr(cfg, "noData"));
    // While the Mac is in use the day total grows; the bar adds the time since the agent's last report.
    const grow = w.active ? Math.floor((at - recvAt) / 1000) : 0;
    const today = w.todaySec + grow;
    if (view === 1) {
      // View 2 (OK): when the day started and how long the current stretch is.
      const start = w.since ? new Date(w.since * 1000) : null;
      return [
        label("w.t1", start ? tr(cfg, "since") + " " + pad2(start.getHours()) + ":" + pad2(start.getMinutes()) : tr(cfg, "notStarted"), 0, { color: WHITE, scroll_rate: 0 }),
        label("w.t2", tr(cfg, "streak") + " " + fmtHM(w.sessionSec + grow), 8, { color: DIM, scroll_rate: 0 }),
      ];
    }
    if (view === 2) {
      // View 3 (OK): the activity grid and the totals of the week and the month.
      const g = activityGrid(w, today, cfg, new Date(at));
      return [g.grid, ...row("w.a", tr(cfg, "week"), fmtHM(g.week), 0, DIM, rgba(cfg.s.workColor), 24), ...row("w.b", tr(cfg, "month"), fmtHM(g.month), 8, DIM, rgba(cfg.s.workColor), 24)];
    }
    const els = [
      ...row("w.y", tr(cfg, "yesterday"), fmtHM(w.yesterdaySec ?? 0), 0, DIM, DIM),
      // Green while the Mac is in use, yellow while it rests.
      ...row("w.t", tr(cfg, "today"), fmtHM(today), 8, w.active ? GREEN : YELLOW, WHITE),
    ];
    // With a daily goal set, a line in the accent colour shows how far along it is.
    return cfg.s.workHours > 0 ? els.concat(progressLine("w.p", 0, 72, today / (cfg.s.workHours * 3600), rgba(cfg.s.workColor))) : els;
  },
};
