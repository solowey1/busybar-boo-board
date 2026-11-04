import type { El, Screen } from "../types";
import { BLUE, DIM, GREEN, WHITE, YELLOW, fmtHM, label, progressLine } from "../util";

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

/** A label on the left and a value that ends at the right edge. */
const row = (id: string, name: string, value: string, y: number, nameColor: string, valueColor: string): El[] => [
  label(id + ".n", name, y, { color: nameColor, scroll_rate: 0, width: 44 }),
  label(id + ".v", value, y, { color: valueColor, scroll_rate: 0, width: undefined, align: "top_right", x: 72 }),
];

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
      ...row("w.y", "Вчера", fmtHM(w.yesterdaySec ?? 0), 0, DIM, DIM),
      // Green while the Mac is in use, yellow while it rests.
      ...row("w.t", "Сегодня", fmtHM(today), 8, w.active ? GREEN : YELLOW, WHITE),
    ];
    // With a daily goal set, a line shows how far along it is.
    return cfg.workHours > 0 ? els.concat(progressLine("w.p", 0, 72, today / (cfg.workHours * 3600), BLUE)) : els;
  },
};
