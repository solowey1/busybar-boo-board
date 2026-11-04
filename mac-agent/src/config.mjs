import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "busybar-status");
export const STATE_DIR = join(homedir(), ".local", "state", "busybar-status");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  // Address the agent listens on. 0.0.0.0 = the whole LAN (the bar must reach it).
  host: "0.0.0.0",
  port: 8787,
  // Shared secret the bar sends with every request. Generated on first start.
  token: "",
  // Services shown on the "Servers" screen: { name, url }. A 2xx answer = up.
  servers: [{ name: "BusyBar", url: "https://busybar.solowey.ru/api/health" }],
  // Calendars to ignore (by title) on the "Calendar" screen.
  calendarExclude: [],
};

/** Loads the config, creating it (with a fresh token) on first run. */
export function loadConfig(file = CONFIG_FILE) {
  let stored = {};
  if (existsSync(file)) stored = JSON.parse(readFileSync(file, "utf8"));
  const config = { ...DEFAULTS, ...stored };
  if (!config.token) {
    config.token = randomBytes(16).toString("hex");
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify({ ...stored, token: config.token }, null, 2) + "\n", { mode: 0o600 });
  }
  return config;
}
