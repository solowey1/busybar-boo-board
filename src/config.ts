import manifest from "./appmeta/manifest.json";
import type { Config, ScreenId } from "./types";

const DEFAULTS: Config = {
  screens: { music: true, claude: true, work: true, calendar: true, servers: true },
  host: "192.168.1.35",
  port: 8787,
  token: "",
  alertSound: true,
  calendarMinutes: 5,
  workHours: 0,
};

/** Settings arrive grouped; the values may be nested or flat depending on firmware, so look through groups. */
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

/** Reads the app settings from the device; falls back to the defaults when unavailable. */
export async function loadConfig(): Promise<Config> {
  try {
    const res = await fetch(`http://localhost/api/apps/settings?app_id=${manifest.id}`);
    if (!res.ok) return DEFAULTS;
    const doc = JSON.parse(await res.text()) as { values?: unknown };
    const v = flatten(doc.values ?? doc);
    const screens = {} as Record<ScreenId, boolean>;
    (Object.keys(DEFAULTS.screens) as ScreenId[]).forEach((id) => {
      screens[id] = bool(v[`screen_${id}`], true);
    });
    return {
      screens,
      host: str(v.agent_host, DEFAULTS.host),
      port: num(v.agent_port, DEFAULTS.port),
      token: str(v.agent_token, ""),
      alertSound: bool(v.alert_sound, true),
      calendarMinutes: num(v.calendar_minutes, DEFAULTS.calendarMinutes),
      workHours: num(v.work_hours, 0),
    };
  } catch (err) {
    console.error(`${manifest.id}: settings: ${err instanceof Error ? err.message : String(err)}`);
    return DEFAULTS;
  }
}
