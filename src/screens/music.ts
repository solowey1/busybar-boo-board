import type { Screen } from "../types";
import { DIM, FAINT, WHITE, bar, label } from "../util";

export const music: Screen = {
  id: "music",
  title: "Музыка",
  elements({ data, at, recvAt }) {
    const m = data.music;
    if (!m || !m.active || !m.title) return [label("m.title", "Нет музыки", 4, { color: DIM })];
    const dur = m.dur ?? 0;
    // The agent sent the position at `recvAt`; from there the bar counts on its own.
    let pos = m.pos ?? 0;
    if (m.playing) pos += (at - recvAt) / 1000;
    if (dur > 0 && pos > dur) pos = dur;
    const color = m.playing ? WHITE : DIM;
    const els = [label("m.title", m.title, 0, { color }), label("m.artist", m.artist || " ", 8, { color: DIM }), bar("m.bg", 0, 15, 72, 1, FAINT)];
    const w = dur > 0 ? Math.round((72 * pos) / dur) : 0;
    if (w > 0) els.push(bar("m.fg", 0, 15, w, 1, color));
    return els;
  },
};
