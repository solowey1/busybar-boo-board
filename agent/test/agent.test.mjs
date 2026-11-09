import { test } from "node:test";
import assert from "node:assert/strict";
import { Hub } from "../src/hub.mjs";
import { createApi } from "../src/server.mjs";
import { applyMessage, toMusic } from "../src/sources/music.mjs";
import { costOf, parseUsage, summarize } from "../src/sources/claude.mjs";
import { addSample, recent } from "../src/sources/work.mjs";
import { toCalendar } from "../src/sources/calendar.mjs";
import { applyChange, loadConfig, publicConfig, systemLang } from "../src/config.mjs";
import { encodeAnim } from "../tools/anim.mjs";
import { startServers } from "../src/sources/servers.mjs";
import * as barApi from "../src/bar.mjs";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentTracker, classify, cpuSeconds, elapsedSeconds, parsePs } from "../src/sources/agents.mjs";
import { GROUPS, defaultSettings, forBar, localizedGroups, sanitizeSettings } from "../src/appsettings.mjs";

test("hub bumps rev only on real change", () => {
  const hub = new Hub();
  const r0 = hub.rev;
  assert.equal(hub.set("a", { x: 1 }), true);
  assert.equal(hub.set("a", { x: 1 }), false);
  assert.equal(hub.rev, r0 + 1);
  hub.alert("k", "t");
  assert.equal(hub.rev, r0 + 2);
  assert.equal(hub.snapshot(["a"]).alerts.length, 1);
});

test("music: diff merge, null removes, position extrapolates while playing", () => {
  let s = applyMessage({}, { diff: false, payload: { title: "T", artist: "A", playing: true, durationMicros: 200e6, elapsedTimeMicros: 10e6, timestampEpochMicros: 1_000_000 * 1000, playbackRate: 1 } });
  s = applyMessage(s, { diff: true, payload: { artist: null } });
  assert.equal(s.artist, undefined);
  const m = toMusic(s, 1_000_000 * 1000 / 1000 + 5000);
  assert.equal(m.title, "T");
  assert.equal(m.dur, 200);
  assert.equal(m.pos, 15);
  assert.equal(toMusic(applyMessage(s, { diff: true, payload: { playing: false } }), 9e12).pos, 10);
  assert.equal(toMusic({}).active, false);
});

test("claude: parses usage, dedupes ids by caller, groups 5h blocks", () => {
  const line = (t, out, id) => JSON.stringify({ timestamp: t, requestId: "r" + id, message: { id: "m" + id, usage: { input_tokens: 1, output_tokens: out, cache_creation_input_tokens: 10 } } });
  const recs = parseUsage([line("2026-11-04T01:10:00Z", 5, 1), "garbage", line("2026-11-04T02:00:00Z", 7, 2), line("2026-11-03T10:00:00Z", 100, 3)].join("\n"));
  assert.equal(recs.length, 3);
  const now = Date.parse("2026-11-04T03:00:00Z");
  const s = summarize(recs, now);
  assert.equal(s.active, true);
  assert.equal(s.blockTokens, (1 + 5 + 10) + (1 + 7 + 10));
  assert.equal(s.resetIn, 3 * 3600); // block started 01:00, ends 06:00
  assert.equal(summarize(recs, Date.parse("2026-11-04T09:00:00Z")).active, false);
});

test("work: counts active samples, resets on a new day, splits sessions after a long pause", () => {
  const t0 = new Date(2026, 10, 4, 10, 0, 0).getTime();
  let r = addSample({ day: "", activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0 }, { idle: 1, now: t0 });
  r = addSample(r, { idle: 2, now: t0 + 15_000 });
  assert.equal(r.activeSec, 30);
  r = addSample(r, { idle: 999, now: t0 + 30_000 });
  assert.equal(r.activeSec, 30);
  assert.equal(r.active, false);
  r = addSample(r, { idle: 1, now: t0 + 20 * 60_000 });
  assert.equal(r.sessionSec, 15);
  assert.equal(r.activeSec, 45);
  r = addSample(r, { idle: 1, now: t0 + 24 * 3600_000 });
  assert.equal(r.activeSec, 15);
});

