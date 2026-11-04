import type { Screen } from "../types";
import { AMBER, DIM, WHITE, countdown, label } from "../util";

export const calendar: Screen = {
  id: "calendar",
  title: "Календарь",
  elements({ data, recvAt }) {
    const c = data.calendar;
    if (!c) return [label("k.t1", "Календарь", 0), label("k.t2", "нет данных", 8, { color: DIM })];
    if (!c.ok) return [label("k.t1", "Календарь", 0), label("k.t2", "нет доступа", 8, { color: DIM })];
    const e = c.events[0];
    if (!e) return [label("k.t1", "Календарь", 0), label("k.t2", "встреч нет", 8, { color: DIM })];
    const base = Math.floor(recvAt / 1000);
    const started = e.startIn <= 0;
    return [
      label("k.t1", e.title, 0, { color: started ? AMBER : WHITE }),
      label("k.t2", started ? "идёт, ещё" : "через", 8, { color: DIM, width: started ? 46 : 28, scroll_rate: 0 }),
      countdown("k.cd", base + (started ? e.endIn : e.startIn), started ? 48 : 30, 8, { color: WHITE }),
    ];
  },
};
