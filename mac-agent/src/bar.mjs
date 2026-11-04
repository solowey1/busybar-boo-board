/** Talks to the BUSY Bar's own HTTP API (the settings of the app that runs on it). */
export const APP_ID = "app.solowey.busybar-status";

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

export const getSettings = (bar) => call(bar, `/api/apps/settings?app_id=${APP_ID}`);
export const putSettings = (bar, doc) => call(bar, `/api/apps/settings?app_id=${APP_ID}`, { method: "PUT", body: JSON.stringify(doc) });
export const getSystem = (bar) => call(bar, "/api/status/system");
