import { mascot } from "../mascot";
import { aiPages, orderedAgents } from "../agents";
import { agentsOf, moodOf, styleOf } from "./moods";
import { mascotTickMs, mascotView, releaseMascot } from "./mascot";
import type { AgentInfo, El, Screen } from "../types";
import { DIM, DIM_LIGHT, FAINT, WHITE, bar, centered, fmtTokens, label, mix, progressLine, rgba, tr } from "../util";

/** The 5-hour window the usage is counted in. */
const WINDOW_S = 5 * 3600;

/** The small font is about 4 px per character. */
const CHAR_W = 4;

/** The mascot's column and the text area next to it. */
const AREA_X = 14;
const AREA_W = 58;

/** 12.3 -> "$12.3", 1.234 -> "$1.23", 123.4 -> "$123" */
export function fmtCost(usd: number): string {
  if (usd >= 100) return "$" + Math.round(usd);
  if (usd >= 10) return "$" + usd.toFixed(1);
  return "$" + usd.toFixed(2);
}

/** Minutes left, rounded up, as H:MM. */
function fmtLeft(sec: number): string {
  const m = Math.ceil(Math.max(0, sec) / 60);
  const mm = m % 60;
  return Math.floor(m / 60) + ":" + (mm < 10 ? "0" + mm : mm);
}

// The small font's letters start two pixels below the top of the label. Aligning the label's bottom edge
// instead puts the capitals of row 1 on pixels 1-5 and of row 2 on 8-12, leaving the bottom line some air.
/** Position (1-based) of an agent in the list. */
const pos = (list: AgentInfo[], id: string): number => {
  let n = 1;
  list.forEach((a, i) => {
    if (a.id === id) n = i + 1;
  });
  return n;
};

const ROW1 = 8;
const ROW2 = 15;

/** A label that ends at the right edge of the screen. */
const right = (id: string, text: string, y: number, color: string): El => label(id, text, y, { color, width: undefined, align: "bottom_right", x: 72, scroll_rate: 0 });

export const claude: Screen = {
  id: "claude",
  title: (cfg) => tr(cfg, "ai"),
  /** One page per agent, then the mascot (when the setting allows): OK steps through them. */
  views: (ctx) => aiPages(ctx.cfg, agentsOf(ctx)).total,
  tickMs: (ctx) => {
    const p = aiPages(ctx.cfg, agentsOf(ctx));
    return p.mascot && ctx.view % p.total === p.agents ? mascotTickMs(ctx) : 333;
  },
  leave: releaseMascot,
  isEmpty: ({ data }) => !(data.agents && data.agents.list.length > 0) && (!data.claude || !data.claude.active),
  elements(ctx) {
    const { cfg, data, at, recvAt, done } = ctx;
    const pages = aiPages(cfg, agentsOf(ctx));
    const page = ctx.view % pages.total;
    if (pages.mascot && page === pages.agents) return mascotView(ctx);
    releaseMascot();
    const c = data.claude;
    // The accent colour is the mascot's; with the mascot, text takes a lighter tint so the two can be told apart.
    const accent = cfg.s.aiColor;
    const withMascot = cfg.s.aiMascot !== "none";
    const tint = rgba(withMascot ? mix(accent, 0.38) : accent);
    const x = withMascot ? AREA_X : 0;
    const els: El[] = [];
    if (withMascot) els.push(mascot("c.mascot", moodOf(ctx), at, accent, styleOf(ctx)));
    const text = (id: string, t: string, px: number, y: number, color: string): El => label(id, t, y, { color, x: px, width: undefined, align: "bottom_left", scroll_rate: 0 });

    // Claude has just finished: the news sits to the right of the happy mascot, in place of the figures.
    if (withMascot && done !== null && at < done.until) {
      return els.concat([centered("c.done1", done.head, ROW1, AREA_X, AREA_W, "bottom", { color: tint }), centered("c.done2", done.text, ROW2, AREA_X, AREA_W, "bottom", { color: WHITE })]);
    }
    // Another agent than Claude: no usage figures (they come from Claude's logs), its state and how long it runs.
    const list = agentsOf(ctx);
    const shown = orderedAgents(cfg, list)[page];
    const id = shown ? shown.id : "";
    const agent = shown;
    if (agent && id !== "claude") {
      els.push(text("a.name", agent.name, x, ROW1, tint));
      els.push(right("a.state", agent.busy ? tr(cfg, "working") : tr(cfg, "waitingIdle"), ROW1, agent.busy ? WHITE : DIM_LIGHT));
      if (agent.up > 0) els.push(text("a.up", tr(cfg, "runningFor", agent.up), x, ROW2, DIM_LIGHT));
      if (list.length > 1) els.push(right("a.n", pos(list, id) + "/" + list.length, ROW2, DIM_LIGHT));
      // A light running along the bottom while it works, a quiet track while it waits.
      const span = 72 - x;
      els.push(bar("a.t", x, 15, span, 1, FAINT));
      if (agent.busy) {
        const w = 14;
        const step = Math.floor(at / 100) % (2 * (span - w));
        els.push(bar("a.s", x + (step < span - w ? step : 2 * (span - w) - step), 15, w, 1, tint));
      }
      return els;
    }
    if (!c) return els.concat([centered("c.none", tr(cfg, "noData"), 11, x, 72 - x, "bottom", { color: DIM })]);

    // Row 1: tokens and API-price cost of the 5-hour window on the left, the reset timer on the right.
    let elapsed = 0;
    if (c.active) {
      const tokens = fmtTokens(c.blockTokens);
      els.push(text("c.tok", tokens, x, ROW1, tint));
      els.push(text("c.cost", fmtCost(c.blockCost), x + CHAR_W * tokens.length + 4, ROW1, DIM_LIGHT));
      const left = Math.floor(recvAt / 1000) + c.resetIn - Math.floor(at / 1000);
      els.push(right("c.left", fmtLeft(left), ROW1, WHITE));
      elapsed = 1 - left / WINDOW_S;
    } else {
      els.push(text("c.tok", tr(cfg, "noWindow"), x, ROW1, DIM_LIGHT));
    }
    // Row 2: the day and the week, in tokens.
    els.push(text("c.d", "D " + fmtTokens(c.today), x, ROW2, tint));
    els.push(right("c.w", "W " + fmtTokens(c.week), ROW2, tint));
    // The bottom line is the 5-hour window running out, like the track line on the music screen.
    return els.concat(progressLine("c.p", x, 72 - x, elapsed, tint));
  },
};
