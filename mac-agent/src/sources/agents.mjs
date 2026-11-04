import { execFile } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, join } from "node:path";

/**
 * Which AI coding agents are running on this computer, and which of them is busy right now.
 *
 * Three signals, because none is enough alone: an agent that waits for a command it started uses almost
 * no CPU, and one that streams an answer writes nothing to its log until the answer is complete.
 *   1. CPU time of the agent's process and everything it started, sampled every second or two;
 *   2. writes to the agent's session logs (a file-system watcher, so it is instant);
 *   3. hooks: an agent can say "working" / "idle" itself (POST /activity), which beats the guesses.
 */
export const AGENTS = [
  { id: "claude", name: "Claude", names: ["claude", "claude-code"], paths: ["@anthropic-ai/claude-code", "/claude-code/"], logDir: () => join(homedir(), ".claude", "projects") },
  { id: "codex", name: "Codex", names: ["codex"], paths: ["@openai/codex"], logDir: () => join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions") },
  { id: "gemini", name: "Gemini", names: ["gemini"], paths: ["@google/gemini-cli"], logDir: () => join(homedir(), ".gemini", "tmp") },
  { id: "aider", name: "Aider", names: ["aider"], paths: [] },
  { id: "opencode", name: "OpenCode", names: ["opencode"], paths: ["opencode-ai"] },
  { id: "cursor", name: "Cursor", names: ["cursor-agent"], paths: [] },
  { id: "goose", name: "Goose", names: ["goose"], paths: [] },
  // Anything else that reports through a hook (ai_start / ai_done), without a process the agent could recognise.
  { id: "other", name: "AI", names: [], paths: [] },
];

/** "9:31.28" -> 571.28 s; "1:02:03" -> 3723 s */
export function cpuSeconds(text) {
  return String(text).split(":").reduce((sum, part) => sum * 60 + parseFloat(part), 0) || 0;
}

/** "01-02:45:58" -> seconds; "22:43" -> seconds */
export function elapsedSeconds(text) {
  const [days, rest] = String(text).includes("-") ? String(text).split("-") : [0, String(text)];
  return Number(days) * 86400 + rest.split(":").reduce((sum, part) => sum * 60 + parseFloat(part), 0);
}

/** Output of `ps -axww -o pid=,ppid=,time=,etime=,command=` */
export function parsePs(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), cpu: cpuSeconds(m[3]), up: elapsedSeconds(m[4]), command: m[5] });
  }
  return out;
}

/** Which agent a command line is, if any: by the program's own name, or by the script an interpreter runs. */
export function classify(command) {
  const tokens = command.split(/\s+/);
  let exe = basename(tokens[0]);
  let path = tokens[0];
  // `node /usr/lib/node_modules/@openai/codex/bin/codex.js`: the script says what it is.
  if (/^(node|bun|deno|python[\d.]*)$/.test(exe) && tokens[1]) {
    path = tokens.find((t, i) => i > 0 && !t.startsWith("-")) ?? tokens[1];
    exe = basename(path).replace(/\.(m?js|cjs|py)$/, "");
  }
  for (const a of AGENTS) {
    if (a.names.includes(exe) || a.paths.some((p) => path.includes(p))) return a.id;
  }
  return null;
}

/** Keeps what it has seen between samples and says, at any moment, who is running and who is busy. */
export class AgentTracker {
  #prev = new Map(); // pid -> cpu seconds at the last sample
  #prevAt = 0;
  #running = new Map(); // agent -> { up }
  #cpuUntil = {};
  #logUntil = {};
  #hookUntil = {};
  #quietUntil = {};
  #logSeen = {};