test("calendar: relative times, exclusion, past events dropped", () => {
  const now = 1_000_000_000_000;
  const s = Math.floor(now / 1000);
  const c = toCalendar([{ title: "A", start: s + 600, end: s + 1200, calendar: "Work" }, { title: "B", start: s - 100, end: s - 50, calendar: "Work" }, { title: "C", start: s + 60, end: s + 120, calendar: "Skip" }], { now, exclude: ["Skip"] });
  assert.deepEqual(c.events, [{ title: "A", startIn: 600, endIn: 1200 }]);
});

test("api: needs token, answers same:true for the current rev, accepts /notify", async () => {
  const hub = new Hub();
  hub.set("music", { active: true });
  const server = createApi({ hub, app: { getConfig: () => ({ token: "secret", port: 0, trayIcon: "mono", bar: {} }), calendarFeed() {}, activity() {} } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/state`)).status, 401);
    const full = await (await fetch(`${base}/state?s=music&t=secret`)).json();
    assert.equal(full.music.active, true);
    const same = await (await fetch(`${base}/state?s=music&since=${hub.rev}`, { headers: { "X-Token": "secret" } })).json();
    assert.equal(same.same, true);
    const res = await fetch(`${base}/notify`, { method: "POST", headers: { "X-Token": "secret" }, body: JSON.stringify({ kind: "claude_done", text: "ok" }) });
    assert.equal(res.status, 200);
    assert.equal((await (await fetch(`${base}/state?t=secret`)).json()).alerts[0].kind, "claude_done");
  } finally {
    server.close();
  }
});

test("claude: cost follows the model's prices, cache reads are cheap and cache writes cost 1.25x", () => {
  // 1M input + 1M output on the Sonnet price list: 2 + 10.
  assert.equal(costOf("claude-sonnet-5-5", { input_tokens: 1e6, output_tokens: 1e6 }), 12);
  assert.equal(costOf("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 1e6 }), 24);
  assert.equal(costOf("claude-opus-5-5", { cache_read_input_tokens: 1e6 }), 0.2);
  assert.equal(costOf("claude-opus-5-5", { cache_creation_input_tokens: 1e6 }), 5);
  // an unknown model is priced like the Sonnet family
  assert.equal(costOf("something-new", { output_tokens: 1e6 }), 10);
});

test("claude: the window reports its cost and the time of the last message", () => {
  const line = (t, id) => JSON.stringify({ timestamp: t, requestId: "r" + id, message: { id: "m" + id, model: "claude-sonnet-5-5", usage: { output_tokens: 1e6 } } });
  const recs = parseUsage([line("2026-11-04T01:10:00Z", 1), line("2026-11-04T02:00:00Z", 2)].join("\n"));
  const s = summarize(recs, Date.parse("2026-11-04T03:00:00Z"));
  assert.equal(s.blockCost, 20);
  assert.equal(s.lastAt, Date.parse("2026-11-04T02:00:00Z") / 1000);
});

test("work: the day's total becomes yesterday's on the next day, and only then", () => {
  const t0 = new Date(2026, 10, 4, 10, 0, 0).getTime();
  let r = addSample({ day: "", activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0 }, { idle: 1, now: t0 });
  r = addSample(r, { idle: 1, now: t0 + 15_000 });
  const next = addSample(r, { idle: 1, now: t0 + 24 * 3600_000 });
  assert.equal(next.yesterdaySec, 30);
  // two days later the old total is no longer "yesterday"
  assert.equal(addSample(r, { idle: 1, now: t0 + 48 * 3600_000 }).yesterdaySec, 0);
  // the same day keeps the figure
  assert.equal(addSample(next, { idle: 1, now: t0 + 24 * 3600_000 + 15_000 }).yesterdaySec, 30);
});

test("settings page: keeps only valid servers in order, hides the password, an empty password means unchanged", () => {
  const base = { token: "t", servers: [], calendarExclude: [], trayIcon: "mono", launchAtLogin: false, appIcon: "tray", uiHostname: "", settings: defaultSettings(), bar: { host: "", password: "old" } };
  const next = applyChange(base, {
    servers: [
      { name: " B ", url: "https://b.example/health", icon: "globe", color: "#112233" },
      { name: "no url", url: "ftp://x" },
      { name: "", url: "https://c.example" },
      { name: "A", url: "https://a.example", icon: "Not Valid!", color: "red", downColor: "#aabbcc" },
    ],
    trayIcon: "rainbow",
    launchAtLogin: true,
    appIcon: "both",
    uiHostname: "Status-Page",
    bar: { host: "192.168.1.68", password: "" },
  });
  assert.deepEqual(next.servers.map((x) => [x.name, x.icon, x.color, x.downColor]), [["B", "globe", "#112233", ""], ["A", "server", "", "#AABBCC"]]);
  assert.equal(next.trayIcon, "rainbow");
  assert.equal(next.launchAtLogin, true);
  assert.equal(next.appIcon, "both");
  assert.equal(next.uiHostname, "status-page");
  assert.equal(next.bar.password, "old");
  assert.equal(applyChange(base, { trayIcon: "nonsense", appIcon: "nowhere", uiHostname: "bad name!" }).trayIcon, "mono");
  assert.equal(applyChange(base, { appIcon: "nowhere" }).appIcon, "tray");
  assert.equal(applyChange(base, { uiHostname: "bad name!" }).uiHostname, "");
  // "busybar" is the bar's own name
  assert.equal(applyChange(base, { uiHostname: "BusyBar" }).uiHostname, "");
  assert.equal(applyChange({ ...base, uiHostname: "status" }, { uiHostname: "busybar" }).uiHostname, "status");
  assert.equal(applyChange(base, { lang: "en" }).lang, "en");
  assert.equal(applyChange(base, { lang: "de" }).lang, undefined);
  const shown = publicConfig(next);
  assert.equal(shown.token, undefined);
  assert.equal(shown.bar.password, undefined);
  assert.equal(shown.bar.hasPassword, true);
});

test("screen settings: bad values fall back, numbers are clamped to their step, the bar gets a flat copy without local fields", () => {
  const s = sanitizeSettings({ music: { artworkOpacity: 47, color: "nope", startToggle: true, stateIcon: "yes" }, ai: { mascot: false }, work: { keepDays: 9999, hours: -4 }, servers: { view: "grid" }, ghost: { x: 1 } });
  assert.equal(s.music.artworkOpacity, 50); // steps of 10
  assert.equal(s.music.color, "#FFFFFF");
  assert.equal(s.music.startToggle, true);
  assert.equal(s.ai.mascot, "none"); // it used to be an on/off switch
  assert.equal(sanitizeSettings({ ai: { mascot: true } }).ai.mascot, "claude");
  assert.equal(sanitizeSettings({ ai: { mascot: "ghost" } }).ai.mascot, "ghost");
  assert.equal(s.music.stateIcon, false);
  assert.equal(s.work.keepDays, 365);
  assert.equal(s.work.hours, 0);
  assert.equal(s.servers.view, "tiles");
  assert.equal(s.ghost, undefined);
  const flat = forBar(s);
  assert.equal(flat.musicStartToggle, true);
  assert.equal(flat.workBreakMinutes, 0);
  assert.equal(flat.workKeepDays, undefined); // used only on the computer
  assert.equal(flat.appFlashMs, 700);
});

test("screen settings: every screen has the same first block; the LED colour starts out as the accent colour; old files carry over", () => {
  for (const g of GROUPS.filter((x) => x.id !== "app")) {
    const first = Object.entries(g.fields).filter(([, f]) => f.section === "screen").map(([k]) => k);
    // The music screen has no news, so it has no sound and no LED to set.
    assert.deepEqual(first, g.id === "music" ? ["color"] : ["color", "alertSound", "alertLed", "alertColor"], g.id);
    if (g.id !== "music") assert.equal(g.fields.alertColor.default, g.fields.color.default, g.id);
  }
  // One sound switch for the whole app became one for each screen.
  assert.equal(GROUPS.find((g) => g.id === "app").fields.alertSound, undefined);
  const quiet = sanitizeSettings({ app: { alertSound: false }, work: { alertSound: true } });
  assert.deepEqual([quiet.ai.alertSound, quiet.servers.alertSound, quiet.calendar.alertSound, quiet.work.alertSound], [false, false, false, true]);
  assert.equal(defaultSettings().ai.alertLed, true);
  assert.equal(sanitizeSettings({ calendar: { alertColor: "#00ff00" } }).calendar.alertColor, "#00FF00");
  // The servers' "up" colour is now the screen's accent colour.
  assert.equal(sanitizeSettings({ servers: { colorOk: "#112233" } }).servers.color, "#112233");
  assert.equal(sanitizeSettings({ servers: { colorOk: "#112233", color: "#445566" } }).servers.color, "#445566");
  const flat = forBar(defaultSettings());
  assert.equal(flat.serversAlertLed, true);
  assert.equal(flat.workAlertColor, "#4DA3FF");
  assert.equal(flat.musicAlertSound, undefined);
  assert.equal(flat.appAlertSound, undefined);
});

test("mascots: the ghost comes first in the choice, the new ones are accepted, anything else is not", () => {
  const options = GROUPS.find((g) => g.id === "ai").fields.mascot.options.map((o) => o.value);
  assert.deepEqual(options, ["ghost", "claude", "block", "cat", "none"]);
  for (const m of options) assert.equal(sanitizeSettings({ ai: { mascot: m } }).ai.mascot, m);
  assert.equal(sanitizeSettings({ ai: { mascot: "dog" } }).ai.mascot, "claude");
});

test("api: the settings page needs no token, its data does; the tray app reports back", async () => {
  const hub = new Hub();
  let reported = null;
  const app = { getConfig: () => ({ token: "secret", port: 1, trayIcon: "blue", launchAtLogin: true, appIcon: "dock", bar: { host: "" } }), setTrayState: (b) => (reported = b), calendarFeed() {} };
  const server = createApi({ hub, app });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/ui`)).status, 200);
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    const tray = await (await fetch(`${base}/tray`, { headers: { "X-Token": "secret" } })).json();
    assert.deepEqual([tray.icon, tray.launchAtLogin, tray.appIcon], ["blue", true, "dock"]);
    await fetch(`${base}/tray-state`, { method: "POST", headers: { "X-Token": "secret" }, body: JSON.stringify({ loginItem: "enabled" }) });
    assert.deepEqual(reported, { loginItem: "enabled" });
  } finally {
    server.close();
  }
});

