import type { Screen } from "../types";
import { DIM, GREEN, WHITE, fmtHM, label } from "../util";

export const work: Screen = {
  id: "work",
  title: "Работа",
  elements({ data, at, recvAt }) {
    const w = data.work;
    if (!w) return [label("w.t1", "Работа", 0), label("w.t2", "нет данных", 8, { color: DIM })];
    // While the Mac is in use the day total grows; the bar adds the time since the agent's last report.
    const grow = w.active ? Math.floor((at - recvAt) / 1000) : 0;
    return [
      label("w.t1", w.active ? "Сегодня, идёт" : "Сегодня, пауза", 0, { color: w.active ? GREEN : DIM, scroll_rate: 0 }),
      label("w.t2", fmtHM(w.todaySec + grow) + "  (" + fmtHM(w.sessionSec + grow) + ")", 8, { color: WHITE, scroll_rate: 0 }),
    ];
  },
};
