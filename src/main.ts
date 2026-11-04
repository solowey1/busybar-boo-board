import { device } from "@shared/device";
import manifest from "./appmeta/manifest.json";
import { fetchState } from "./agent";
import { loadConfig } from "./config";
import { calendar } from "./screens/calendar";
import { claude } from "./screens/claude";
import { music } from "./screens/music";
import { servers } from "./screens/servers";
import { work } from "./screens/work";
import type { AgentAlert, AgentState, Config, Ctx, El, Screen, ScreenId } from "./types";
import { AMBER, BLUE, DIM, GREEN, RED, WHITE, label } from "./util";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

const ALL: Screen[] = [music, claude, work, calendar, servers];
const POLL_MS = 3000;
const POLL_OFFLINE_MS = 10000;
const TICK_MS = 1000;
const ALERT_MS = 9000;
const FLASH_MS = 1200;
/** Other apps and BUSY sessions can wipe our elements; resend everything now and then. */
const REFRESH_MS = 60000;
const SOUND_REMINDER = "shared/sounds/calendar_reminder_ends.snd";
const SOUND_START = "shared/sounds/calendar_event_starts.snd";

interface Banner {
  until: number;
  els: El[];
  led?: string;
}

const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

function alertColor(kind: string): string {
  if (kind.indexOf("down") >= 0) return RED;
  if (kind.indexOf("claude") === 0) return GREEN;
  if (kind.indexOf("calendar") === 0) return AMBER;
  return BLUE;
}

function alertHeader(kind: string): string {
  if (kind.indexOf("claude") === 0) return "Claude";
  if (kind.indexOf("server") === 0) return "Сервер";
  if (kind.indexOf("calendar") === 0) return "Встреча";
  if (kind.indexOf("work") === 0) return "Работа";
  return "Уведомление";
}

