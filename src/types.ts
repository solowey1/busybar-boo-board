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
  /** the last 34 finished days, oldest first, seconds */
  recent?: number[];
  /** epoch seconds of the first activity today, 0 = none yet */
  since: number;
}
export interface CalendarData {
  ok: boolean;
  events: { title: string; startIn: number; endIn: number }[];
}
export interface ServerItem {
  name: string;
  ok: boolean;
  /** a name from glyphs.json */
  icon?: string;
  /** "#RRGGBB" or "" for the default */
  color?: string;
  downColor?: string;
}
export interface ServersData {
  items: ServerItem[];
}
/** An AI coding agent found running on the computer. */
export interface AgentInfo {
  id: string;
  name: string;
  busy: boolean;
  /** minutes since it started, 0 when only a hook told of it */
  up: number;
}
export interface AgentsData {
  list: AgentInfo[];
}
export interface AgentAlert {
  id: number;
  kind: string;
  text: string;
}

/** The settings of the screens, kept on the Mac and sent to the bar flat (see mac-agent/src/appsettings.mjs). */
export interface AppSettings {
  musicArtwork: boolean;
  musicArtworkOpacity: number;
  musicStateIcon: boolean;
  /** the central Start / Pause button plays or pauses */
  musicStartToggle: boolean;
  musicColor: string;
  /** "claude", "ghost" or "none" */
  aiMascot: "claude" | "ghost" | "none";
  aiOverlay: boolean;
  /** a separate screen with only the mascot */
  aiMascotScreen: boolean;
  /** "auto" or the id of an agent */
  aiDefaultAgent: string;
  aiColor: string;
  workHours: number;
  workBreakMinutes: number;
  workColor: string;
  calendarMinutes: number;
  calendarColor: string;
  serversView: "tiles" | "list";
  serversColorOk: string;
  serversColorDown: string;
  serversTileDown: string;
  appRotateSeconds: number;
  appHideEmpty: boolean;
  /** how long the screen's name stays after the wheel; 0 = not shown */
  appFlashMs: number;
  appAlertSound: boolean;
}

export interface AgentState {
  rev: number;
  music?: MusicData;
  claude?: ClaudeData;
  work?: WorkData;
  calendar?: CalendarData;
  servers?: ServersData;
  agents?: AgentsData;
  /** bumped when the settings page on the Mac saved something; `settings` are the values of the screens */
  meta?: { settingsRev: number; settings?: Partial<AppSettings> };
  alerts: AgentAlert[];
}

export type ScreenId = "music" | "claude" | "mascot" | "work" | "calendar" | "servers";
export type Lang = "ru" | "en";

export interface Config {
  /** which screens are on: set on the bar itself */
  screens: Record<ScreenId, boolean>;
  lang: Lang;
  host: string;
  port: number;
  token: string;
  /** everything else, from the Mac; the defaults hold until the first answer */
  s: AppSettings;
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
  /** The mascot dances until this time (ms), after an AI has finished. */
  danceUntil: number;
  /** An AI has just finished and the screen shows it next to the mascot, instead of a banner over everything. */
  done: { until: number; head: string; text: string; other: boolean } | null;
  /** The agent the user picked with OK, "" = none picked. */
  agentPick: string;
}

export interface Screen {
  id: ScreenId;
  title(cfg: Config): string;
  /** How many sub-views the OK button cycles through (default 1). */
  views?(ctx: Ctx): number;
  /** True when there is nothing to show; such a screen can be hidden by a setting. */
  isEmpty?(ctx: Ctx): boolean;
  elements(ctx: Ctx): El[];
  /** How often the screen wants to be drawn again, in ms; the default is every third of a second. */
  tickMs?(ctx: Ctx): number;
  /** The screen is no longer on the display: let go of whatever it keeps between frames. */
  leave?(): void;
}