test("work: a finished day is kept in the history, which survives gaps", () => {
  const t0 = new Date(2026, 10, 1, 10, 0, 0).getTime();
  let r = addSample({ day: "", activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0 }, { idle: 1, now: t0 });
  r = addSample(r, { idle: 1, now: t0 + 15_000 });
  r = addSample(r, { idle: 1, now: t0 + 3 * 24 * 3600_000 });
  assert.equal(r.days["2026-11-01"], 30);
  assert.equal(r.yesterdaySec, 0); // two days passed without the agent
  r = addSample(r, { idle: 1, now: t0 + 4 * 24 * 3600_000 });
  assert.equal(r.yesterdaySec, 15);
});

test("work: keepDays trims the history and recent() lists the last finished days, oldest first", () => {
  const t0 = new Date(2026, 10, 1, 10, 0, 0).getTime();
  let r = addSample({ day: "", activeSec: 0, firstAt: 0, sessionSec: 0, lastActiveAt: 0 }, { idle: 1, now: t0, keepDays: 2 });
  for (let d = 1; d <= 4; d++) r = addSample(r, { idle: 1, now: t0 + d * 24 * 3600_000, keepDays: 2 });
  assert.equal(Object.keys(r.days).length, 2);
  const last = recent({ days: { "2026-11-04": 600, "2026-11-03": 60 } }, new Date(2026, 10, 5, 12, 0, 0).getTime(), 3);
  assert.deepEqual(last, [0, 60, 600]);
});