function main(): void {
  let cfg: Config | null = null;
  let screens: Screen[] = [];
  let index = 0;
  let data: AgentState = { rev: 0, alerts: [] };
  let recvAt = Date.now();
  let online = false;
  let lastAlertId = 0;
  let gotFirst = false;
  let banner: Banner | null = null;
  let flashUntil = 0;
  let stopped = false;
  let drawing = false;
  let refreshAt = Date.now() + REFRESH_MS;
  let polling = false;
  const sent: Record<string, string> = {};
  const done: Record<string, boolean> = {};
  let pollTimer: number | undefined;
  let tickTimer: number | undefined;

  const wantedParts = (c: Config): ScreenId[] => {
    const ids: ScreenId[] = [];
    ALL.forEach((s) => {
      if (c.screens[s.id]) ids.push(s.id);
    });
    if (c.calendarMinutes > 0 && ids.indexOf("calendar") < 0) ids.push("calendar");
    if (c.workHours > 0 && ids.indexOf("work") < 0) ids.push("work");
    return ids;
  };

  const play = (path: string): void => {
    if (!cfg || !cfg.alertSound) return;
    fetch("http://localhost/api/audio/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_name: APP, stock_path: path }),
    }).catch(report);
  };

  const show = (els: El[], ms: number, o: { sound?: string; led?: string } = {}): void => {
    banner = { until: Date.now() + ms, els, led: o.led };
    if (o.sound) play(o.sound);
  };

  const showAlert = (a: AgentAlert): void => {
    const color = alertColor(a.kind);
    show([label("a.h", alertHeader(a.kind), 0, { color, scroll_rate: 0 }), label("a.t", a.text, 8, { color: WHITE, scroll_rate: 1500 })], ALERT_MS, {
      sound: SOUND_REMINDER,
      led: color,
    });
  };

  /** Pop-ups that the bar works out itself from the data it already has. */
  const localAlerts = (ctx: Ctx): void => {
    if (!cfg) return;
    const nowS = Math.floor(ctx.at / 1000);
    const e = data.calendar && data.calendar.ok ? data.calendar.events[0] : undefined;
    if (e && cfg.calendarMinutes > 0) {
      const remaining = Math.floor(recvAt / 1000) + e.startIn - nowS;
      const key = e.title + "|" + (Math.floor(recvAt / 1000) + e.startIn);
      const stage = remaining <= 0 && remaining > -60 ? 2 : remaining <= 60 && remaining > 0 ? 1 : remaining <= cfg.calendarMinutes * 60 && remaining > 0 ? 0 : -1;
      if (stage >= 0 && !done[key + "#" + stage]) {
        done[key + "#" + stage] = true;
        // Skip a stage that is already behind us when the first data arrives late.
        show(calendar.elements(ctx), ALERT_MS, { sound: stage === 2 ? SOUND_START : SOUND_REMINDER, led: AMBER });
      }
    }
    if (cfg.workHours > 0 && data.work) {
      const total = data.work.todaySec + (data.work.active ? Math.floor((ctx.at - recvAt) / 1000) : 0);
      const key = "work|" + new Date(ctx.at).toDateString();
      if (total >= cfg.workHours * 3600 && !done[key]) {
        done[key] = true;
        show([label("a.h", "Работа", 0, { color: BLUE, scroll_rate: 0 }), label("a.t", "Уже " + cfg.workHours + " ч за день", 8, { color: WHITE })], ALERT_MS, { sound: SOUND_REMINDER, led: BLUE });
      }
    }
  };

  /** Sends only what changed since the last frame and clears what disappeared. */
  const sync = async (els: El[], led?: string): Promise<void> => {
    if (drawing) return;
    const changed: El[] = [];
    const ids: Record<string, boolean> = {};
    els.forEach((el) => {
      ids[el.id] = true;
      const json = JSON.stringify(el);
      if (sent[el.id] !== json) changed.push(el);
    });
    const gone = Object.keys(sent).filter((id) => !ids[id]);
    if (changed.length === 0 && gone.length === 0) return;
    drawing = true;
    try {
      if (gone.length > 0) {
        await device.DisplayClear({ application_name: APP, element_ids: gone } as never);
        gone.forEach((id) => delete sent[id]);
      }
      if (changed.length > 0) {
        const body: Record<string, unknown> = { application_name: APP, priority: 50, elements: changed };
        if (led) body.led_notification_color = led;
        await device.DisplayDraw(body as never);
        changed.forEach((el) => {
          sent[el.id] = JSON.stringify(el);
        });
      }
    } finally {
      drawing = false;
    }
  };

  const frame = (): void => {
    if (!cfg || stopped) return;
    const now = Date.now();
    if (now >= refreshAt && !drawing) {
      refreshAt = now + REFRESH_MS;
      Object.keys(sent).forEach((id) => delete sent[id]);
    }
    const ctx: Ctx = { cfg, data, at: now, recvAt, online };
    localAlerts(ctx);
    let els: El[];
    let led: string | undefined;
    if (banner && now < banner.until) {
      els = banner.els;
      led = banner.led;
      // The LED blinks once, with the first frame of the banner.
      if (banner.led) banner.led = undefined;
    } else if (now < flashUntil && screens.length > 0) {
      const s = screens[index];
      els = [label("f.t", s.title, 0, { color: WHITE, scroll_rate: 0 }), label("f.n", index + 1 + " / " + screens.length, 8, { color: DIM, scroll_rate: 0 })];
    } else if (screens.length === 0) {
      els = [label("n.t", "Нет экранов", 4, { color: DIM })];
    } else if (!online && data.rev === 0) {
      els = [label("o.t", "Mac не отвечает", 0, { color: RED, scroll_rate: 0 }), label("o.d", cfg.host, 8, { color: DIM, scroll_rate: 0 })];
    } else {
      els = screens[index].elements(ctx);
    }
    sync(els, led).catch(report);
  };

  const poll = (): void => {
    if (stopped || !cfg || polling) return;
    polling = true;
    const c = cfg;
    fetchState(c, data.rev, wantedParts(c))
      .then((next) => {
        online = true;
        if (next === null) return;
        const first = !gotFirst;
        gotFirst = true;
        let top = lastAlertId;
        next.alerts.forEach((a) => {
          if (a.id > top) top = a.id;
        });
        // Whatever was queued before the app started is old news.
        if (!first) next.alerts.filter((a) => a.id > lastAlertId).forEach(showAlert);
        lastAlertId = top;
        data = next;
        recvAt = Date.now();
      })
      .catch((err) => {
        if (online) report(err);
        online = false;
      })
      .then(() => {
        polling = false;
        if (!stopped) pollTimer = setTimeout(poll, online ? POLL_MS : POLL_OFFLINE_MS) as unknown as number;
      });
  };

  const quit = (unbind: () => void): void => {
    stopped = true;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    if (tickTimer !== undefined) clearInterval(tickTimer);
    // The bar takes the screen back once the last handle is released.
    device.DisplayClear({ application_name: APP } as never).catch(report);
    setTimeout(unbind, 0);
  };

  // Input is bound at once, so Back always works while the settings load.
  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "back" && event.action === "short") return quit(unbind);
    if (event.key === "encoder" && screens.length > 1) {
      index = (index + (event.delta > 0 ? 1 : screens.length - 1)) % screens.length;
      flashUntil = Date.now() + FLASH_MS;
      banner = null;
      frame();
    }
  });

  loadConfig()
    .then((c) => {
      cfg = c;
      screens = ALL.filter((s) => c.screens[s.id]);
      tickTimer = setInterval(frame, TICK_MS) as unknown as number;
      frame();
      poll();
    })
    .catch(report);
}

main();
