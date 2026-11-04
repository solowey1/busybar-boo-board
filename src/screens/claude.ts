import type { Screen } from "../types";
import { DIM, GREEN, WHITE, countdown, fmtTokens, label, progressLine } from "../util";

const WINDOW_S = 5 * 3600;

export const claude: Screen = {
  id: "claude",
  title: "Claude",
  views: () => 2,
  isEmpty: ({ data }) => !data.claude || !data.claude.active,
  elements({ data, at, recvAt, view }) {
    const c = data.claude;
    if (!c) return [label("c.t1", "Claude", 0), label("c.t2", "нет данных", 8, { color: DIM })];
    // View 2 (OK): the day and the week instead of the 5-hour window.
    if (view === 1) {
      return [
        label("c.t1", "Сегодня " + fmtTokens(c.today), 0, { color: WHITE, scroll_rate: 0 }),
        label("c.t2", "Неделя " + fmtTokens(c.week), 8, { color: DIM, scroll_rate: 0 }),
      ];
    }
    if (!c.active) return [label("c.t1", "Claude " + fmtTokens(c.today), 0), label("c.t2", "окно не идёт", 8, { color: DIM })];
    const resetAt = Math.floor(recvAt / 1000) + c.resetIn;
    const left = Math.max(0, resetAt - Math.floor(at / 1000));
    return [
      label("c.t1", "Claude " + fmtTokens(c.blockTokens), 0, { color: GREEN, scroll_rate: 0 }),
      label("c.t2", "сброс", 8, { color: DIM, width: 28, scroll_rate: 0 }),
      countdown("c.cd", resetAt, 30, 8, { color: WHITE }),
      // How much of the 5-hour window has gone.
    ].concat(progressLine("c.p", 0, 72, 1 - left / WINDOW_S, GREEN));
  },
};
