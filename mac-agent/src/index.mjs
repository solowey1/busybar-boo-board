import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { applyChange, loadConfig, saveConfig } from "./config.mjs";
import { forBar } from "./appsettings.mjs";
import * as bar from "./bar.mjs";
import { Hub } from "./hub.mjs";
import { createApi } from "./server.mjs";
import { startMusic } from "./sources/music.mjs";
import { startClaude } from "./sources/claude.mjs";
import { startWork } from "./sources/work.mjs";
import { startCalendar } from "./sources/calendar.mjs";
import { startServers } from "./sources/servers.mjs";
import { startAlias } from "./alias.mjs";
import { startAgents } from "./sources/agents.mjs";
import { togglePlayPause } from "./control.mjs";

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
let config = loadConfig();
const hub = new Hub();
const startedAt = Date.now();

const stopMusic = startMusic({ hub, log });
const stopClaude = startClaude({ hub, log });
const work = startWork({ hub, log, getLimit: () => config.settings.work.idleSec, getKeepDays: () => config.settings.work.keepDays });
const agents = startAgents({ hub, log });
const calendar = startCalendar({ hub, log, getExclude: () => config.calendarExclude });
const getLang = () => config.lang;
let servers = startServers({ hub, log, servers: config.servers, getLang });
let settingsRev = 0;
let tray = { loginItem: "unknown", seenAt: 0 };
/** What the app on the bar reads about its settings: a revision, and the values of the screens. */
const publishMeta = () => hub.set("meta", { settingsRev, settings: forBar(config.settings) });
publishMeta();

/** The first private IPv4 address: what the bar should use to reach this Mac. */
const lanAddress = () => {
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) if (n.family === "IPv4" && !n.internal) return n.address;
  }
  return "";
};

/** The language each app on the bar reported last: only a change on that app's side is taken over, not its old value. */
const lastBarLang = new Map();
// The settings page is also served on port 80 while a name is set, so that http://NAME.local opens it without ":8787".
let port80 = null;
let port80ok = false;
let stopAlias = () => {};
const startNameAlias = () => {
  stopAlias();
  stopAlias = startAlias({ name: config.uiHostname, port: config.port, address: lanAddress(), log });
};
startNameAlias();

const app = {
  getConfig: () => config,
  togglePlayPause,
  activity: (id, state) => agents.hook(id, state),
  aliasUrl: () => (config.uiHostname ? `http://${config.uiHostname}.local${port80ok ? "" : ":" + config.port}/ui` : ""),
  lanAddress,
  /** Saves a change from the settings page and restarts what depends on it. */
  change(change) {
    const next = applyChange(config, change);
    const serversChanged = JSON.stringify(next.servers) !== JSON.stringify(config.servers);
    const aliasChanged = next.uiHostname !== config.uiHostname;
    config = next;
    saveConfig(config);
    if (serversChanged) {
      servers.stop();
      servers = startServers({ hub, log, servers: config.servers, getLang });
    }
    if (aliasChanged) {
      startNameAlias();
      startPort80();
    }
    calendar.refresh();
    publishMeta();
    return config;
  },
  /** The bar's own settings were changed: tell the app on the bar to read them again. */
  settingsChanged() {
    settingsRev += 1;
    publishMeta();
  },
  calendarFeed: (body) => calendar.feed(body),
  /** The language the bar's own settings say; the agent follows it, unless the page has just changed it. */
  barLang(lang, appId = "") {
    if (!["ru", "en"].includes(lang)) return;
    const before = lastBarLang.get(appId);
    lastBarLang.set(appId, lang);
    // The first answer of an app only tells what it has; the page on the Mac may have changed the language a moment ago and
    // the app not have read it yet, so an unchanged old value is never taken back. Each app is followed on its own,
    // since several apps of ours can be on the bar with a language each.
    if (before === undefined || before === lang || lang === config.lang) return;
    config = { ...config, lang };
    saveConfig(config);
  },
  setTrayState: (body) => {
    tray = { loginItem: String(body?.loginItem ?? "unknown"), seenAt: Date.now() };
  },
  status() {
    const snap = hub.snapshot(["music", "claude", "work", "calendar", "servers"]);
    return {
      port: config.port,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      music: snap.music,
      claude: snap.claude,
      work: snap.work && { ...snap.work, history: work.history() },
      calendar: snap.calendar,
      servers: servers.latest(),
      agents: agents.snapshot(),
      tray: { loginItem: tray.loginItem, running: Date.now() - tray.seenAt < 15_000 },
    };
  },
};

