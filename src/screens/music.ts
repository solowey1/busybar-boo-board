import type { Screen } from "../types";
import { DIM, WHITE, label, progressLine } from "../util";

/**
 * The small font's letters start two pixels below the top of the label. Aligning the label's bottom edge
 * instead lets the text go that high: the capital letters of the title then start at row 0.
 */
const TITLE_Y = 7;
const ARTIST_Y = 14;

export const music: Screen = {
  id: "music",
  title: "Музыка",
  isEmpty: ({ data }) => !data.music || !data.music.active,
  elements({ cfg, data, at, recvAt }) {
    const m = data.music;
    if (!m || !m.active || !m.title) return [label("m.title", "Нет музыки", 4, { color: DIM, align: "top_mid", x: 36, width: undefined, scroll_rate: 0 })];
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

    const w = 72 - ox;
    els.push(label("m.title", m.title, TITLE_Y, { color, x: ox, width: w, align: "bottom_left" }));
    els.push(label("m.artist", m.artist || " ", ARTIST_Y, { color: DIM, x: ox, width: w, align: "bottom_left" }));
    const frac = dur > 0 ? pos / dur : 0;
    return els.concat(progressLine("m.p", ox, w, frac, color));
  },
};
