import { t } from "../i18n.mjs";

/** Pings every configured URL once a minute; the screen shows tiles or a list, in the configured order. */
export function startServers({ hub, log, servers, getLang = () => "ru", intervalMs = 60_000 }) {
  if (!servers?.length) {
    hub.set("servers", { items: [] });
    return { stop() {}, latest: () => [] };
  }
  // `ms` is kept for the settings page, which shows the latency.
  const check = async ({ name, url, icon, color, downColor }) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
      return { name, icon, color, downColor, ok: res.status < 400, ms: Date.now() - t0 };
    } catch {
      return { name, icon, color, downColor, ok: false, ms: 0 };
    }
  };
  let previous = new Map();
  let latest = [];
  const tick = async () => {
    const items = await Promise.all(servers.map(check));
    for (const it of items) {
      const was = previous.get(it.name);
      if (was === true && !it.ok) hub.alert("server_down", t(getLang(), "serverDown", { name: it.name }));
      if (was === false && it.ok) hub.alert("server_up", t(getLang(), "serverUp", { name: it.name }));
      previous.set(it.name, it.ok);
    }
    // Latency jitter must not bump the revision: only up/down is published.
    hub.set("servers", { items: items.map(({ name, ok, icon, color, downColor }) => ({ name, ok, icon, color, downColor })) });
    latest = items;
  };
  void tick().catch((e) => log(`servers: ${e.message}`));
  const timer = setInterval(() => void tick().catch((e) => log(`servers: ${e.message}`)), intervalMs);
  return { stop: () => clearInterval(timer), latest: () => latest };
}
