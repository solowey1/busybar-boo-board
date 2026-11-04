import type { Screen } from "../types";
import { BLUE, DIM, GREEN, WHITE, fmtHM, label, progressLine } from "../util";

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

export const work: Screen = {
  id: "work",
  title: "Работа",
  views: () => 2,
  elements({ cfg, data, at, recvAt, view }) {
    const w = data.work;
    if (!w) return [label("w.t1", "Работа", 0), label("w.t2", "нет данных", 8, { color: DIM })];
    // While the Mac is in use the day total grows; the bar adds the time since the agent's last report.
    const grow = w.active ? Math.floor((at - recvAt) / 1000) : 0;
    const today = w.todaySec + grow;
    if (view === 1) {
      // View 2 (OK): when the day started and how long the current stretch is.
      const start = w.since ? new Date(w.since * 1000) : null;
      return [
        label("w.t1", start ? "С " + pad2(start.getHours()) + ":" + pad2(start.getMinutes()) : "Не начато", 0, { color: WHITE, scroll_rate: 0 }),
        label("w.t2", "подряд " + fmtHM(w.sessionSec + grow), 8, { color: DIM, scroll_rate: 0 }),
      ];
    }
    const els = [
      label("w.t1", w.active ? "Сегодня, идёт" : "Сегодня, пауза", 0, { color: w.active ? GREEN : DIM, scroll_rate: 0 }),
      label("w.t2", fmtHM(today), 8, { color: WHITE, scroll_rate: 0 }),
    ];
    // With a daily goal set, a line shows how far along it is.
    return cfg.workHours > 0 ? els.concat(progressLine("w.p", 0, 72, today / (cfg.workHours * 3600), BLUE)) : els;
  },
};
