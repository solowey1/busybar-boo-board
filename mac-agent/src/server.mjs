import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicConfig, RESERVED_HOSTNAMES } from "./config.mjs";
import * as bar from "./bar.mjs";
import { localizedGroups } from "./appsettings.mjs";

const PARTS = new Set(["music", "claude", "work", "calendar", "servers", "agents", "meta"]);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(ROOT, "..", "src", "appmeta", "settings.json");
const GLYPHS = join(ROOT, "..", "src", "glyphs.json");
/** The bar keeps a glyph as one 81-character string; the settings page wants nine rows. */
const glyphRows = () => Object.fromEntries(Object.entries(JSON.parse(readFileSync(GLYPHS, "utf8"))).map(([k, v]) => [k, Array.from({ length: 9 }, (_, y) => v.slice(y * 9, y * 9 + 9))]));

function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body, type = "application/json") {
  const text = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, { "Content-Type": type + "; charset=utf-8", "Content-Length": Buffer.byteLength(text), "Cache-Control": "no-store" });
  res.end(text);
}

/** Reads a JSON body of at most 64 KB. */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 65536) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Bar:
 *   GET  /state?s=music,claude&since=REV  -> snapshot, or {rev, same:true} when nothing changed
 *   POST /notify {kind,text}              -> alert on the bar
 * Menu-bar app and settings page:
 *   GET  /ui                              -> the settings page (no token needed, it holds no data)
 *   GET  /api/config, PUT /api/config     -> settings of the agent and, through it, of the app on the bar
 *   GET  /api/status                      -> live numbers for the page
 *   GET  /tray, POST /tray-state          -> what the menu-bar app needs, and what it reports back
 *   POST /calendar-feed                   -> events read by the menu-bar app
 *   POST /control {action}                -> the bar's big button on the music screen
 *   POST /activity {agent, state}         -> an agent says it is working / idle (hooks)
 * Everything except /ui needs the token: header X-Token or query t=.
 */
export function createApi({ hub, app, log = () => {} }) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://agent");
    // A bare address (http://name.local) goes to the settings page.
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(302, { Location: "/ui" });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/ui") {
      try {
        return send(res, 200, readFileSync(join(ROOT, "ui", "index.html"), "utf8"), "text/html");
      } catch {
        return send(res, 500, { error: "ui missing" });
      }
    }
    const config = app.getConfig();
    if (!sameToken(req.headers["x-token"] ?? url.searchParams.get("t"), config.token)) return send(res, 401, { error: "unauthorized" });

    try {
      if (req.method === "GET" && url.pathname === "/state") {
        // The bar says which language its own settings are in.
        if (url.searchParams.get("lang")) app.barLang(url.searchParams.get("lang"));
        const wanted = (url.searchParams.get("s") ?? "").split(",").filter((s) => PARTS.has(s));
        const since = Number(url.searchParams.get("since"));
        // `wait`: hold the request while nothing changes (up to 3 s), so a change reaches the bar the moment it happens.
        await hub.waitForChange(since, Math.min(3000, Number(url.searchParams.get("wait")) || 0));
        if (since === hub.rev) return send(res, 200, { rev: hub.rev, same: true, now: Math.floor(Date.now() / 1000) });
        return send(res, 200, hub.snapshot(wanted));
      }

      if (req.method === "POST" && url.pathname === "/notify") {
        const { kind = "info", text = "" } = await readJson(req);
        if (!text) return send(res, 400, { error: "text required" });
        hub.alert(String(kind), text);
        // "claude_done" and "codex_wait" also mean "that agent is idle now".
        const m = /^([a-z]+)_(done|wait)$/.exec(String(kind));
        if (m) app.activity(m[1] === "ai" ? "other" : m[1], "idle");
        log(`alert ${kind}: ${text}`);
        return send(res, 200, { ok: true });
      }

      // An agent's own word on what it is doing: {agent: "claude", state: "working" | "idle"}
      if (req.method === "POST" && url.pathname === "/activity") {
        const { agent, state } = await readJson(req);
        if (!/^[a-z]{2,20}$/.test(String(agent)) || !["working", "idle"].includes(state)) return send(res, 400, { error: "agent and state needed" });
        app.activity(agent, state);
        return send(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/calendar-feed") {
        app.calendarFeed(await readJson(req));
        return send(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/tray") return send(res, 200, { icon: config.trayIcon, port: config.port, bar: Boolean(config.bar.host), launchAtLogin: config.launchAtLogin, appIcon: config.appIcon, lang: config.lang });

      // The bar's big button on the music screen.
      if (req.method === "POST" && url.pathname === "/control") {
        const { action } = await readJson(req);
        if (action !== "toggle-play-pause") return send(res, 400, { error: "unknown action" });
        await app.togglePlayPause();
        return send(res, 200, { ok: true });
      }

      // The menu-bar app reports what it knows that the agent cannot: whether it is a login item.
      if (req.method === "POST" && url.pathname === "/tray-state") {
        app.setTrayState(await readJson(req));
        return send(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/status") return send(res, 200, app.status());

      if (req.method === "GET" && url.pathname === "/api/config") {
        const out = {
          config: publicConfig(config),
          // What the app on the bar needs to find this agent; the page may offer to fill it in.
          link: { host: app.lanAddress(), port: config.port, token: config.token },
          // The bar's own (small, flat) settings, and the settings of the screens, which live here.
          schema: JSON.parse(readFileSync(SCHEMA, "utf8")),
          groups: localizedGroups(config.lang),
          glyphs: glyphRows(),
          settings: config.settings,
          reserved: RESERVED_HOSTNAMES,
          aliasUrl: app.aliasUrl(),
          bar: { online: false, doc: null, error: null },
        };
        try {
          out.bar.doc = await bar.getSettings(config.bar);
          out.bar.online = true;
        } catch (err) {
          out.bar.error = err.message;
        }
        return send(res, 200, out);
      }

      if (req.method === "PUT" && url.pathname === "/api/config") {
        const body = await readJson(req);
        if (body.agent || body.settings) app.change({ ...(body.agent ?? {}), ...(body.settings ? { settings: body.settings } : {}) });
        let error = null;
        if (body.bar) {
          try {
            await bar.putSettings(app.getConfig().bar, body.bar);
            app.settingsChanged();
          } catch (err) {
            error = err.message;
          }
        }
        return send(res, error ? 502 : 200, { ok: !error, error });
      }
    } catch (err) {
      return send(res, 400, { error: err.message });
    }

    send(res, 404, { error: "not found" });
  });
}
