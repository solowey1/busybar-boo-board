/** What the Mac agent sends (see mac-agent/src/sources). */
export interface MusicData {
  active: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  dur?: number;
  pos?: number;
}
export interface ClaudeData {
  active: boolean;
  blockTokens: number;
  blockMessages: number;
  today: number;
  week: number;
  resetIn: number;
}
export interface WorkData {
  active: boolean;
  todaySec: number;
  sessionSec: number;
}
export interface CalendarData {
  ok: boolean;
  events: { title: string; startIn: number; endIn: number }[];
}
export interface ServersData {
  items: { name: string; ok: boolean }[];
}
export interface AgentAlert {
  id: number;
  kind: string;
  text: string;
}
export interface AgentState {
  rev: number;
  music?: MusicData;
  claude?: ClaudeData;
  work?: WorkData;
  calendar?: CalendarData;
  servers?: ServersData;
  alerts: AgentAlert[];
}

export type ScreenId = "music" | "claude" | "work" | "calendar" | "servers";

export interface Config {
  screens: Record<ScreenId, boolean>;
  host: string;
  port: number;
  token: string;
  alertSound: boolean;
  calendarMinutes: number;
  workHours: number;
}

/** A display element as the device API takes it. */
export type El = { id: string; type: string; [key: string]: unknown };

/** What a screen sees on every tick. `at` is the device clock in ms; `recvAt` is when the agent data arrived. */
export interface Ctx {
  cfg: Config;
  data: AgentState;
  at: number;
  recvAt: number;
  online: boolean;
}

export interface Screen {
  id: ScreenId;
  title: string;
  elements(ctx: Ctx): El[];
}
