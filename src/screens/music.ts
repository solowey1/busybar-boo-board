import type { Screen } from "../types";
import { label, progressLine, rgba, tr, xpm } from "../util";

const PLAY = ["a..", "aa.", "aaa", "aa.", "a.."];
const PAUSE = ["a.a", "a.a", "a.a", "a.a", "a.a"];

/**
 * The small font's letters start two pixels below the top of the label. Aligning the label's bottom edge
 * instead lets the text go higher: the capital letters of the title start at row 1.
 */
const TITLE_Y = 8;
const ARTIST_Y = 15;

export const music: Screen = {
  id: "music",
  title: (cfg) => tr(cfg, "music"),
  isEmpty: ({ data }) => !data.music || !data.music.active,
  elements({ cfg, data, at, recvAt }) {
    const m = data.music;
    const s = cfg.s;
    if (!m || !m.active || !m.title) return [label("m.title", tr(cfg, "noMusic"), 4, { color: rgba(s.musicColor, "80"), align: "top_mid", x: 36, width: undefined, scroll_rate: 0 })];
    const dur = m.dur ?? 0;
    // The agent sent the position at `recvAt`; from there the bar counts on its own.
    let pos = m.pos ?? 0;
    if (m.playing) pos += (at - recvAt) / 1000;
    if (dur > 0 && pos > dur) pos = dur;
    // The accent colour; on pause the same colour, half transparent.
    const color = rgba(s.musicColor, m.playing ? "FF" : "80");

    const els = [];
    // The cover takes a 16x16 column on the left; text and the progress line use what is left.
    const hasArt = s.musicArtwork && typeof m.art === "string" && m.art.length > 0;
    const ox = hasArt ? 18 : 0;
    if (hasArt) els.push({ id: "m.art", type: "xpmbitmap", data: m.art as string, x: 0, y: 0, align: "top_left", display: "front", opacity: s.musicArtworkOpacity });

    const w = 72 - ox;
    // The optional play / pause marker closes the artist row and takes 6 px from it.
    const mark = s.musicStateIcon;
    els.push(label("m.title", m.title, TITLE_Y, { color, x: ox, width: w, align: "bottom_left" }));
    els.push(label("m.artist", m.artist || " ", ARTIST_Y, { color: rgba(s.musicColor, "80"), x: ox, width: mark ? w - 6 : w, align: "bottom_left" }));
    // Green while playing, yellow on pause.
    if (mark) els.push(xpm("m.state", m.playing ? PLAY : PAUSE, 68, 8, { a: m.playing ? "#00E060" : "#FFD000" }));
    const frac = dur > 0 ? pos / dur : 0;
    return els.concat(progressLine("m.p", ox, w, frac, color));
  },
};