test("English texts for the settings page cover every field of every group", () => {
  const ru = GROUPS;
  const en = localizedGroups("en");
  assert.equal(en.length, ru.length);
  for (const [i, g] of ru.entries()) {
    assert.ok(en[i].label); // "AI" is the same in both
    for (const [k, f] of Object.entries(g.fields)) {
      assert.ok(en[i].fields[k].label && en[i].fields[k].label !== f.label, `${g.id}.${k}`);
      for (const o of f.options ?? []) assert.ok(en[i].fields[k].options.find((x) => x.value === o.value).label);
    }
  }
  assert.equal(localizedGroups("ru"), GROUPS);
});

test("agents: ps lines are parsed and recognised by the program's own name or the script it runs", () => {
  const procs = parsePs(` 2097 88861   9:31.28    22:11:47 /Users/x/.vscode/extensions/anthropic.claude-code-2.1.317/resources/native-binary/claude --output-format stream-json
12005 56906   0:00.86    03:54:12 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=utility
 7001     1   1:00.00 01-02:03:04 node /usr/local/lib/node_modules/@openai/codex/bin/codex.js --full-auto
 7002  7001   0:01.00       00:10 npm test`);
  assert.equal(procs.length, 4);
  assert.deepEqual([procs[0].cpu, procs[2].up], [571.28, 93784]);
  assert.deepEqual(procs.map((p) => classify(p.command)), ["claude", null, "codex", null]);
  assert.equal(cpuSeconds("1:02:03"), 3723);
  assert.equal(elapsedSeconds("22:43"), 1363);
  assert.equal(classify("/Applications/Claude.app/Contents/MacOS/Claude"), null); // the desktop app is not a coding agent
});

