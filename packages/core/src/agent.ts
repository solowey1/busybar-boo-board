import type { AgentState, Config } from "./types";

/**
 * Asks the agent for its state. With the revision we already have, an unchanged agent answers `same`
 * and we keep what we show (the playhead and the timers run on the bar's own clock).
 * Returns null when nothing changed, throws when the agent is unreachable.
 */
export async function fetchState(cfg: Config, appId: string, since: number, wanted: string[], waitMs: number): Promise<AgentState | null> {
  const url = `http://${cfg.host}:${cfg.port}/state?s=${wanted.join(",")}&since=${since}&wait=${waitMs}&lang=${cfg.lang}&app=${encodeURIComponent(appId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`agent ${res.status}`);
  const body = JSON.parse(await res.text()) as AgentState & { same?: boolean };
  if (body.same) return null;
  if (!body.alerts) body.alerts = [];
  return body;
}
