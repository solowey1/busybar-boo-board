import { execFile } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SWIFT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "swift");
const SRC = join(SWIFT_DIR, "events.swift");
const PLIST = join(SWIFT_DIR, "Info.plist");
const BIN = join(homedir(), ".cache", "busybar-status", "events");

const run = (file, args, timeout) =>
  new Promise((resolve, reject) => execFile(file, args, { timeout, maxBuffer: 1 << 20 }, (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(out))));

/** Compiles the EventKit helper when missing or older than its source. */
async function ensureBinary() {
  if (existsSync(BIN) && statSync(BIN).mtimeMs > Math.max(statSync(SRC).mtimeMs, statSync(PLIST).mtimeMs)) return;
  mkdirSync(dirname(BIN), { recursive: true });
  // The embedded Info.plist carries the usage text macOS shows in the calendar permission prompt.
  await run("/usr/bin/swiftc", ["-O", "-o", BIN, SRC, "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", PLIST], 180_000);
}

/** Local midnight of the day `n` days after `base` (a Date); right across a change of clocks. */
const addDays = (base, n) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};

/**
 * Events that the bar should show: the next few with titles trimmed, and the grid of five weeks from this
 * week's Monday with the number of meetings on each day (those that are over count too).
 */
export function toCalendar(events, { now = Date.now(), exclude = [] } = {}) {
  const nowS = Math.floor(now / 1000);
  const kept = events.filter((e) => !exclude.includes(e.calendar));
  const list = kept
    .filter((e) => e.end > nowS)
    .slice(0, 3)
    // startIn/endIn are relative: the bar adds them to its own clock.
    .map((e) => ({ title: String(e.title).slice(0, 60), startIn: e.start - nowS, endIn: e.end - nowS }));

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const wd = (today.getDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -wd);
  const days = Array.from({ length: 35 }, (_, i) => Math.floor(addDays(monday, i).getTime() / 1000));
  const counts = days.map((from, i) => {
    const to = i === 34 ? Math.floor(addDays(monday, 35).getTime() / 1000) : days[i + 1];
    return kept.filter((e) => e.start >= from && e.start < to).length;
  });
  return { events: list, sentAt: nowS, grid: { counts, today: wd, wd, d: today.getDate(), m: today.getMonth() } };
}

/** Publishes a list of events when it changed; the bar counts down from its own clock. */
function publish(hub, events, exclude) {
  const part = toCalendar(events, { exclude });
  // startIn changes every minute; publish whenever the event list (not the clock) changes.
  const key = JSON.stringify(part.grid) + JSON.stringify(part.events.map((e) => [e.title, e.startIn + part.sentAt, e.endIn + part.sentAt].map((v) => (typeof v === "number" ? Math.round(v / 30) : v))));
  if (key !== publish.lastKey) {
    publish.lastKey = key;
    hub.set("calendar", { ...part, ok: true });
  }
}

/**
 * Two ways to get events. When the menu-bar app runs the agent (BUSYBAR_TRAY=1) it reads the calendar
 * itself, so macOS asks for access once, for that app, and posts the events through `feed`.
 * Otherwise the agent runs the EventKit helper itself.
 */
export function startCalendar({ hub, log, getExclude = () => [], intervalMs = 60_000, viaTray = process.env.BUSYBAR_TRAY === "1" }) {
  let ready = false;
  let failed = false;
  let last = []; // the latest events from the feed, so a changed exclude list applies at once
  const tick = async () => {
    try {
      if (!ready) {
        await ensureBinary();
        ready = true;
      }
      const events = JSON.parse(await run(BIN, ["840"], 70_000));
      failed = false;
      publish(hub, events, getExclude());
    } catch (err) {
      if (!failed) log(`calendar: ${String(err.message).trim()}`);
      failed = true;
      hub.set("calendar", { events: [], ok: false });
    }
  };
  // Calendars are read through EventKit, which only macOS has.
  const supported = platform() === "darwin";
  if (viaTray || !supported) {
    hub.set("calendar", { events: [], ok: false, reason: supported ? "" : "unsupported" });
  } else {
    void tick();
  }
  const timer = viaTray || !supported ? null : setInterval(() => void tick(), intervalMs);
  return {
    stop: () => timer && clearInterval(timer),
    /** {ok:true, events:[{title,start,end,calendar}]} or {ok:false, reason} */
    feed(body) {
      if (body?.ok && Array.isArray(body.events)) {
        last = body.events;
        publish(hub, last, getExclude());
      } else {
        hub.set("calendar", { events: [], ok: false, reason: String(body?.reason ?? "") });
      }
    },
    refresh: () => (viaTray ? publish(hub, last, getExclude()) : supported ? void tick() : undefined),
  };
}
