/** Pings every configured URL once a minute; the screen shows how many are down. */
export function startServers({ hub, log, servers, intervalMs = 60_000 }) {
  if (!servers?.length) {
    hub.set("servers", { items: [] });
    return () => {};
  }
  const check = async ({ name, url }) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
      return { name, ok: res.status < 400, ms: Date.now() - t0 };
    } catch {
      return { name, ok: false, ms: 0 };
    }
  };
  let previous = new Map();
  const tick = async () => {
    const items = await Promise.all(servers.map(check));
    for (const it of items) {
      const was = previous.get(it.name);
      if (was === true && !it.ok) hub.alert("server_down", `${it.name} недоступен`);
      if (was === false && it.ok) hub.alert("server_up", `${it.name} снова в сети`);
      previous.set(it.name, it.ok);
    }
    // Latency jitter must not bump the revision: only up/down is published.
    hub.set("servers", { items: items.map(({ name, ok }) => ({ name, ok })) });
  };
  void tick().catch((e) => log(`servers: ${e.message}`));
  const timer = setInterval(() => void tick().catch((e) => log(`servers: ${e.message}`)), intervalMs);
  return () => clearInterval(timer);
}
