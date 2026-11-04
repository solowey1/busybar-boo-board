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
/** After the wheel or OK is used, the automatic rotation waits this long. */
const ROTATE_HOLD_MS = 15000;
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

const byId = (id: ScreenId): Screen => ALL.filter((s) => s.id === id)[0];

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
  let enabled: Screen[] = [];
  let current: ScreenId = "music";
  const views: Record<string, number> = {};
  let data: AgentState = { rev: 0, alerts: [] };
  let recvAt = Date.now();
  let online = false;
  let lastAlertId = 0;
  let gotFirst = false;
  let banner: Banner | null = null;
  let flashUntil = 0;
  let lastInputAt = 0;
  let rotateAt = 0;
  let stopped = false;
  let drawing = false;
  let polling = false;
  let refreshAt = Date.now() + REFRESH_MS;
  const sent: Record<string, string> = {};
  const done: Record<string, boolean> = {};
  let pollTimer: number | undefined;
  let tickTimer: number | undefined;

  const wantedParts = (c: Config): ScreenId[] => {
    const ids: ScreenId[] = [];
    ALL.forEach((s) => {
      if (c.screens[s.id]) ids.push(s.id);
    });
    if ((c.calendarMinutes > 0 || c.hideEmpty) && ids.indexOf("calendar") < 0) ids.push("calendar");
    if ((c.workHours > 0 || c.breakMinutes > 0) && ids.indexOf("work") < 0) ids.push("work");
    return ids;
  };

  const makeCtx = (now: number): Ctx => ({ cfg: cfg as Config, data, at: now, recvAt, online, view: views[current] || 0 });

  /** The screens the wheel goes through: the enabled ones, minus the empty ones when that is asked for. */
  const visible = (ctx: Ctx): Screen[] => {
    const list = enabled.filter((s) => !(ctx.cfg.hideEmpty && s.isEmpty && s.isEmpty({ ...ctx, view: 0 })));
    return list.length > 0 ? list : enabled;
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

  const showText = (header: string, text: string, color: string): void => {
    show([label("a.h", header, 0, { color, scroll_rate: 0 }), label("a.t", text, 8, { color: WHITE, scroll_rate: 1500 })], ALERT_MS, { sound: SOUND_REMINDER, led: color });
  };

  const showAlert = (a: AgentAlert): void => showText(alertHeader(a.kind), a.text, alertColor(a.kind));

  /** Pop-ups that the bar works out itself from the data it already has. */
  const localAlerts = (ctx: Ctx): void => {
    if (!cfg) return;
    const nowS = Math.floor(ctx.at / 1000);
    const e = data.calendar && data.calendar.ok ? data.calendar.events[0] : undefined;
    if (e && cfg.calendarMinutes > 0) {
      const startAt = Math.floor(recvAt / 1000) + e.startIn;
      const remaining = startAt - nowS;
      const key = e.title + "|" + startAt;
      // 0: N minutes before, 1: one minute before, 2: at the start.
      const stage = remaining <= 0 && remaining > -60 ? 2 : remaining <= 60 && remaining > 0 ? 1 : remaining <= cfg.calendarMinutes * 60 && remaining > 0 ? 0 : -1;
      if (stage >= 0 && !done[key + "#" + stage]) {
        done[key + "#" + stage] = true;
        show(calendar.elements({ ...ctx, view: 0 }), ALERT_MS, { sound: stage === 2 ? SOUND_START : SOUND_REMINDER, led: AMBER });
      }
    }
    if (data.work) {
      const grow = data.work.active ? Math.floor((ctx.at - recvAt) / 1000) : 0;
      const day = new Date(ctx.at).toDateString();
      if (cfg.workHours > 0) {
        const key = "work|" + day;
        if (data.work.todaySec + grow >= cfg.workHours * 3600 && !done[key]) {
          done[key] = true;
          showText("Работа", "Уже " + cfg.workHours + " ч за день", BLUE);
        }
      }
      if (cfg.breakMinutes > 0 && data.work.active) {
        // One reminder per full break interval of continuous work.
        const n = Math.floor((data.work.sessionSec + grow) / (cfg.breakMinutes * 60));
        const key = "break|" + day + "|" + n;
        if (n >= 1 && !done[key]) {
          done[key] = true;
          showText("Перерыв", "Уже " + n * cfg.breakMinutes + " мин за Mac, пора размяться", AMBER);
        }
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

  /** Steps through the visible screens by `delta`. */
  const step = (ctx: Ctx, delta: number): void => {
    const list = visible(ctx);
    let i = 0;
    list.forEach((s, k) => {
      if (s.id === current) i = k;
    });
    const next = list[(i + delta + list.length) % list.length];
    if (next.id !== current) {
      current = next.id;
      views[current] = 0;
    }
  };

  const frame = (): void => {
    if (!cfg || stopped) return;
    const now = Date.now();
    if (now >= refreshAt && !drawing) {
      refreshAt = now + REFRESH_MS;
      Object.keys(sent).forEach((id) => delete sent[id]);
    }
    let ctx = makeCtx(now);
    localAlerts(ctx);

    const list = enabled.length > 0 ? visible(ctx) : [];
    // The current screen can vanish (it became empty, or was switched off): move on to the first visible one.
    if (list.length > 0 && !list.some((s) => s.id === current)) {
      current = list[0].id;
      ctx = makeCtx(now);
    }
    // Automatic rotation, held back for a while after the wheel was used.
    if (cfg.rotateSeconds > 0 && list.length > 1 && now - lastInputAt > ROTATE_HOLD_MS && now >= rotateAt) {
      rotateAt = now + cfg.rotateSeconds * 1000;
      step(ctx, 1);
      ctx = makeCtx(now);
    }

    let els: El[];
    let led: string | undefined;
    if (banner && now < banner.until) {
      els = banner.els;
      led = banner.led;
      // The LED blinks once, with the first frame of the banner.
      if (banner.led) banner.led = undefined;
    } else if (list.length === 0) {
      els = [label("n.t", "Нет экранов", 4, { color: DIM })];
    } else if (now < flashUntil) {
      let n = 0;
      list.forEach((s, k) => {
        if (s.id === current) n = k + 1;
      });
      els = [label("f.t", byId(current).title, 0, { color: WHITE, scroll_rate: 0 }), label("f.n", n + " / " + list.length, 8, { color: DIM, scroll_rate: 0 })];
    } else if (!online && data.rev === 0) {
      els = [label("o.t", "Mac не отвечает", 0, { color: RED, scroll_rate: 0 }), label("o.d", cfg.host, 8, { color: DIM, scroll_rate: 0 })];
    } else {
      els = byId(current).elements(ctx);
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
    if (!cfg) return;
    const now = Date.now();
    if (event.key === "encoder") {
      lastInputAt = now;
      const ctx = makeCtx(now);
      if (visible(ctx).length > 1) {
        step(ctx, event.delta > 0 ? 1 : -1);
        flashUntil = now + FLASH_MS;
        banner = null;
        frame();
      }
    } else if (event.key === "ok" && event.action === "short") {
      // OK steps through the sub-views of the current screen (Claude: window / day and week, ...).
      lastInputAt = now;
      const screen = byId(current);
      const count = screen.views ? screen.views(makeCtx(now)) : 1;
      if (count > 1) {
        views[current] = ((views[current] || 0) + 1) % count;
        banner = null;
        frame();
      }
    }
  });

  loadConfig()
    .then((c) => {
      cfg = c;
      enabled = ALL.filter((s) => c.screens[s.id]);
      if (enabled.length > 0) current = enabled[0].id;
      rotateAt = Date.now() + c.rotateSeconds * 1000;
      tickTimer = setInterval(frame, TICK_MS) as unknown as number;
      frame();
      poll();
    })
    .catch(report);
}

main();
