/** Talks to the BUSY Bar's own HTTP API (the settings of the apps that run on it). */
/** The combined app: all the screens in one, with the wheel between them. */
export const APP_ID = "app.solowey.boo-board";

/**
 * The screens as apps of their own (see apps/ in the repository). `group` is the screen's tab on the settings page and
 * `screen` its id in the bar app. A screen is there when its own app is on the bar, or the combined one.
 */
export const MODULES = [
  { group: "music", screen: "music", app: "app.solowey.boo-music", name: "Boo: Music" },
  { group: "ai", screen: "claude", app: "app.solowey.boo-agents", name: "Boo: Agents" },
  { group: "servers", screen: "servers", app: "app.solowey.boo-servers", name: "Boo: Servers" },
  { group: "calendar", screen: "calendar", app: "app.solowey.boo-calendar", name: "Boo: Calendar" },
  { group: "work", screen: "work", app: "app.solowey.boo-work", name: "Boo: Work time" },
];

async function call(bar, path, init = {}) {
  if (!bar?.host) throw new Error("bar address is not set");
  const res = await fetch(`http://${bar.host}${path}`, {
    ...init,
    headers: { "X-API-Token": bar.password ?? "", "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`bar answered ${res.status}: ${text.slice(0, 120)}`);
  return text ? JSON.parse(text) : {};
}

export const getSettings = (bar, appId = APP_ID) => call(bar, `/api/apps/settings?app_id=${appId}`);
export const putSettings = (bar, doc, appId = APP_ID) => call(bar, `/api/apps/settings?app_id=${appId}`, { method: "PUT", body: JSON.stringify(doc) });
export const listApps = async (bar) => ((await call(bar, "/api/apps/list")).apps ?? []).map((a) => a.id);

/**
 * Which of our apps are on the bar: the combined one, the modules, and for every screen whether it is there (in a module
 * of its own or in the combined app). `ids` are the installed apps of ours, the combined one first.
 */
export async function installedApps(bar) {
  const all = await listApps(bar);
  const combined = all.includes(APP_ID);
  const ids = [...(combined ? [APP_ID] : []), ...MODULES.filter((m) => all.includes(m.app)).map((m) => m.app)];
  return { combined, ids, screens: Object.fromEntries(MODULES.map((m) => [m.group, combined || all.includes(m.app)])) };
}

/**
 * Writes the common settings (language, the Mac's address and port) to every app of ours on the bar, and the
 * screen switches to the combined app: each app takes the keys it has and keeps what else is in its own settings.
 */
export async function putEverywhere(bar, values, ids) {
  const docs = [];
  for (const id of ids) {
    const doc = await getSettings(bar, id);
    const own = doc.values ?? {};
    const next = { ...own };
    for (const k of Object.keys(own)) if (k in values) next[k] = values[k];
    await putSettings(bar, { version: doc.version, values: next }, id);
    docs.push(id);
  }
  return docs;
}
export const getSystem = (bar) => call(bar, "/api/status/system");
