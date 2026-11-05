import type { AgentInfo, Config } from "./types";

/** The id of the agent the settings (or, failing that, the situation) put first; "" when no agent runs. */
export function defaultAgent(cfg: Config, list: AgentInfo[]): string {
  const has = (id: string) => list.some((a) => a.id === id);
  if (cfg.s.aiDefaultAgent !== "auto" && has(cfg.s.aiDefaultAgent)) return cfg.s.aiDefaultAgent;
  const busy = list.filter((a) => a.busy);
  if (busy.length > 0) return busy[0].id;
  if (has("claude")) return "claude";
  return list.length > 0 ? list[0].id : "";
}

/** The agents in the order OK steps through them: the default one first, then the rest as listed. */
export function orderedAgents(cfg: Config, list: AgentInfo[]): AgentInfo[] {
  const first = defaultAgent(cfg, list);
  return list.filter((a) => a.id === first).concat(list.filter((a) => a.id !== first));
}

/** The pages of the agents screen: one per agent (at least one), and the mascot last when the setting allows. */
export function aiPages(cfg: Config, list: AgentInfo[]): { agents: number; mascot: boolean; total: number } {
  const agents = list.length > 0 ? list.length : 1;
  const mascot = cfg.s.aiMascotScreen && cfg.s.aiMascot !== "none";
  return { agents, mascot, total: agents + (mascot ? 1 : 0) };
}

/** True when any agent is working right now. */
export const anyBusy = (list: AgentInfo[]): boolean => list.some((a) => a.busy);