test("agents: busy from CPU used by the agent or what it started, from log writes, from hooks; a hook's idle wins for a moment", () => {
  const proc = (pid, ppid, cpu, command) => ({ pid, ppid, cpu, up: 600, command });
  const t = new AgentTracker();
  const idle = [proc(1, 0, 10, "/x/claude --print"), proc(2, 1, 1, "bash -c sleep 9")];
  t.update(idle, 0);
  t.update(idle.map((p) => ({ ...p })), 1000);
  assert.deepEqual(t.snapshot(1000).map((a) => [a.id, a.busy, a.up]), [["claude", false, 10]]);
  // a child of the agent (a test run, say) burns CPU: the agent is busy
  t.update([proc(1, 0, 10.01, "/x/claude --print"), proc(2, 1, 1.5, "bash -c sleep 9")], 2000);
  assert.equal(t.snapshot(2000)[0].busy, true);
  assert.equal(t.snapshot(7000)[0].busy, true); // held for a few seconds
  assert.equal(t.snapshot(9000)[0].busy, false);
  // a log write
  t.touch("claude", 20_000);
  assert.equal(t.snapshot(21_000)[0].busy, true);
  assert.equal(t.snapshot(30_000)[0].busy, false);
  // hooks
  t.hook("claude", "working", 40_000);
  assert.equal(t.snapshot(100_000)[0].busy, true);
  t.hook("claude", "idle", 101_000);
  t.touch("claude", 101_500); // the last answer's own writes
  assert.equal(t.snapshot(102_000)[0].busy, false);
  // an agent that exists only through a hook shows up too
  t.hook("other", "working", 102_000);
  assert.deepEqual(t.snapshot(102_500).filter((a) => a.id === "other").map((a) => a.busy), [true]);
});

test("hub: a held request wakes up the moment something changes, or after its time", async () => {
  const hub = new Hub();
  const rev = hub.rev;
  const t0 = Date.now();
  setTimeout(() => hub.set("x", { a: 1 }), 30);
  await hub.waitForChange(rev, 2000);
  assert.ok(Date.now() - t0 < 500 && hub.rev === rev + 1);
  const t1 = Date.now();
  await hub.waitForChange(hub.rev, 60);
  assert.ok(Date.now() - t1 >= 50);
});

