import type { CalendarData, Config, El, Screen } from "../types";
import { WHITE, DIM, countdown, label, mix, rgba, status, tr, xpm } from "../util";
import { GRID_W, weekGrid } from "./grid";

/** The grid: three weeks, a row each, Monday first. Cells are 4x4 with a pixel between, like squares in GitHub's activity graph. */
const CELL = 4;
const PITCH = 5;
const WIDTH = 7 * PITCH;
const TOP = 1;
/** Where the text starts, to the right of the grid. */
const TEXT_X = WIDTH + 3;

let cached: El | null = null;
let cachedKey = "";

/** The picture of the grid; kept while nothing in it changes, because it is a screen that stands still. */
function gridPicture(cfg: Config, grid: NonNullable<CalendarData["grid"]>): El {
  const key = grid.counts.slice(0, 21).join(",") + "|" + grid.today + "|" + cfg.s.calendarColor;
  if (cached !== null && key === cachedKey) return cached;
  const rows: string[][] = [];
  for (let y = 0; y < 16; y++) {
    const r: string[] = [];
    for (let x = 0; x < WIDTH; x++) r.push(".");
    rows.push(r);
  }
  const paint = (cx: number, cy: number, w: number, h: number, ch: string) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows[cy + y][cx + x] = ch;
  };
  grid.counts.slice(0, 21).forEach((n, i) => {
    const x = (i % 7) * PITCH;
    const y = TOP + Math.floor(i / 7) * PITCH;
    // d: day over, e: empty day, m: a meeting, M: several, w: today's frame
    const own = n >= 2 ? "M" : n === 1 ? "m" : i < grid.today ? "d" : "e";
    if (i === grid.today) {
      paint(x, y, CELL, CELL, "w");
      paint(x + 1, y + 1, CELL - 2, CELL - 2, n > 0 ? "M" : ".");
    } else {
      paint(x, y, CELL, CELL, own);
    }
  });
  const accent = cfg.s.calendarColor;
  cached = xpm("k.g", rows.map((r) => r.join("")), 0, 0, {
    d: "#161616",
    e: "#303030",
    m: mix(accent, 0.45, "#000000"),
    M: accent,
    w: "#FFFFFF",
  });
  cachedKey = key;
  return cached;
}

/** The states of the screen; the one the settings name comes first, OK steps to the next. */
const STATES = ["off", "weeks3", "month"];
const startIndex = (cfg: Config): number => Math.max(0, STATES.indexOf(cfg.s.calendarView));
const stateOf = (cfg: Config, view: number): string => STATES[(startIndex(cfg) + view) % STATES.length];

/** The date and the next meeting, to the right of a grid. */
function captions(cfg: Config, c: CalendarData, g: NonNullable<CalendarData["grid"]>, x: number): El[] {
  const wd = tr(cfg, "wd").split(",")[g.wd];
  const mon = tr(cfg, "mon").split(",")[g.m];
  const next = c.events[0];
  return [
    label("k.d", wd + " " + g.d + " " + mon, 0, { color: WHITE, x, width: 72 - x, scroll_rate: 0 }),
    label("k.n", next ? next.title : tr(cfg, "noEvents"), 8, { color: next ? rgba(cfg.s.calendarColor) : DIM, x, width: 72 - x }),
  ];
}

/** Five weeks like the work screen's grid: the days with meetings in the accent colour, the busier the brighter. */
function monthGrid(cfg: Config, g: NonNullable<CalendarData["grid"]>): El {
  const accent = cfg.s.calendarColor;
  const shades = ["#262626", mix(accent, 0.7, "#000000"), mix(accent, 0.45, "#000000"), mix(accent, 0.2, "#000000"), accent];
  const levels = g.counts.map((n) => (n <= 0 ? 0 : n === 1 ? 2 : n === 2 ? 3 : 4));
  return weekGrid("k.m", levels, shades, g.today, 1, 1);
}

export const calendar: Screen = {
  id: "calendar",
  title: (cfg) => tr(cfg, "calendar"),
  // Off (only the meeting), 3 weeks, a month; without access or a grid there is one state.
  views: ({ data }) => (data.calendar && data.calendar.ok && data.calendar.grid ? STATES.length : 1),
  isEmpty: ({ data }) => !data.calendar || !data.calendar.ok || data.calendar.events.length === 0,
  /** Play / Pause: the next meeting. From a grid it goes back to the meetings, from a meeting it moves on to the next one. */
  start({ cfg, data, view, extra }) {
    const c = data.calendar;
    if (!c || !c.ok || !c.grid) return {};
    if (stateOf(cfg, view) !== "off") return { view: (STATES.length - startIndex(cfg)) % STATES.length, extra: 0 };
    return { extra: c.events.length > 0 ? (extra + 1) % c.events.length : 0 };
  },
  leave() {
    cached = null;
    cachedKey = "";
  },
  elements({ cfg, data, recvAt, view, extra }) {
    const c = data.calendar;
    const name = tr(cfg, "calendar");
    if (!c) return status("k", name, tr(cfg, "noData"));
    if (!c.ok) return status("k", name, tr(cfg, "noAccess"));
    const state = c.grid ? stateOf(cfg, view) : "off";
    const accent = rgba(cfg.s.calendarColor);

    if (state === "weeks3" && c.grid) return [gridPicture(cfg, c.grid), ...captions(cfg, c, c.grid, TEXT_X)];
    if (state === "month" && c.grid) return [monthGrid(cfg, c.grid), ...captions(cfg, c, c.grid, GRID_W + 4)];
    // Only the meetings, one at a time: Play / Pause steps to the next one.
    const e = c.events[c.events.length > 0 ? extra % c.events.length : 0];
    if (!e) return status("k", name, tr(cfg, "noEvents"));
    const base = Math.floor(recvAt / 1000);
    const started = e.startIn <= 0;
    // The caption's width depends on the language, so the countdown starts where the caption ends.
    const caption = started ? tr(cfg, "nowEnds") : tr(cfg, "inTime");
    const x = caption.length * 4 + 4;
    return [
      label("k.t1", e.title, 0, { color: started ? accent : WHITE }),
      label("k.t2", caption, 8, { color: DIM, width: x, scroll_rate: 0 }),
      countdown("k.cd", base + (started ? e.endIn : e.startIn), x, 8, { color: started ? accent : WHITE }),
    ];
  },
};
