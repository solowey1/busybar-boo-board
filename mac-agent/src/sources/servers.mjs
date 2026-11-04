import { t } from "../i18n.mjs";

/** Pings every configured URL once a minute; the screen shows tiles or a list, in the configured order. */
export function startServers({ hub, log, servers, getLang = () => "ru", intervalMs = 60_000 }) {
  if (!servers?.length) {
    hub.set("servers", { items: [] });
    return { stop() {}, latest: () => [] };
  }
  // `ms` is the latency, for the settings page.
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
  /** When each server last changed between up and down (ms), for the card's "up for 3h". */
  const since = new Map();
  const hostOf = (url) => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  };
  const urls = new Map(servers.map((sv) => [sv.name, hostOf(sv.url)]));
  let latest = [];
  const tick = async () => {
    const items = await Promise.all(servers.map(check));
    for (const it of items) {
      const was = previous.get(it.name);
      if (was === true && !it.ok) hub.alert("server_down", t(getLang(), "serverDown", { name: it.name }));
      if (was === false && it.ok) hub.alert("server_up", t(getLang(), "serverUp", { name: it.name }));
      if (was !== it.ok) since.set(it.name, Date.now());
      previous.set(it.name, it.ok);
    }
    // `host` and `age` (minutes in the present state) are for the server's card on the bar; the revision moves once a minute with `age`.
    hub.set("servers", {
      items: items.map(({ name, ok, icon, color, downColor }) => ({ name, ok, icon, color, downColor, host: urls.get(name) ?? "", age: Math.floor((Date.now() - (since.get(name) ?? Date.now())) / 60_000) })),
    });
    latest = items;
  };
  void tick().catch((e) => log(`servers: ${e.message}`));
  const timer = setInterval(() => void tick().catch((e) => log(`servers: ${e.message}`)), intervalMs);
  return { stop: () => clearInterval(timer), latest: () => latest };
}
