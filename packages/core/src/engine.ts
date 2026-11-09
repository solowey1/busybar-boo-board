import { device } from "../../../shared/device";
import { fetchState } from "./agent";
import { aiPages, orderedAgents } from "./agents";
import { loadConfig, mergeSettings } from "./config";
import type { AgentAlert, AgentState, Config, Ctx, El, Screen, ScreenId } from "./types";
import { DIM, RED, WHITE, label, rgba, status, tr } from "./util";

/** The name the app draws under (its id); the device clears elements by it. Set by `run`. */
let APP = "";
/** The screens this app has: all five in the combined app, one in each module. Set by `run`. */
let ALL: Screen[] = [];
// A request to the computer is held there for up to this long while nothing changes, so news arrives at once.
const POLL_WAIT_MS = 2000;
const POLL_OFFLINE_MS = 10000;
// Three times a second: the mascots and the flashes move on; unchanged elements are not sent again.
const TICK_MS = 333;
const ALERT_MS = 9000;
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
  /** false: only the sound and the LED, the screen stays as it is */
  overlay?: boolean;
}

/** True when two elements say the same thing: they hold only strings and numbers, so a shallow look is enough. */
function sameEl(a: El | undefined, b: El): boolean {
  if (!a) return false;
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof El)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (let i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false;
  return true;
}

const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

/** Position (1-based) of an agent in the list. */
const agentIndex = (list: { id: string }[], id: string): number => {
  let n = 1;
  list.forEach((a, i) => {
    if (a.id === id) n = i + 1;
  });
  return n;
};

const byId = (id: ScreenId): Screen => ALL.filter((s) => s.id === id)[0];

/** A screen that fails must not blank the bar: the failure is logged once and the frame stays empty. */
let lastFailure = "";
function draw(s: Screen, ctx: Ctx): El[] {
  try {
    return s.elements(ctx);
  } catch (err) {
    const text = s.id + ": " + (err instanceof Error ? err.message : String(err));
    if (text !== lastFailure) report(text);
    lastFailure = text;
    return [];
  }
}

/** Alerts about an AI finishing: "claude_done", "ai_wait", ... */
const isAi = (kind: string): boolean => kind.indexOf("claude") === 0 || kind.indexOf("ai") === 0;

/** The screens that have news of their own; the music screen has none. */
type Group = "ai" | "servers" | "calendar" | "work";

/** Whose news this is: what no screen claims (a plain notice) is told like the work screen's. */
const groupOf = (kind: string): Group => (isAi(kind) ? "ai" : kind.indexOf("server") === 0 ? "servers" : kind.indexOf("calendar") === 0 ? "calendar" : "work");

/** How a screen's news is told besides the text: with a sound, with the LED in the screen's alert colour. Each is a setting of the screen. */
function tell(cfg: Config, g: Group): { sound: boolean; led?: string } {
  return { sound: cfg.s[`${g}AlertSound` as const], led: cfg.s[`${g}AlertLed` as const] ? rgba(cfg.s[`${g}AlertColor` as const]) : undefined };
}

/** The colour of a piece of news on the screen (the LED has its own, see `tell`). */
function alertColor(cfg: Config, kind: string): string {
  if (kind.indexOf("down") >= 0) return RED;
  if (isAi(kind)) return rgba(cfg.s.aiColor);
  if (kind.indexOf("calendar") === 0) return rgba(cfg.s.calendarColor);
  if (kind.indexOf("up") >= 0) return rgba(cfg.s.serversColor);
  return rgba(cfg.s.workColor);
}

function alertHeader(cfg: Config, kind: string): string {
  if (isAi(kind)) return tr(cfg, "ai");
  if (kind.indexOf("server") === 0) return tr(cfg, "server");
  if (kind.indexOf("calendar") === 0) return tr(cfg, "meeting");
  if (kind.indexOf("work") === 0) return tr(cfg, "work");
  return tr(cfg, "notice");
}

/** An element that shows nothing, of the same type and under the same id: what takes the place of one that goes away. */
function blank(el: El | undefined): El | null {
  if (!el) return null;
  const base = { id: el.id, x: 0, y: 0, align: "top_left", display: "front" };
  if (el.type === "xpmbitmap") return { ...base, type: "xpmbitmap", data: "! XPM2\n1 1 1 1\n. c none\n." };
  if (el.type === "text") return { ...base, type: "text", text: " ", font: el.font, color: "#00000000", scroll_rate: 0 };
  if (el.type === "rectangle") return { ...base, type: "rectangle", width: 1, height: 1, fill: "solid", fill_colors: ["#00000000"], border_width: 0 };
  return null;
}

