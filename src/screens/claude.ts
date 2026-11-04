import { mascot } from "../mascot";
import type { Mood } from "../mascot";
import type { Ctx, El, Screen } from "../types";
import { BRAND, BRAND_DARK, DIM, WHITE, fmtTokens, label, progressLine } from "../util";

/** Claude counts as busy this long after its last message. */
const BUSY_S = 90;
/** ... and as asleep after this long without one. */
const SLEEP_S = 600;
/** The 5-hour window the usage is counted in. */
const WINDOW_S = 5 * 3600;

/** The small font is about 4 px per character. */
const CHAR_W = 4;

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

export function moodOf(ctx: Ctx): Mood {
  if (ctx.at < ctx.danceUntil) return "dance";
  const c = ctx.data.claude;
  if (!c || !c.lastAt) return "sleep";
  const idle = Math.floor(ctx.at / 1000) - c.lastAt;
  return idle < BUSY_S ? "work" : idle > SLEEP_S ? "sleep" : "idle";
}

// The small font's letters start two pixels below the top of the label. Aligning the label's bottom edge
// instead puts the capitals of row 1 on pixels 1-5 and of row 2 on 8-12, leaving the bottom line some air.
const ROW1 = 8;
const ROW2 = 15;

/** A label that ends at the right edge of the screen. */
const right = (id: string, text: string, y: number, color: string): El => label(id, text, y, { color, width: undefined, align: "bottom_right", x: 72, scroll_rate: 0 });

export const claude: Screen = {
  id: "claude",
  title: "Claude",
  isEmpty: ({ data }) => !data.claude || !data.claude.active,
  elements(ctx) {
    const { cfg, data, at, recvAt } = ctx;
    const c = data.claude;
    // With the mascot, text takes a darker tint of the brand colour so the two can be told apart.
    const tint = cfg.claudeMascot ? BRAND_DARK : BRAND;
    const x = cfg.claudeMascot ? 14 : 0;
    const els: El[] = [];
    if (cfg.claudeMascot) els.push(mascot("c.mascot", moodOf(ctx), at));
    const text = (id: string, t: string, px: number, y: number, color: string): El => label(id, t, y, { color, x: px, width: undefined, align: "bottom_left", scroll_rate: 0 });
    if (!c) return els.concat([text("c.none", "нет данных", x, 11, DIM)]);

    // Row 1: tokens and API-price cost of the 5-hour window on the left, the reset timer on the right.
    let elapsed = 0;
    if (c.active) {
      const tokens = fmtTokens(c.blockTokens);
      els.push(text("c.tok", tokens, x, ROW1, tint));
      els.push(text("c.cost", fmtCost(c.blockCost), x + CHAR_W * tokens.length + 4, ROW1, DIM));
      const left = Math.floor(recvAt / 1000) + c.resetIn - Math.floor(at / 1000);
      els.push(right("c.left", fmtLeft(left), ROW1, WHITE));
      elapsed = 1 - left / WINDOW_S;
    } else {
      els.push(text("c.tok", "нет окна", x, ROW1, DIM));
    }
    // Row 2: the day and the week, in tokens.
    els.push(text("c.d", "D " + fmtTokens(c.today), x, ROW2, tint));
    els.push(right("c.w", "W " + fmtTokens(c.week), ROW2, tint));
    // The bottom line is the 5-hour window running out, like the track line on the music screen.
    return els.concat(progressLine("c.p", x, 72 - x, elapsed, tint));
  },
};
