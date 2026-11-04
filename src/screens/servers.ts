import type { Screen } from "../types";
import { DIM, GREEN, RED, label } from "../util";

export const servers: Screen = {
  id: "servers",
  title: "Серверы",
  // OK steps through the servers one by one, after the summary.
  views: ({ data }) => (data.servers && data.servers.items.length > 1 ? data.servers.items.length + 1 : 1),
  elements({ data, view }) {
    const s = data.servers;
    if (!s || s.items.length === 0) return [label("s.t1", "Серверы", 0), label("s.t2", "не заданы", 8, { color: DIM })];
    if (view > 0 && s.items[view - 1]) {
      const it = s.items[view - 1];
      return [label("s.t1", it.name, 0, { color: DIM }), label("s.t2", it.ok ? "в сети" : "недоступен", 8, { color: it.ok ? GREEN : RED, scroll_rate: 0 })];
    }
    const down = s.items.filter((i) => !i.ok);
    if (down.length === 0) return [label("s.t1", "Серверы", 0), label("s.t2", "все в сети (" + s.items.length + ")", 8, { color: GREEN })];
    return [label("s.t1", "Не отвечают: " + down.length, 0, { color: RED }), label("s.t2", down.map((d) => d.name).join(", "), 8, { color: RED })];
  },
};
