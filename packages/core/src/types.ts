/** What the agent sends (see agent/src/sources). */
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
  /** five weeks from this week's Monday: meetings per day, which cell is today, today's weekday (0 = Monday), day and month (0-based) */
  grid?: { counts: number[]; today: number; wd: number; d: number; m: number };
}
export interface ServerItem {
  name: string;
  ok: boolean;
  /** a name from glyphs.json */
  icon?: string;
  /** "#RRGGBB" or "" for the default */
  color?: string;
  downColor?: string;
  /** the address from its URL, "host:port" */
  host?: string;
  /** minutes it has been in its present state (up or down) */
  age?: number;
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

/** The settings of the screens, kept on the computer and sent to the bar flat (see agent/src/appsettings.mjs). */
export interface AppSettings {
  musicArtwork: boolean;
  musicArtworkOpacity: number;
  musicStateIcon: boolean;
  /** the central Start / Pause button plays or pauses */
  musicStartToggle: boolean;
  musicColor: string;
  /** "claude", "ghost", "block", "cat" or "none" */
  aiMascot: "claude" | "ghost" | "block" | "cat" | "none";
  aiOverlay: boolean;
  /** OK on the agents screen ends the round of agents with the mascot */
  aiMascotScreen: boolean;
  /** "auto" or the id of an agent */
  aiDefaultAgent: string;
  aiColor: string;
  aiAlertSound: boolean;
  aiAlertLed: boolean;
  aiAlertColor: string;
  workHours: number;
  workBreakMinutes: number;
  workColor: string;
  workAlertSound: boolean;
  workAlertLed: boolean;
  workAlertColor: string;
  /** which view of the work screen comes first */
  workView: "grid" | "today";
  calendarMinutes: number;
  calendarColor: string;
  calendarAlertSound: boolean;
  calendarAlertLed: boolean;
  calendarAlertColor: string;
  /** which view of the calendar comes first: only the meeting, a grid of 3 weeks, or a month */
  calendarView: "off" | "weeks3" | "month";
  /** which view comes first: icons, a list, or a table of two columns */
  serversView: "tiles" | "list" | "table";
  /** the servers' accent colour: the colour of a server that is up */
  serversColor: string;
  serversAlertSound: boolean;
  serversAlertLed: boolean;
  serversAlertColor: string;
  serversColorDown: string;
  serversTileDown: string;
  appRotateSeconds: number;
  appHideEmpty: boolean;
  /** how long the screen's name stays after the wheel; 0 = not shown */
  appFlashMs: number;
  /** the screens in the order of the wheel: "music,claude,servers,calendar,work" */
  appOrder: string;
}

export interface AgentState {
  rev: number;
  music?: MusicData;
  claude?: ClaudeData;
  work?: WorkData;
  calendar?: CalendarData;
  servers?: ServersData;
  agents?: AgentsData;
  /** bumped when the settings page on the computer saved something; `settings` are the values of the screens */
  meta?: { settingsRev: number; settings?: Partial<AppSettings> };
  alerts: AgentAlert[];
}

export type ScreenId = "music" | "claude" | "work" | "calendar" | "servers";
export type Lang = "ru" | "en";

export interface Config {
  /** which screens are on: set on the bar itself */
  screens: Record<ScreenId, boolean>;
  lang: Lang;
  host: string;
  port: number;
  /** everything else, from the computer; the defaults hold until the first answer */
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
  /** Which state of the screen is shown; the OK button steps through them. */
  view: number;
  /** The screen's extra counter, moved by the Play / Pause button (the calendar: which meeting). */
  extra: number;
  /** The mascot dances until this time (ms), after an AI has finished. */
  danceUntil: number;
  /** An AI has just finished and the screen shows it next to the mascot, instead of a banner over everything. */
  done: { until: number; head: string; text: string; other: boolean } | null;
}

export interface Screen {
  id: ScreenId;
  title(cfg: Config): string;
  /** How many sub-views the OK button cycles through (default 1). */
  views?(ctx: Ctx): number;
  /** True when there is nothing to show; such a screen can be hidden by a setting. */
  isEmpty?(ctx: Ctx): boolean;
  elements(ctx: Ctx): El[];
  /** The Play / Pause button: an extra function of the screen. Returns the new state and counter (what it leaves out stays). */
  start?(ctx: Ctx): { view?: number; extra?: number };
  /** How often the screen wants to be drawn again, in ms; the default is every third of a second. */
  tickMs?(ctx: Ctx): number;
  /** The screen is no longer on the display: let go of whatever it keeps between frames. */
  leave?(): void;
}
