import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultSettings, sanitizeSettings } from "./appsettings.mjs";

export const CONFIG_DIR = join(homedir(), ".config", "busybar-status");
export const STATE_DIR = join(homedir(), ".local", "state", "busybar-status");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const TRAY_ICONS = ["mono", "orange", "rainbow", "green", "blue"];
export const LANGS = ["ru", "en"];
/** The bar answers to busybar.local itself: that name is never ours. */
export const RESERVED_HOSTNAMES = ["busybar"];

const DEFAULTS = {
  // Address the agent listens on. 0.0.0.0 = the whole LAN (the bar must reach it).
  host: "0.0.0.0",
  port: 8787,
  // Shared secret the bar sends with every request. Generated on first start.
  token: "",
  // Services shown on the "Servers" screen, in this order: { name, url, icon, color, downColor }.
  // A 2xx or 3xx answer = up. `icon` is a name from src/glyphs.ts; an empty colour means "the default".
  servers: [{ name: "BusyBar", url: "https://busybar.solowey.ru/api/health", icon: "server", color: "", downColor: "" }],
  // Settings of the screens: see appsettings.mjs.
  settings: defaultSettings(),
  // Calendars to ignore (by title) on the "Calendar" screen.
  calendarExclude: [],
  // The bar itself: lets the settings page change the app's settings on it.
  bar: { host: "", password: "" },
  // Look of the menu-bar icon: one of TRAY_ICONS.
  trayIcon: "mono",
  // Start the menu-bar app at every login (a login item, which macOS lists in System Settings).
  launchAtLogin: false,
  // Where the app shows itself: "tray", "dock", "both" or "none" (then only the browser address opens the settings).
  appIcon: "tray",
  // A friendly name for the settings page, published on the local network: "status" gives http://status.local:PORT/ui
  uiHostname: "",
  // The language of the whole app: the settings page, the menu-bar app, the bar, the notifications.
  lang: "en",
};

/** The system's language when the app speaks it (Russian), otherwise English. */
export function systemLang(env = process.env) {
  const raw = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || "";
  return /^ru/i.test(String(raw)) ? "ru" : "en";
}

/** Loads the config, creating it (with a fresh token and the system's language) on first run. */
export function loadConfig(file = CONFIG_FILE) {
  const isNew = !existsSync(file);
  let stored = {};
  if (existsSync(file)) stored = JSON.parse(readFileSync(file, "utf8"));
  const config = { ...DEFAULTS, ...stored, bar: { ...DEFAULTS.bar, ...(stored.bar ?? {}) } };
  // An older file kept the idle limit at the top level.
  if (!stored.settings && stored.workIdleSec) config.settings = { ...defaultSettings(), work: { ...defaultSettings().work, idleSec: stored.workIdleSec } };
  delete config.workIdleSec;
  // The calendar used to be blue by default and is red now; a colour saved only because it was the default follows.
  if (String(config.settings?.calendar?.color).toUpperCase() === "#4DA3FF") config.settings = { ...config.settings, calendar: { ...config.settings.calendar, color: "#FF3B30" } };
  config.settings = sanitizeSettings(config.settings);
  config.servers = cleanServers(config.servers);
  if (!LANGS.includes(config.lang)) config.lang = "en";
  // A first start takes the system's language; the bar still has its own default until the agent has written this one to it.
  if (isNew) {
    config.lang = systemLang();
    config.langPending = true;
  }
  // An older version allowed "busybar", which is the bar's own name.
  if (RESERVED_HOSTNAMES.includes(String(config.uiHostname).toLowerCase())) config.uiHostname = "";
  if (!config.token) {
    config.token = randomBytes(16).toString("hex");
    saveConfig(config, file);
  }
  return config;
}

/** Writes the config; the file holds the token and the bar's password, so it is private. */
export function saveConfig(config, file = CONFIG_FILE) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** What the settings page may see: no token, and the password only as a flag. */
export function publicConfig(config) {
  const { token: _token, bar, ...rest } = config;
  return { ...rest, bar: { host: bar.host, hasPassword: Boolean(bar.password) } };
}

const clean = (s, max) => String(s ?? "").trim().slice(0, max);
const HEX = /^#[0-9a-fA-F]{6}$/;
export const APP_ICONS = ["tray", "dock", "both", "none"];

/** Servers need a name and an http(s) address; at most 12, kept in the given order. */
export function cleanServers(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({
      name: clean(s?.name, 30),
      url: clean(s?.url, 200),
      icon: /^[a-z0-9-]{1,24}$/.test(s?.icon ?? "") ? s.icon : "server",
      color: HEX.test(s?.color ?? "") ? s.color.toUpperCase() : "",
      downColor: HEX.test(s?.downColor ?? "") ? s.downColor.toUpperCase() : "",
    }))
    .filter((s) => s.name && /^https?:\/\//i.test(s.url))
    .slice(0, 12);
}

/** Applies a change from the settings page, keeping only what is valid. */
export function applyChange(config, change) {
  const next = { ...config, bar: { ...config.bar } };
  if (Array.isArray(change.servers)) next.servers = cleanServers(change.servers);
  if (change.settings && typeof change.settings === "object") next.settings = sanitizeSettings(change.settings);
  if (APP_ICONS.includes(change.appIcon)) next.appIcon = change.appIcon;
  if (LANGS.includes(change.lang)) {
    next.lang = change.lang;
    // Chosen on purpose: the bar is not given the system's language any more.
    next.langPending = false;
  }
  if (typeof change.uiHostname === "string") {
    const name = change.uiHostname.trim().toLowerCase();
    // Letters, digits and dashes; not the name the bar itself answers to.
    if (/^[a-z0-9-]{0,30}$/.test(name) && !RESERVED_HOSTNAMES.includes(name)) next.uiHostname = name;
  }
  if (Array.isArray(change.calendarExclude)) next.calendarExclude = change.calendarExclude.map((s) => clean(s, 80)).filter(Boolean).slice(0, 30);
  if (TRAY_ICONS.includes(change.trayIcon)) next.trayIcon = change.trayIcon;
  if (typeof change.launchAtLogin === "boolean") next.launchAtLogin = change.launchAtLogin;
  if (change.bar && typeof change.bar === "object") {
    if (typeof change.bar.host === "string") next.bar.host = clean(change.bar.host, 80);
    // An empty password means "unchanged", so the page never has to know the old one.
    if (typeof change.bar.password === "string" && change.bar.password) next.bar.password = change.bar.password;
  }
  return next;
}