/**
 * A first start took the system's language. The app on the bar has only its own default until it is told, so once the bar
 * can be reached its language is set to the same, one time; whoever picks a language on purpose is never overridden.
 */
async function syncBarLang() {
  if (!config.langPending) return;
  if (!config.bar.host) return void setTimeout(syncBarLang, 30_000).unref();
  try {
    const apps = await bar.installedApps(config.bar);
    if (apps.ids.length === 0) throw new Error("no app of ours on the bar yet");
    await bar.putEverywhere(config.bar, { lang: config.lang }, apps.ids);
    app.settingsChanged();
    config = { ...config, langPending: false };
    saveConfig(config);
  } catch (err) {
    log(`bar language: ${err.message}`);
    setTimeout(syncBarLang, 30_000).unref();
  }
}
setTimeout(syncBarLang, 3000).unref();

/**
 * An app of ours that appears on the bar after the agent has seen the others (a screen installed on its own) is given the
 * common settings once: the language, and where to find this Mac. The apps that were there when the agent first looked
 * (or in an earlier run) keep what they have: they may have been set by hand.
 */
async function welcomeNewApps() {
  if (!config.bar.host) return;
  try {
    const apps = await bar.installedApps(config.bar);
    const welcomed = new Set(config.welcomed ?? []);
    const fresh = apps.ids.filter((id) => !welcomed.has(id));
    if (fresh.length === 0) return;
    // The first look only records what is there.
    if (config.welcomed !== undefined) {
      await bar.putEverywhere(config.bar, { lang: config.lang, agent_host: lanAddress(), agent_port: config.port }, fresh);
      app.settingsChanged();
    }
    config = { ...config, welcomed: [...welcomed, ...fresh] };
    saveConfig(config);
  } catch (err) {
    log(`bar apps: ${err.message}`);
  }
}
setTimeout(welcomeNewApps, 8000).unref();
setInterval(welcomeNewApps, 30_000).unref();

const server = createApi({ hub, app, log });
server.listen(config.port, config.host, () => {
  log(`busybar-status agent on ${config.host}:${config.port}`);
  // Without a menu-bar app (Windows, Linux, a plain run) the start script asks for the page to open.
  // The address holds the token, so it is shown only then, in the console, and never written to a log file.
  if (process.env.BUSYBAR_OPEN === "1") {
    const page = `http://127.0.0.1:${config.port}/ui?t=${config.token}`;
    console.log(`settings: ${page}`);
    openBrowser(page);
  }
});

/** A second listener on port 80 for the friendly name. macOS lets any program take it; elsewhere it may be refused. */
function startPort80() {
  const old = port80;
  port80 = null;
  port80ok = false;
  old?.close();
  if (!config.uiHostname || config.port === 80) return;
  const web = createApi({ hub, app, log });
  web.on("error", (err) => log(`port 80: ${err.code ?? err.message} (the page stays on :${config.port})`));
  web.listen(80, config.host, () => {
    port80ok = true;
    log("settings page also on port 80");
  });
  port80 = web;
}
startPort80();

function openBrowser(url) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

const shutdown = () => {
  stopMusic();
  stopClaude();
  work.stop();
  calendar.stop();
  agents.stop();
  servers.stop();
  stopAlias();
  port80?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
