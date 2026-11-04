import type { Screen } from "../types";
import { DIM, GREEN, ICON_PAUSE, ICON_PLAY, WHITE, icon, label, progressLine } from "../util";

export const music: Screen = {
  id: "music",
  title: "Музыка",
  isEmpty: ({ data }) => !data.music || !data.music.active,
  elements({ cfg, data, at, recvAt }) {
    const m = data.music;
    if (!m || !m.active || !m.title) return [label("m.title", "Нет музыки", 4, { color: DIM })];
    const dur = m.dur ?? 0;
    // The agent sent the position at `recvAt`; from there the bar counts on its own.
    let pos = m.pos ?? 0;
    if (m.playing) pos += (at - recvAt) / 1000;
    if (dur > 0 && pos > dur) pos = dur;
    const color = m.playing ? WHITE : DIM;

    const els = [];
    // The cover takes a 16x16 column on the left; text and the progress line use what is left.
    const hasArt = cfg.musicArtwork && typeof m.art === "string" && m.art.length > 0;
    const ox = hasArt ? 18 : 0;
    if (hasArt) els.push({ id: "m.art", type: "xpmbitmap", data: m.art as string, x: 0, y: 0, align: "top_left", display: "front", opacity: cfg.artworkOpacity });

    // A 3-px play / pause marker closes the artist row.
    const w = 72 - ox;
    els.push(label("m.title", m.title, 0, { color, x: ox, width: w }));
    els.push(label("m.artist", m.artist || " ", 8, { color: DIM, x: ox, width: w - 6 }));
    els.push(icon("m.state", m.playing ? ICON_PLAY : ICON_PAUSE, 72 - 4, 9, m.playing ? GREEN : DIM));
    const frac = dur > 0 ? pos / dur : 0;
    return els.concat(progressLine("m.p", ox, w, frac, color));
  },
};
