import type { Screen } from "../types";
import { DIM, GREEN, RED, label } from "../util";

export const servers: Screen = {
  id: "servers",
  title: "Серверы",
  elements({ data }) {
    const s = data.servers;
    if (!s || s.items.length === 0) return [label("s.t1", "Серверы", 0), label("s.t2", "не заданы", 8, { color: DIM })];
    const down = s.items.filter((i) => !i.ok);
    if (down.length === 0) return [label("s.t1", "Серверы", 0), label("s.t2", "все в сети (" + s.items.length + ")", 8, { color: GREEN })];
    return [label("s.t1", "Не отвечают: " + down.length, 0, { color: RED }), label("s.t2", down.map((d) => d.name).join(", "), 8, { color: RED })];
  },
};
