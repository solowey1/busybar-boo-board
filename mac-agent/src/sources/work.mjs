import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import { STATE_DIR } from "../config.mjs";

const FILE = join(STATE_DIR, "work.json");
export const IDLE_LIMIT_S = 180; // default: no input for this long = not working
export const SAMPLE_S = 15;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const run = (file, args) =>
  new Promise((resolve) => execFile(file, args, { timeout: 5000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))));

// Windows: the time of the last input, from the system, through PowerShell.
const WINDOWS_IDLE = `Add-Type @'
using System; using System.Runtime.InteropServices;
public class Idle {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  public static double Seconds() { var i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return (Environment.TickCount - (int)i.dwTime) / 1000.0; }
}
'@
[Idle]::Seconds()`;

/** Seconds since the last keyboard/mouse event, or null when the system cannot tell. */
export async function readIdleSeconds() {
  const os = platform();
  if (os === "darwin") {
    // HIDIdleTime, in nanoseconds.
    const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec((await run("/usr/sbin/ioreg", ["-c", "IOHIDSystem", "-d", "4"])) ?? "");
    return m ? Number(m[1]) / 1e9 : null;
  }
  if (os === "win32") {
    const n = parseFloat((await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_IDLE])) ?? "");
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  // Linux: xprintidle (X11), else GNOME's idle monitor (Wayland); in milliseconds.
  const x = parseInt((await run("xprintidle", [])) ?? "", 10);
  if (Number.isFinite(x)) return x / 1000;
  const g = /uint64 (\d+)/.exec((await run("gdbus", ["call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", "--object-path", "/org/gnome/Mutter/IdleMonitor/Core", "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"])) ?? "");
  return g ? Number(g[1]) / 1000 : null;
}

/** Pure accounting step: adds one sample to the day record. */
export function addSample(rec, { idle, now, limit = IDLE_LIMIT_S, keepDays = 30 }) {
  const active = idle !== null && idle < limit;
  const day = dayKey(new Date(now));
  // Every finished day's total is kept, so "yesterday" is right even after a gap and the settings page can show a week.
  const days = { ...(rec.days ?? {}) };
  if (rec.day && rec.day !== day) days[rec.day] = rec.activeSec;
  const keep = Object.keys(days).sort().slice(-keepDays);
  Object.keys(days).forEach((k) => keep.includes(k) || delete days[k]);
  const yesterday = dayKey(new Date(now - 86_400_000));
  const next = rec.day === day ? { ...rec } : { day, activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0 };
  next.days = days;
  next.yesterdaySec = days[yesterday] ?? 0;
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

/** The last 34 finished days, oldest first, as seconds: the bar draws them as an activity grid. */
export function recent(rec, now = Date.now(), n = 34) {
  const out = [];
  for (let i = n; i >= 1; i--) out.push(rec.days?.[dayKey(new Date(now - i * 86_400_000))] ?? 0);
  return out;
}

export function startWork({ hub, log, getLimit = () => IDLE_LIMIT_S, getKeepDays = () => 30 }) {
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
    rec = addSample(rec, { idle: await readIdleSeconds(), now, limit: getLimit(), keepDays: getKeepDays() });
    try {
      writeFileSync(FILE, JSON.stringify(rec));
    } catch (err) {
      log(`work: ${err.message}`);
    }
    // The bar counts seconds itself while `active`; re-base on a flip or every 5 minutes.
    if (rec.active !== lastActive || now - lastPublished > 300_000) {
      lastActive = rec.active;
      lastPublished = now;
      hub.set("work", { active: rec.active, todaySec: rec.activeSec, sessionSec: rec.sessionSec, yesterdaySec: rec.yesterdaySec ?? 0, recent: recent(rec, now), since: rec.firstAt ? Math.floor(rec.firstAt / 1000) : 0, sentAt: Math.floor(now / 1000) });
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), SAMPLE_S * 1000);
  // The settings page shows the last days; today is the live total.
  return { stop: () => clearInterval(timer), history: () => ({ ...(rec.days ?? {}), [rec.day]: rec.activeSec }) };
}