test("calendar: red by default, and a saved old default (blue) follows", () => {
  assert.equal(defaultSettings().calendar.color, "#FF3B30");
  const dir = mkdtempSync(join(tmpdir(), "bbs-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ token: "t", settings: { calendar: { minutes: 5, color: "#4DA3FF" } } }));
  assert.equal(loadConfig(file).settings.calendar.color, "#FF3B30");
  writeFileSync(file, JSON.stringify({ token: "t", settings: { calendar: { minutes: 5, color: "#00FF00" } } }));
  assert.equal(loadConfig(file).settings.calendar.color, "#00FF00");
});

test("calendar: a grid of five weeks from Monday with the meetings per day", () => {
  // Wednesday 4 November 2026, noon.
  const now = new Date(2026, 10, 4, 12, 0, 0).getTime();
  const at = (d, h) => Math.floor(new Date(2026, 10, d, h, 0, 0).getTime() / 1000);
  const c = toCalendar(
    [
      { title: "early", start: at(4, 9), end: at(4, 10), calendar: "W" }, // today, already over: counts in the grid, not in the list
      { title: "a", start: at(4, 15), end: at(4, 16), calendar: "W" },
      { title: "b", start: at(4, 17), end: at(4, 18), calendar: "W" },
      { title: "c", start: at(9, 10), end: at(9, 11), calendar: "W" },
    ],
    { now },
  );
  assert.deepEqual(c.events.map((e) => e.title), ["a", "b", "c"]);
  assert.equal(c.grid.counts.length, 35);
  assert.deepEqual({ wd: c.grid.wd, today: c.grid.today, d: c.grid.d, m: c.grid.m }, { wd: 2, today: 2, d: 4, m: 10 });
  // Monday 2 November is cell 0, so Wednesday is 2 and the next Monday (9th) is 7.
  assert.equal(c.grid.counts[2], 3);
  assert.equal(c.grid.counts[7], 1);
  assert.equal(c.grid.counts[3], 0);
});

test("settings: the screen order is a permutation, anything else falls back; the calendar starts as a grid", () => {
  const d = defaultSettings();
  assert.equal(d.app.order, "music,claude,servers,calendar,work");
  assert.equal(d.calendar.view, "weeks3");
  assert.equal(d.work.view, "grid");
  assert.equal(sanitizeSettings({ app: { order: "work,calendar,servers,claude,music" } }).app.order, "work,calendar,servers,claude,music");
  assert.equal(sanitizeSettings({ app: { order: "work,work,music" } }).app.order, d.app.order);
  assert.equal(forBar(d).appOrder, d.app.order);
});

test("api: the bar is known by its address and may only read the state and press the big button", async () => {
  const hub = new Hub();
  hub.set("music", { active: true });
  const app = (host) => ({ getConfig: () => ({ token: "secret", port: 0, trayIcon: "mono", bar: { host } }), calendarFeed() {}, activity() {}, control: async () => ({ ok: true }) });
  for (const [host, expected] of [["127.0.0.1", 200], ["10.9.9.9", 401]]) {
    const server = createApi({ hub, app: app(host) });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/state?s=music`)).status, expected);
      // the settings are never open to the bar's address alone
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/config`)).status, 401);
    } finally {
      server.close();
    }
  }
});

test("anim: a file the firmware accepts (header, one section, raw BGRA frames, sizes add up)", () => {
  const frames = [0, 1, 2].map((n) => Buffer.alloc(4 * 2 * 4, n));
  const f = encodeAnim({ width: 4, height: 2, fps: 10, frames });
  assert.equal(f.subarray(0, 8).toString(), "bicycle1");
  assert.deepEqual([f[8], f[9], f[10], f[11]], [0, 4, 2, 2]); // flags, width, height, Bgra8888
  assert.equal(f.readUInt16LE(14), 32); // longest pixel data
  assert.equal(f[16], 10);
  const sections = f.readUInt32LE(18);
  const framesLen = f.readUInt32LE(22);
  assert.equal(f.length, 34 + sections + framesLen);
  assert.equal(f.readUInt32LE(26), 1);
  assert.equal(f.readUInt32LE(30), 3);
  // section 0: frames 0..2, starting right after the sections chunk, named "default", the chunk ends with a NUL
  assert.deepEqual([f.readUInt32LE(34), f.readUInt32LE(38), f.readUInt32LE(42)], [0, 2, 34 + sections]);
  assert.equal(f.subarray(46, 53).toString(), "default");
  assert.equal(f[34 + sections - 1], 0);
  // each frame: mask fully white + raw pixels, no mask data, 32 bytes of pixels
  assert.deepEqual([f[34 + sections], f.readUInt16LE(35 + sections), f.readUInt16LE(37 + sections)], [0x10, 0, 32]);
  assert.equal(framesLen, 3 * (5 + 32));
});