/**
 * Runs an app made of these screens. The combined app has all of them and the wheel goes round; a module has one, and
 * handles only the news that belongs to it (a servers module does not show that a meeting is near).
 */
export function run(appId: string, screens: Screen[]): void {
  APP = appId;
  ALL = screens;
  main();
}

const has = (id: ScreenId): boolean => ALL.some((s) => s.id === id);

function main(): void {
  let cfg: Config | null = null;
  let enabled: Screen[] = [];
  let current: ScreenId = "music";
  const views: Record<string, number> = {};
  /** The Play / Pause counter of each screen (the calendar: which meeting). */
  const extras: Record<string, number> = {};
  let data: AgentState = { rev: 0, alerts: [] };
  let recvAt = Date.now();
  let online = false;
  let lastAlertId = 0;
  let gotFirst = false;
  let banner: Banner | null = null;
  let flashUntil = 0;
  let danceUntil = 0;
  let claudeDone: { until: number; head: string; text: string; other: boolean } | null = null;
  let settingsRev = -1;
  /** The first picture of a run clears the display; `resendAll` sends everything again without clearing (see `sync`). */
  let needClear = true;
  /** True once the computer has answered or failed to, for the first time. */
  let asked = false;
  let resendAll = false;
  let lastInputAt = 0;
  let rotateAt = 0;
  let stopped = false;
  let drawing = false;
  let polling = false;
  let refreshAt = Date.now() + REFRESH_MS;
  /** What is on the display now, by element id; the objects themselves, so nothing is copied. */
  const sent: Record<string, El> = {};
  const done: Record<string, boolean> = {};
  /** The screen drawn last; when it changes the old one may let go of its buffers. */
  let shown: ScreenId | null = null;
  let pollTimer: number | undefined;
  let tickTimer: number | undefined;

  const isOn = (s: Screen, c: Config): boolean => c.screens[s.id];

  /** The screens that are on, in the order of the settings page. */
  const chosen = (c: Config): Screen[] => {
    const order = c.s.appOrder.split(",");
    const rank = (s: Screen): number => {
      const i = order.indexOf(s.id);
      return i < 0 ? order.length : i;
    };
    return ALL.filter((s) => isOn(s, c)).sort((a, b) => rank(a) - rank(b));
  };

  const wantedParts = (c: Config): string[] => {
    const ids: string[] = [];
    ALL.forEach((s) => {
      if (isOn(s, c)) ids.push(s.id);
    });
    if (has("claude") && c.screens.claude && ids.indexOf("agents") < 0) ids.push("agents");
    if (has("calendar") && ids.indexOf("calendar") < 0) ids.push("calendar");
    if (has("work") && ids.indexOf("work") < 0) ids.push("work");
    // "meta" says when the settings page saved something, so the app reads its settings again.
    return ids.concat(["meta"]);
  };

  const makeCtx = (now: number): Ctx => ({ cfg: cfg as Config, data, at: now, recvAt, online, view: views[current] || 0, extra: extras[current] || 0, danceUntil, done: claudeDone });

  /** The screens the wheel goes through: the enabled ones, minus the empty ones when that is asked for. */
  const visible = (ctx: Ctx): Screen[] => {
    const list = enabled.filter((s) => !(ctx.cfg.s.appHideEmpty && s.isEmpty && s.isEmpty({ ...ctx, view: 0 })));
    return list.length > 0 ? list : enabled;
  };

  const play = (path: string): void => {
    fetch("http://localhost/api/audio/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_name: APP, stock_path: path }),
    }).catch(report);
  };

  /** Shows a banner over everything; with a screen's name `g` it is news, told with a sound and the LED as that screen's settings say. */
  const show = (els: El[], ms: number, g?: Group, sound?: string): void => {
    const t = cfg && g ? tell(cfg, g) : null;
    banner = { until: Date.now() + ms, els, led: t ? t.led : undefined };
    if (t && t.sound && sound) play(sound);
  };

  const showText = (header: string, text: string, color: string, g: Group): void => {
    show([label("a.h", header, 0, { color, scroll_rate: 0 }), label("a.t", text, 8, { color: WHITE, scroll_rate: 1500 })], ALERT_MS, g, SOUND_REMINDER);
  };

  /** Whether this app has the screen that the news belongs to: a module shows only its own. */
  const handles = (kind: string): boolean => (isAi(kind) ? has("claude") : kind.indexOf("server") === 0 ? has("servers") : kind.indexOf("calendar") === 0 ? has("calendar") : kind.indexOf("work") === 0 ? has("work") : true);

  const showAlert = (a: AgentAlert): void => {
    const now = Date.now();
    if (!cfg || !handles(a.kind)) return;
    if (isAi(a.kind)) {
      const wait = a.kind.indexOf("wait") >= 0;
      const text = a.text.replace(/^(Готово|Done):\s*/, "");
      const onAi = current === "claude";
      const t = tell(cfg, "ai");
      const withMascot = cfg.s.aiMascot !== "none";
      if (withMascot && (onAi || !cfg.s.aiOverlay)) {
        // The news appears beside the happy mascot on the AI screen, and the figures wait. Away from it, with
        // overlaying off, only the sound and the LED tell, and the news waits a minute for a look at the screen.
        claudeDone = { until: now + (onAi ? ALERT_MS : 60000), head: wait ? tr(cfg, "waiting") : tr(cfg, "done"), text: text || tr(cfg, "ai"), other: a.kind.indexOf("claude") !== 0 };
        banner = { until: now + ALERT_MS, els: [], led: t.led, overlay: false };
        if (t.sound) play(SOUND_REMINDER);
        return;
      }
      if (!onAi && !cfg.s.aiOverlay) {
        banner = { until: now + ALERT_MS, els: [], led: t.led, overlay: false };
        if (t.sound) play(SOUND_REMINDER);
        return;
      }
      // A banner tells it, and the mascot dances once the banner is gone.
      danceUntil = now + ALERT_MS + 8000;
    }
    showText(alertHeader(cfg, a.kind), a.text, alertColor(cfg, a.kind), groupOf(a.kind));
  };

  /** Pop-ups that the bar works out itself from the data it already has. */
  const localAlerts = (ctx: Ctx): void => {
    if (!cfg) return;
    const nowS = Math.floor(ctx.at / 1000);
    const e = data.calendar && data.calendar.ok ? data.calendar.events[0] : undefined;
    if (e && cfg.s.calendarMinutes > 0) {
      const startAt = Math.floor(recvAt / 1000) + e.startIn;
      const remaining = startAt - nowS;
      const key = e.title + "|" + startAt;
      // 0: N minutes before, 1: one minute before, 2: at the start.
      const stage = remaining <= 0 && remaining > -60 ? 2 : remaining <= 60 && remaining > 0 ? 1 : remaining <= cfg.s.calendarMinutes * 60 && remaining > 0 ? 0 : -1;
      if (stage >= 0 && !done[key + "#" + stage]) {
        done[key + "#" + stage] = true;
        const cal = ALL.filter((s) => s.id === "calendar")[0];
        if (cal) show(cal.elements({ ...ctx, view: 0 }), ALERT_MS, "calendar", stage === 2 ? SOUND_START : SOUND_REMINDER);
      }
    }
    if (data.work) {
      const grow = data.work.active ? Math.floor((ctx.at - recvAt) / 1000) : 0;
      const day = new Date(ctx.at).toDateString();
      if (cfg.s.workHours > 0) {
        const key = "work|" + day;
        if (data.work.todaySec + grow >= cfg.s.workHours * 3600 && !done[key]) {
          done[key] = true;
          showText(tr(cfg, "work"), tr(cfg, "workGoal", cfg.s.workHours), rgba(cfg.s.workColor), "work");
        }
      }
      if (cfg.s.workBreakMinutes > 0 && data.work.active) {
        // One reminder per full break interval of continuous work.
        const n = Math.floor((data.work.sessionSec + grow) / (cfg.s.workBreakMinutes * 60));
        const key = "break|" + day + "|" + n;
        if (n >= 1 && !done[key]) {
          done[key] = true;
          showText(tr(cfg, "breakTitle"), tr(cfg, "breakNow", n * cfg.s.workBreakMinutes), rgba(cfg.s.workColor), "work");
        }
      }
    }
  };

  /**
   * Sends only what changed since the last frame. What disappeared is not cleared first: the firmware shows its own "Loading"
   * whenever an app has nothing on the display, so a clear followed by a draw is a visible flash. Instead the elements that
   * go are replaced, in the same request that draws the new ones, by empty ones of the same type, and cleared afterwards,
   * when nothing can be seen of them any more. (An element cannot change its type under one id, hence "of the same type".)
   */
  const sync = async (els: El[], led?: string): Promise<void> => {
    if (drawing) return;
    drawing = true;
    try {
      // The very first picture of a run starts from a blank screen, in case something of an earlier run is still up.
      if (needClear) {
        await device.DisplayClear({ application_name: APP } as never);
        Object.keys(sent).forEach((id) => delete sent[id]);
        needClear = false;
      }
      // After a failure, or every minute, everything is sent again, over what is there.
      if (resendAll) {
        Object.keys(sent).forEach((id) => delete sent[id]);
        resendAll = false;
      }
      const changed: El[] = [];
      const ids: Record<string, boolean> = {};
      els.forEach((el) => {
        ids[el.id] = true;
        if (!sameEl(sent[el.id], el)) changed.push(el);
      });
      const gone = Object.keys(sent).filter((id) => !ids[id]);
      const blanked: El[] = [];
      gone.forEach((id) => {
        const b = blank(sent[id]);
        if (b) blanked.push(b);
      });
      if (changed.length > 0 || blanked.length > 0) {
        const body: Record<string, unknown> = { application_name: APP, priority: 50, elements: changed.concat(blanked) };
        if (led) body.led_notification_color = led;
        await device.DisplayDraw(body as never);
        changed.forEach((el) => {
          sent[el.id] = el;
        });
      }
      if (gone.length > 0) {
        await device.DisplayClear({ application_name: APP, element_ids: gone } as never);
        gone.forEach((id) => delete sent[id]);
      }
    } catch (err) {
      resendAll = true;
      throw err;
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

  const frame = (): Promise<void> => {
    if (!cfg || stopped) return Promise.resolve();
    // A picture is still on its way to the display: wait for it rather than draw one that cannot be sent (a moving screen counts its steps by pictures).
    if (drawing) return Promise.resolve();
    const now = Date.now();
    if (now >= refreshAt && !drawing) {
      refreshAt = now + REFRESH_MS;
      resendAll = true;
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
    if (cfg.s.appRotateSeconds > 0 && list.length > 1 && now - lastInputAt > ROTATE_HOLD_MS && now >= rotateAt) {
      rotateAt = now + cfg.s.appRotateSeconds * 1000;
      step(ctx, 1);
      ctx = makeCtx(now);
    }

    let els: El[];
    let led: string | undefined;
    if (banner && now < banner.until && banner.overlay === false) {
      // Sound and LED only: the screen itself shows the news.
      led = banner.led;
      banner.led = undefined;
      els = draw(byId(current), ctx);
    } else if (banner && now < banner.until) {
      els = banner.els;
      led = banner.led;
      // The LED blinks once, with the first frame of the banner.
      if (banner.led) banner.led = undefined;
    } else if (list.length === 0) {
      els = [label("n.t", tr(cfg, "noScreens"), 4, { color: DIM, align: "top_mid", x: 36, width: undefined, scroll_rate: 0 })];
    } else if (now < flashUntil) {
      let n = 0;
      list.forEach((s, k) => {
        if (s.id === current) n = k + 1;
      });
      els = status("f", byId(current).title(cfg), n + " / " + list.length);
    } else if (!online && data.rev === 0 && !asked) {
      // The first answer from the computer has not come yet: nothing is shown, the bar's own "Loading" is true enough.
      els = [];
    } else if (!online && data.rev === 0) {
      els = status("o", tr(cfg, "hostDown"), cfg.host, RED);
    } else {
      els = draw(byId(current), ctx);
    }
    if (shown !== current) {
      const old = shown === null ? undefined : byId(shown);
      if (old && old.leave) old.leave();
      shown = current;
    }
    return sync(els, led).catch(report);
  };

  /** Draws a frame and schedules the next one: busy screens (the mascot's pulse) ask for a faster beat. */
  /** Which run of the drawing loop is current: a key press starts a new one, and the old one ends at its next turn. */
  let loop = 0;
  const tick = (): void => {
    if (stopped) return;
    const mine = loop;
    const began = Date.now();
    let drawn: Promise<void>;
    try {
      drawn = frame();
    } catch (err) {
      report(err);
      drawn = Promise.resolve();
    }
    // The next picture is asked for when this one has gone out, so a slow bar is never flooded.
    drawn.then(() => {
      if (stopped || mine !== loop) return;
      let wait = TICK_MS;
      if (cfg) {
        const s = byId(current);
        if (s && s.tickMs) wait = s.tickMs(makeCtx(Date.now()));
      }
      const left = wait - (Date.now() - began);
      tickTimer = setTimeout(tick, left > 0 ? left : 0) as unknown as number;
    });
  };

  /** A key was pressed: draw at once and go on at the screen's own pace (a moving screen asks for a fast one). */
  const kick = (): void => {
    if (stopped) return;
    loop++;
    if (tickTimer !== undefined) clearTimeout(tickTimer);
    tick();
  };

  const poll = (): void => {
    if (stopped || !cfg || polling) return;
    polling = true;
    const c = cfg;
    fetchState(c, APP, data.rev, wantedParts(c), POLL_WAIT_MS)
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
        // The screens' settings come with every answer from the computer.
        if (cfg && next.meta && next.meta.settings) {
          cfg = { ...cfg, s: mergeSettings(cfg.s, next.meta.settings) };
          enabled = chosen(cfg as Config);
        }
        // The settings page on the computer saved the bar's own settings: read them again.
        const rev = next.meta ? next.meta.settingsRev : 0;
        if (settingsRev >= 0 && rev !== settingsRev) reload();
        settingsRev = rev;
      })
      .catch((err) => {
        if (online) report(err);
        online = false;
      })
      .then(() => {
        asked = true;
        polling = false;
        if (!stopped) pollTimer = setTimeout(poll, online ? 30 : POLL_OFFLINE_MS) as unknown as number;
      });
  };

  /** Asks the agent to do something on the computer, then fetches the state at once. */
  const control = (action: string): void => {
    if (!cfg) return;
    fetch(`http://${cfg.host}:${cfg.port}/control`, { method: "POST", body: JSON.stringify({ action }) })
      .then(() => {
        if (pollTimer !== undefined) clearTimeout(pollTimer);
        pollTimer = setTimeout(poll, 600) as unknown as number;
      })
      .catch(report);
  };

  const quit = (unbind: () => void): void => {
    stopped = true;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    if (tickTimer !== undefined) clearTimeout(tickTimer);
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
        // The screen's name stays for a moment, unless the setting says 0.
        flashUntil = cfg.s.appFlashMs > 0 ? now + cfg.s.appFlashMs : 0;
        banner = null;
        kick();
      }
    } else if (event.key === "ok" && event.action === "short") {
      // OK steps through the sub-views of the current screen (Claude: window / day and week, ...).
      lastInputAt = now;
      const screen = byId(current);
      const count = screen.views ? screen.views(makeCtx(now)) : 1;
      if (count > 1) {
        views[current] = ((views[current] || 0) + 1) % count;
        // A new state starts afresh: no details, the first meeting.
        extras[current] = 0;
        banner = null;
        // The agents screen goes round the agents and ends with the mascot; with several agents the name is shown.
        if (current === "claude") {
          const agents = data.agents ? data.agents.list : [];
          const pages = aiPages(cfg, agents);
          const page = views[current];
          if (page < pages.agents && agents.length > 1) {
            const shownAgent = orderedAgents(cfg, agents)[page];
            show(status("p", shownAgent.name, agentIndex(agents, shownAgent.id) + " / " + agents.length), 900);
          }
        }
        kick();
      }
    } else if (event.key === "start" && event.action === "short") {
      // The big central button (Start / Pause) is for a screen's extra functions: on the music screen it plays or pauses
      // (if the setting is on), on the servers screen it walks through the details of the servers, on the calendar it shows the next meeting.
      // (The wheel changes the screen, OK changes the state of a screen.)
      lastInputAt = now;
      if (current === "music" && cfg.s.musicStartToggle) {
        // The computer does it; the new state comes with the next poll.
        control("toggle-play-pause");
      } else if (byId(current).start) {
        // An extra function of the screen (the calendar: the next meeting).
        const r = (byId(current).start as (c: Ctx) => { view?: number; extra?: number })(makeCtx(now));
        if (r.view !== undefined) views[current] = r.view;
        if (r.extra !== undefined) extras[current] = r.extra;
        banner = null;
        kick();
      }
    }
  });

  const apply = (c: Config): void => {
    cfg = c;
    enabled = chosen(c);
    rotateAt = Date.now() + c.s.appRotateSeconds * 1000;
    resendAll = true;
  };

  function reload(): void {
    loadConfig(APP)
      .then((c) => {
        const same = cfg !== null && cfg.host === c.host && cfg.port === c.port;
        // The screens' settings are not the bar's own: they stay as the computer last sent them.
        if (cfg) c.s = cfg.s;
        apply(c);
        if (!same) data = { rev: 0, alerts: [] };
        if (!enabled.some((s) => s.id === current) && enabled.length > 0) current = enabled[0].id;
      })
      .catch(report);
  }

  loadConfig(APP)
    .then((c) => {
      apply(c);
      if (enabled.length > 0) current = enabled[0].id;
      tick();
      poll();
    })
    .catch(report);
}