  /** One `ps` sample. */
  update(procs, now = Date.now()) {
    const dt = this.#prevAt ? (now - this.#prevAt) / 1000 : 0;
    const byPid = new Map(procs.map((p) => [p.pid, p]));
    const kids = new Map();
    for (const p of procs) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p.pid]);
    const kind = new Map(procs.map((p) => [p.pid, classify(p.command)]));
    const running = new Map();
    const cpu = {};
    for (const p of procs) {
      const id = kind.get(p.pid);
      if (!id) continue;
      // A process inside another of the same agent belongs to it: do not count it twice.
      let parent = byPid.get(p.ppid);
      let nested = false;
      while (parent) {
        if (kind.get(parent.pid) === id) nested = true;
        parent = byPid.get(parent.ppid);
      }
      const entry = running.get(id) ?? { up: 0 };
      entry.up = Math.max(entry.up, p.up);
      running.set(id, entry);
      if (nested) continue;
      // Everything the agent started counts: a test run it waits for is work too.
      const stack = [p.pid];
      while (stack.length) {
        const pid = stack.pop();
        const q = byPid.get(pid);
        const before = this.#prev.get(pid);
        if (q && before !== undefined && dt > 0) cpu[id] = (cpu[id] ?? 0) + Math.max(0, q.cpu - before);
        stack.push(...(kids.get(pid) ?? []));
      }
    }
    if (dt > 0) for (const [id, secs] of Object.entries(cpu)) if (secs / dt >= 0.04) this.#cpuUntil[id] = now + 6000;
    this.#prev = new Map(procs.map((p) => [p.pid, p.cpu]));
    this.#prevAt = now;
    this.#running = running;
  }

  /** The agent's log was written to. */
  touch(id, now = Date.now()) {
    this.#logUntil[id] = now + 8000;
    this.#logSeen[id] = now;
  }

  /** The agent said it is "working" or "idle" itself. */
  hook(id, state, now = Date.now()) {
    if (state === "working") {
      this.#hookUntil[id] = now + 30 * 60_000;
      this.#quietUntil[id] = 0;
    } else {
      // The finishing writes of the last answer must not read as new work.
      this.#hookUntil[id] = 0;
      this.#cpuUntil[id] = 0;
      this.#logUntil[id] = 0;
      this.#quietUntil[id] = now + 3000;
    }
  }

  busy(id, now) {
    if (now < (this.#quietUntil[id] ?? 0)) return false;
    return now < (this.#cpuUntil[id] ?? 0) || now < (this.#logUntil[id] ?? 0) || now < (this.#hookUntil[id] ?? 0);
  }

  /** [{ id, name, busy, up }]: agents with a process, or that wrote a log or sent a hook in the last two minutes. */
  snapshot(now = Date.now()) {
    const out = [];
    for (const a of AGENTS) {
      const run = this.#running.get(a.id);
      const recent = (a.id in this.#logSeen && now - this.#logSeen[a.id] < 120_000) || now < (this.#hookUntil[a.id] ?? 0);
      if (!run && !recent) continue;
      // `up` in whole minutes, so the numbers do not change the state every second.
      out.push({ id: a.id, name: a.name, busy: this.busy(a.id, now), up: run ? Math.floor(run.up / 60) : 0 });
    }
    return out;
  }
}

const ps = () =>
  new Promise((resolve) => execFile("ps", ["-axww", "-o", "pid=,ppid=,time=,etime=,command="], { timeout: 4000, maxBuffer: 8 << 20 }, (err, out) => resolve(err ? null : String(out))));

/** Samples the processes and watches the logs; publishes `agents` to the hub when something changes. */
export function startAgents({ hub, log, intervalMs = 1200 }) {
  const tracker = new AgentTracker();
  const watchers = [];
  for (const a of AGENTS) {
    const dir = a.logDir?.();
    if (!dir || !existsSync(dir)) continue;
    try {
      // Recursive watching is native on macOS and Windows and in Node 20+ on Linux.
      watchers.push(watch(dir, { recursive: true }, (_event, file) => {
        if (file && /\.jsonl?$/.test(String(file))) tracker.touch(a.id);
      }));
    } catch (err) {
      log(`agents: cannot watch ${dir}: ${err.message}`);
    }
  }
  const publish = () => hub.set("agents", { list: tracker.snapshot() });
  const tick = async () => {
    // Windows has no ps: there the logs and the hooks have to do.
    if (platform() !== "win32") {
      const text = await ps();
      if (text) tracker.update(parsePs(text));
    }
    publish();
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return {
    stop() {
      clearInterval(timer);
      watchers.forEach((w) => w.close());
    },
    hook(id, state) {
      tracker.hook(id, state);
      publish();
    },
    snapshot: () => tracker.snapshot(),
  };
}
