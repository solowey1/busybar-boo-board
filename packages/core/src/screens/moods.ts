import { anyBusy } from "../agents";
import type { Mood, Style } from "../mascot";
import type { AgentInfo, Ctx } from "../types";

/** Claude counts as busy this long after its last message. */
const BUSY_S = 90;
/** ... and as asleep after this long without one. */
const SLEEP_S = 600;

/** Claude has its own mascot; the others are a choice, and the ghost is also what other AIs get when they report and Claude is the mascot. */
export function styleOf(ctx: Ctx): Style {
  const m = ctx.cfg.s.aiMascot;
  if (m === "ghost" || m === "block" || m === "cat") return m;
  return ctx.done !== null && ctx.at < ctx.done.until && ctx.done.other ? "ghost" : "claude";
}

/** The agents found running on the computer (none if the agent on the computer is too old to say). */
export const agentsOf = (ctx: Ctx): AgentInfo[] => (ctx.data.agents ? ctx.data.agents.list : []);

export function moodOf(ctx: Ctx): Mood {
  if (ctx.at < ctx.danceUntil || (ctx.done !== null && ctx.at < ctx.done.until)) return "dance";
  // Live detection: busy at once when any agent works, asleep when none runs.
  if (ctx.data.agents) {
    const list = ctx.data.agents.list;
    return anyBusy(list) ? "work" : list.length > 0 ? "idle" : "sleep";
  }
  const c = ctx.data.claude;
  if (!c || !c.lastAt) return "sleep";
  const idle = Math.floor(ctx.at / 1000) - c.lastAt;
  return idle < BUSY_S ? "work" : idle > SLEEP_S ? "sleep" : "idle";
}

