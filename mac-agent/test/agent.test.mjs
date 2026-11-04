import { test } from "node:test";
import assert from "node:assert/strict";
import { Hub } from "../src/hub.mjs";
import { createApi } from "../src/server.mjs";
import { applyMessage, toMusic } from "../src/sources/music.mjs";
import { costOf, parseUsage, summarize } from "../src/sources/claude.mjs";
import { addSample } from "../src/sources/work.mjs";
import { toCalendar } from "../src/sources/calendar.mjs";

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
  const server = createApi({ hub, token: "secret" });
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
