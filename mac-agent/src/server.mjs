import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const PARTS = new Set(["music", "claude", "work", "calendar", "servers"]);

function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

/**
 * GET  /state?s=music,claude&since=REV  -> snapshot, or {rev, same:true} when nothing changed
 * POST /notify {kind,text}              -> alert on the bar
 * Every request needs the token: header X-Token or query t=.
 */
export function createApi({ hub, token, log = () => {} }) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://agent");
    if (!sameToken(req.headers["x-token"] ?? url.searchParams.get("t"), token)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "GET" && url.pathname === "/state") {
      const wanted = (url.searchParams.get("s") ?? "").split(",").filter((s) => PARTS.has(s));
      const since = Number(url.searchParams.get("since"));
      if (since === hub.rev) return send(res, 200, { rev: hub.rev, same: true, now: Math.floor(Date.now() / 1000) });
      return send(res, 200, hub.snapshot(wanted));
    }

    if (req.method === "POST" && url.pathname === "/notify") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) req.destroy();
      });
      req.on("end", () => {
        try {
          const { kind = "info", text = "" } = JSON.parse(body || "{}");
          if (!text) return send(res, 400, { error: "text required" });
          hub.alert(String(kind), text);
          log(`alert ${kind}: ${text}`);
          send(res, 200, { ok: true });
        } catch {
          send(res, 400, { error: "bad json" });
        }
      });
      return;
    }

    send(res, 404, { error: "not found" });
  });
}
