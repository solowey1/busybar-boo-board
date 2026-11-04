import type { AgentInfo, Config } from "./types";

/**
 * Which agent the AI screen shows: the one the user picked with OK, else the default from the settings,
 * else the busy one, else Claude if it runs, else the first that runs. Empty when no agent runs.
 */
export function pickAgent(cfg: Config, list: AgentInfo[], pick: string): string {
  const has = (id: string) => list.some((a) => a.id === id);
  if (pick && has(pick)) return pick;
  if (cfg.s.aiDefaultAgent !== "auto" && has(cfg.s.aiDefaultAgent)) return cfg.s.aiDefaultAgent;
  const busy = list.filter((a) => a.busy);
  if (busy.length > 0) return busy[0].id;
  if (has("claude")) return "claude";
  return list.length > 0 ? list[0].id : "";
}

/** The agent after `id` in the list, wrapping round. */
export function nextAgent(list: AgentInfo[], id: string): AgentInfo {
  let i = 0;
  list.forEach((a, k) => {
    if (a.id === id) i = k;
  });
  return list[(i + 1) % list.length];
}

/** True when any agent is working right now. */
export const anyBusy = (list: AgentInfo[]): boolean => list.some((a) => a.busy);