test("language: a first start takes the system's, anything else is English; a chosen one is kept", () => {
  assert.equal(systemLang({ LANG: "ru_RU.UTF-8" }), "ru");
  assert.equal(systemLang({ LC_ALL: "de_DE.UTF-8", LANG: "ru_RU.UTF-8" }), "en");
  assert.equal(systemLang({ LANG: "en_US.UTF-8" }), "en");
  const dir = mkdtempSync(join(tmpdir(), "bbs-"));
  const file = join(dir, "config.json");
  const first = loadConfig(file);
  assert.equal(first.lang, systemLang());
  assert.equal(first.langPending, true);
  // the file now exists: a later start does not take the system's language again
  writeFileSync(file, JSON.stringify({ token: "t", lang: "en" }));
  assert.equal(loadConfig(file).lang, "en");
  assert.equal(loadConfig(file).langPending, undefined);
  // choosing a language on the settings page ends the waiting
  assert.equal(applyChange({ ...first, langPending: true }, { lang: "en" }).langPending, false);
});

test("servers: the bar gets the address and how many minutes each has been up or down", async () => {
  const web = createServer((_req, res) => res.end("ok"));
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const hub = new Hub();
  const up = `http://127.0.0.1:${web.address().port}/health`;
  const running = startServers({ hub, log() {}, servers: [{ name: "Up", url: up, icon: "server" }, { name: "Down", url: "http://127.0.0.1:1/", icon: "globe" }], intervalMs: 3_600_000 });
  try {
    for (let i = 0; i < 100 && !hub.snapshot(["servers"]).servers?.items?.length; i++) await new Promise((r) => setTimeout(r, 30));
    const items = hub.snapshot(["servers"]).servers.items;
    assert.deepEqual(items.map((i) => [i.name, i.ok, i.host]), [["Up", true, `127.0.0.1:${web.address().port}`], ["Down", false, "127.0.0.1:1"]]);
    assert.ok(items.every((i) => Number.isInteger(i.age) && i.age >= 0));
  } finally {
    running.stop();
    web.close();
  }
});

test("bar: finds which of our apps are installed and writes the common settings to each, keeping what is its own", async () => {
  const docs = {
    "app.solowey.boo-board": { version: 7, values: { lang: "ru", agent_host: "1.1.1.1", agent_port: 8787, screen_music: true, screen_work: false } },
    "app.solowey.boo-music": { version: 1, values: { lang: "en", agent_host: "2.2.2.2", agent_port: 9000 } },
  };
  const web = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("app_id");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/apps/list") return res.end(JSON.stringify({ apps: [{ id: "app.busy.clock" }, ...Object.keys(docs).map((i) => ({ id: i }))] }));
    if (req.method === "GET") return res.end(JSON.stringify(docs[id]));
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      docs[id] = JSON.parse(body);
      res.end("{}");
    });
  });
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const bar = { host: `127.0.0.1:${web.address().port}`, password: "p" };
  try {
    const apps = await barApi.installedApps(bar);
    assert.equal(apps.combined, true);
    assert.deepEqual(apps.ids, ["app.solowey.boo-board", "app.solowey.boo-music"]);
    // the combined app has every screen; a screen with no app of its own is covered by it
    assert.deepEqual(Object.values(apps.screens), [true, true, true, true, true]);
    await barApi.putEverywhere(bar, { lang: "ru", agent_host: "3.3.3.3", agent_port: 8787, screen_work: true, nonsense: 1 }, apps.ids);
    assert.deepEqual(docs["app.solowey.boo-board"].values, { lang: "ru", agent_host: "3.3.3.3", agent_port: 8787, screen_music: true, screen_work: true });
    // the module has no screen switches and no unknown keys appear in it
    assert.deepEqual(docs["app.solowey.boo-music"].values, { lang: "ru", agent_host: "3.3.3.3", agent_port: 8787 });
    assert.equal(docs["app.solowey.boo-music"].version, 1);
    // without the combined app only the modules count
    delete docs["app.solowey.boo-board"];
    const only = await barApi.installedApps(bar);
    assert.deepEqual(only.screens, { music: true, ai: false, servers: false, calendar: false, work: false });
  } finally {
    web.close();
  }
});
