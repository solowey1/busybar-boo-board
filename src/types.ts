/** What the Mac agent sends (see mac-agent/src/sources). */
export interface MusicData {
  active: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  dur?: number;
  pos?: number;
  /** 16x16 XPM2 text of the cover, when the agent could make one */
  art?: string | null;
}
export interface ClaudeData {
  active: boolean;
  blockTokens: number;
  blockMessages: number;
  /** what the window would cost at API prices, USD */
  blockCost: number;
  /** epoch seconds of the latest message, 0 = none */
  lastAt: number;
  today: number;
  week: number;
  resetIn: number;
}
export interface WorkData {
  active: boolean;
  todaySec: number;
  sessionSec: number;
  /** total of the previous day, seconds */
  yesterdaySec: number;
  /** epoch seconds of the first activity today, 0 = none yet */
  since: number;
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
  breakMinutes: number;
  musicArtwork: boolean;
  artworkOpacity: number;
  rotateSeconds: number;
  hideEmpty: boolean;
  claudeMascot: boolean;
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
  /** Which sub-view of the screen is shown; the OK button steps through them. */
  view: number;
  /** The mascot dances until this time (ms), after Claude finished. */
  danceUntil: number;
}

export interface Screen {
  id: ScreenId;
  title: string;
  /** How many sub-views the OK button cycles through (default 1). */
  views?(ctx: Ctx): number;
  /** True when there is nothing to show; such a screen can be hidden by a setting. */
  isEmpty?(ctx: Ctx): boolean;
  elements(ctx: Ctx): El[];
}
