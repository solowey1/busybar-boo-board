import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOUR = 3600_000;
const BLOCK = 5 * HOUR;

// USD per million tokens: input, output, cache read. A cache write (5 min) costs 1.25x the input price.
// Prices of the models seen in the logs; a model that is not listed is priced like the nearest family.
export const PRICES = {
  opus: { in: 4, out: 20, cacheRead: 0.2 },
  sonnet: { in: 2, out: 10, cacheRead: 0.2 },
  haiku: { in: 0.1, out: 0.5, cacheRead: 0.01 },
  fable: { in: 10, out: 50, cacheRead: 0.25 },
};

export function priceOf(model = "") {
  const m = model.toLowerCase();
  if (m.includes("opus")) return PRICES.opus;
  if (m.includes("haiku")) return PRICES.haiku;
  if (m.includes("fable") || m.includes("mythos")) return PRICES.fable;
  return PRICES.sonnet;
}

/** What one message would cost on the API, in USD. */
export function costOf(model, u) {
  const p = priceOf(model);
  const cents =
    (u.input_tokens ?? 0) * p.in +
    (u.output_tokens ?? 0) * p.out +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead +
    (u.cache_creation_input_tokens ?? 0) * p.in * 1.25;
  return cents / 1e6;
}

/** Pulls usage records out of JSONL text; returns [{t, id, tokens, out, cost}] */
export function parseUsage(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.includes('"usage"')) continue;
    try {
      const o = JSON.parse(line);
      const u = o?.message?.usage;
      if (!u || !o.timestamp) continue;
      const t = Date.parse(o.timestamp);
      if (!Number.isFinite(t)) continue;
      const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      out.push({ t, id: `${o.message.id ?? ""}:${o.requestId ?? ""}`, tokens, out: u.output_tokens ?? 0, cost: costOf(o.message.model, u) });
    } catch {
      /* partial or foreign line */
    }
  }
  return out;
}

/** Groups records into 5-hour blocks the way ccusage does (block starts at the first message, floored to the hour). */
export function summarize(records, now = Date.now()) {
  const sorted = [...records].sort((a, b) => a.t - b.t);
  let start = null;
  let last = null;
  let tokens = 0;
  let outTokens = 0;
  let cost = 0;
  let count = 0;
  for (const r of sorted) {
    if (start === null || r.t >= start + BLOCK || r.t - last >= BLOCK) {
      start = Math.floor(r.t / HOUR) * HOUR;
      tokens = 0;
      outTokens = 0;
      cost = 0;
      count = 0;
    }
    tokens += r.tokens;
    outTokens += r.out;
    cost += r.cost ?? 0;
    count += 1;
    last = r.t;
  }
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const today = sorted.filter((r) => r.t >= dayStart.getTime()).reduce((s, r) => s + r.tokens, 0);
  const weekAgo = now - 7 * 24 * HOUR;
  const week = sorted.filter((r) => r.t >= weekAgo).reduce((s, r) => s + r.tokens, 0);
  const active = start !== null && now < start + BLOCK;
  return {
    active,
    blockTokens: active ? tokens : 0,
    blockOut: active ? outTokens : 0,
    // What the window would cost at API prices, rounded to cents.
    blockCost: active ? Math.round(cost * 100) / 100 : 0,
    // Epoch seconds of the latest message: the bar tells "working now" from "asleep" with its own clock.
    lastAt: last === null ? 0 : Math.floor(last / 1000),
    blockMessages: active ? count : 0,
    // Seconds until the block resets; the bar counts down from its own clock.
    resetIn: active ? Math.max(0, Math.round((start + BLOCK - now) / 1000)) : 0,
    today,
    week,
  };
}

/** Reads the Claude Code logs incrementally (only new bytes of each file). */
export function startClaude({ hub, log, root = join(homedir(), ".claude", "projects"), intervalMs = 10_000 }) {
  const offsets = new Map(); // file -> bytes already read
  const seen = new Set();
  let records = [];

  const scan = () => {
    const cutoff = Date.now() - 8 * 24 * HOUR;
    let dirs = [];
    try {
      dirs = readdirSync(root);
    } catch {
      return;
    }
    for (const dir of dirs) {
      let files = [];
      try {
        files = readdirSync(join(root, dir)).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const f of files) {
        const path = join(root, dir, f);
        let st;
        try {
          st = statSync(path);
        } catch {
          continue;
        }
        if (st.mtimeMs < cutoff) continue;
        const from = offsets.get(path) ?? 0;
        if (st.size <= from) continue;
        const buf = Buffer.alloc(st.size - from);
        const fd = openSync(path, "r");
        try {
          readSync(fd, buf, 0, buf.length, from);
        } finally {
          closeSync(fd);
        }
        // Only whole lines: a half-written last line is read again next time.
        const text = buf.toString("utf8");
        const end = text.lastIndexOf("\n");
        if (end < 0) continue;
        offsets.set(path, from + Buffer.byteLength(text.slice(0, end + 1)));
        for (const r of parseUsage(text.slice(0, end + 1))) {
          if (seen.has(r.id) && r.id !== ":") continue;
          seen.add(r.id);
          records.push(r);
        }
      }
    }
    records = records.filter((r) => r.t >= cutoff);
  };

  const tick = () => {
    try {
      scan();
      const s = summarize(records);
      // resetIn changes every second; the bar counts down itself, so compare without it.
      const { resetIn, ...rest } = s;
      hub.set("claude", { ...rest, resetIn: Math.round(resetIn / 60) * 60 });
    } catch (err) {
      log(`claude: ${err.message}`);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
