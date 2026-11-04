import { execFile } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
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

/** Events that the bar should show: only the next few, titles trimmed. */
export function toCalendar(events, { now = Date.now(), exclude = [] } = {}) {
  const nowS = Math.floor(now / 1000);
  const list = events
    .filter((e) => !exclude.includes(e.calendar) && e.end > nowS)
    .slice(0, 3)
    // startIn/endIn are relative: the bar adds them to its own clock.
    .map((e) => ({ title: String(e.title).slice(0, 60), startIn: e.start - nowS, endIn: e.end - nowS }));
  return { events: list, sentAt: nowS };
}

export function startCalendar({ hub, log, exclude = [], intervalMs = 60_000 }) {
  let ready = false;
  let failed = false;
  const tick = async () => {
    try {
      if (!ready) {
        await ensureBinary();
        ready = true;
      }
      const events = JSON.parse(await run(BIN, ["24"], 70_000));
      failed = false;
      const part = toCalendar(events, { exclude });
      // startIn changes every minute; publish whenever the event list (not the clock) changes.
      const key = JSON.stringify(part.events.map((e) => [e.title, e.startIn + part.sentAt, e.endIn + part.sentAt].map((v) => (typeof v === "number" ? Math.round(v / 30) : v))));
      if (key !== tick.lastKey) {
        tick.lastKey = key;
        hub.set("calendar", { ...part, ok: true });
      }
    } catch (err) {
      if (!failed) log(`calendar: ${String(err.message).trim()}`);
      failed = true;
      hub.set("calendar", { events: [], ok: false });
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(timer);
}
