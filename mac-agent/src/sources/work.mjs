import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "../config.mjs";

const FILE = join(STATE_DIR, "work.json");
export const IDLE_LIMIT_S = 180; // no input for this long = not working
export const SAMPLE_S = 15;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Seconds since the last keyboard/mouse event (HIDIdleTime, nanoseconds). */
export function readIdleSeconds() {
  return new Promise((resolve) => {
    execFile("/usr/sbin/ioreg", ["-c", "IOHIDSystem", "-d", "4"], { timeout: 5000 }, (err, out) => {
      const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(out ?? "");
      resolve(err || !m ? null : Number(m[1]) / 1e9);
    });
  });
}

/** Pure accounting step: adds one sample to the day record. */
export function addSample(rec, { idle, now }) {
  const active = idle !== null && idle < IDLE_LIMIT_S;
  const day = dayKey(new Date(now));
  // A new day starts from zero; if the old record was from the day before, its total becomes "yesterday".
  const yesterday = dayKey(new Date(now - 86_400_000));
  const next = rec.day === day ? { ...rec } : { day, activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0, yesterdaySec: rec.day === yesterday ? rec.activeSec : 0 };
  if (active) {
    // A pause longer than 5 minutes starts a new continuous session.
    if (next.lastActiveAt && now - next.lastActiveAt > 300_000) next.sessionSec = 0;
    next.activeSec += SAMPLE_S;
    next.sessionSec += SAMPLE_S;
    next.lastActiveAt = now;
    if (!next.firstAt) next.firstAt = now;
  }
  next.active = active;
  return next;
}

export function startWork({ hub, log }) {
  mkdirSync(STATE_DIR, { recursive: true });
  let rec = { day: "", activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0, active: false };
  try {
    rec = { ...rec, ...JSON.parse(readFileSync(FILE, "utf8")) };
  } catch {
    /* first run */
  }
  let lastPublished = 0;
  let lastActive = null;

  const tick = async () => {
    const now = Date.now();
    rec = addSample(rec, { idle: await readIdleSeconds(), now });
    try {
      writeFileSync(FILE, JSON.stringify(rec));
    } catch (err) {
      log(`work: ${err.message}`);
    }
    // The bar counts seconds itself while `active`; re-base on a flip or every 5 minutes.
    if (rec.active !== lastActive || now - lastPublished > 300_000) {
      lastActive = rec.active;
      lastPublished = now;
      hub.set("work", { active: rec.active, todaySec: rec.activeSec, sessionSec: rec.sessionSec, yesterdaySec: rec.yesterdaySec ?? 0, since: rec.firstAt ? Math.floor(rec.firstAt / 1000) : 0, sentAt: Math.floor(now / 1000) });
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), SAMPLE_S * 1000);
  return () => clearInterval(timer);
}
