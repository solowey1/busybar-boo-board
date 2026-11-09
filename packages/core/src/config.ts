import type { AppSettings, Config, ScreenId } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  musicArtwork: true,
  musicArtworkOpacity: 100,
  musicStateIcon: false,
  musicStartToggle: false,
  musicColor: "#FFFFFF",
  aiMascot: "claude",
  aiOverlay: false,
  aiMascotScreen: true,
  aiDefaultAgent: "auto",
  aiColor: "#D97757",
  aiAlertSound: true,
  aiAlertLed: true,
  aiAlertColor: "#D97757",
  workHours: 0,
  workBreakMinutes: 0,
  workColor: "#4DA3FF",
  workAlertSound: true,
  workAlertLed: true,
  workAlertColor: "#4DA3FF",
  workView: "grid",
  calendarMinutes: 5,
  calendarColor: "#FF3B30",
  calendarAlertSound: true,
  calendarAlertLed: true,
  calendarAlertColor: "#FF3B30",
  calendarView: "weeks3",
  serversView: "tiles",
  serversColor: "#3DDC84",
  serversAlertSound: true,
  serversAlertLed: true,
  serversAlertColor: "#3DDC84",
  serversColorDown: "#FF3030",
  serversTileDown: "#6A6A6A",
  appRotateSeconds: 0,
  appHideEmpty: false,
  appFlashMs: 700,
  appOrder: "music,claude,servers,calendar,work",
};

const DEFAULTS: Config = {
  screens: { music: true, claude: true, work: true, calendar: true, servers: true },
  lang: "en",
  host: "192.168.1.35",
  port: 8787,
  s: DEFAULT_SETTINGS,
};

/** Settings may arrive nested or flat depending on firmware, so look through groups. */
function flatten(source: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (source === null || typeof source !== "object") return out;
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value) && key.indexOf("_") < 0) flatten(value, out);
    else out[key] = value;
  }
  return out;
}

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

/** The agent's values over the defaults; anything of the wrong type is ignored. */
export function mergeSettings(base: AppSettings, from: Partial<AppSettings> | undefined): AppSettings {
  if (!from) return base;
  const out: Record<string, unknown> = {};
  (Object.keys(base) as (keyof AppSettings)[]).forEach((k) => {
    const d = base[k];
    const v = from[k];
    out[k] = typeof d === "boolean" ? bool(v, d) : typeof d === "number" ? num(v, d) : str(v, d as string);
  });
  return out as unknown as AppSettings;
}

/** Reads the app's settings from the device; falls back to the defaults when unavailable. */
export async function loadConfig(appId: string): Promise<Config> {
  try {
    const res = await fetch(`http://localhost/api/apps/settings?app_id=${appId}`);
    if (!res.ok) return DEFAULTS;
    const doc = JSON.parse(await res.text()) as { values?: unknown };
    const v = flatten(doc.values ?? doc);
    const screens = {} as Record<ScreenId, boolean>;
    (Object.keys(DEFAULTS.screens) as ScreenId[]).forEach((id) => {
      // The setting says "ai" where the code says "claude".
      screens[id] = bool(v[`screen_${id === "claude" ? "ai" : id}`], true);
    });
    return {
      screens,
      lang: v.lang === "ru" ? "ru" : "en",
      host: str(v.agent_host, DEFAULTS.host),
      port: num(v.agent_port, DEFAULTS.port),
      s: DEFAULT_SETTINGS,
    };
  } catch (err) {
    console.error(`${appId}: settings: ${err instanceof Error ? err.message : String(err)}`);
    return DEFAULTS;
  }
}
