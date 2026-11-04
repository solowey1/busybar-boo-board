import type { Screen } from "../types";
import { DIM, GREEN, WHITE, countdown, fmtTokens, label } from "../util";

export const claude: Screen = {
  id: "claude",
  title: "Claude",
  elements({ data, recvAt }) {
    const c = data.claude;
    if (!c) return [label("c.t1", "Claude", 0), label("c.t2", "нет данных", 8, { color: DIM })];
    if (!c.active) return [label("c.t1", "Claude " + fmtTokens(c.today), 0), label("c.t2", "окно не идёт", 8, { color: DIM })];
    const resetAt = Math.floor(recvAt / 1000) + c.resetIn;
    return [
      label("c.t1", "Claude " + fmtTokens(c.blockTokens), 0, { color: GREEN, scroll_rate: 0 }),
      label("c.t2", "сброс", 8, { color: DIM, width: 28, scroll_rate: 0 }),
      countdown("c.cd", resetAt, 30, 8, { color: WHITE }),
    ];
  },
};
