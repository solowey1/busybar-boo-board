import type { Screen } from "../types";
import { WHITE, DIM, countdown, label, rgba, status, tr } from "../util";

export const calendar: Screen = {
  id: "calendar",
  title: (cfg) => tr(cfg, "calendar"),
  views: ({ data }) => (data.calendar && data.calendar.ok ? Math.max(1, data.calendar.events.length) : 1),
  isEmpty: ({ data }) => !data.calendar || !data.calendar.ok || data.calendar.events.length === 0,
  elements({ cfg, data, recvAt, view }) {
    const c = data.calendar;
    const name = tr(cfg, "calendar");
    if (!c) return status("k", name, tr(cfg, "noData"));
    if (!c.ok) return status("k", name, tr(cfg, "noAccess"));
    // OK steps to the next meeting of the day.
    const e = c.events[Math.min(view, Math.max(0, c.events.length - 1))];
    if (!e) return status("k", name, tr(cfg, "noEvents"));
    const base = Math.floor(recvAt / 1000);
    const started = e.startIn <= 0;
    const accent = rgba(cfg.s.calendarColor);
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
