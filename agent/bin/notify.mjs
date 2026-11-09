#!/usr/bin/env node
// Sends an alert to the BUSY Bar through the local agent.
//   notify.mjs <kind> [text]        e.g. notify.mjs claude_done "Готово"
// Kinds that mean "an AI is done": claude_done, claude_wait, ai_done, ai_wait. Any other AI tool
// (Codex, Gemini, ...) can use ai_done / ai_wait from its own hook or notify setting.
// Used as a Claude Code hook: with no text, it reads the hook JSON from stdin
// (cwd, message) and makes a short text out of it.
import { basename } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { t } from "../src/i18n.mjs";

const config = loadConfig();

const [kind = "info", ...rest] = process.argv.slice(2);
let text = rest.join(" ").trim();

if (!text && !process.stdin.isTTY) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const hook = JSON.parse(raw);
    const project = hook.cwd ? basename(hook.cwd) : "";
    text = kind.endsWith("_wait") ? (hook.message ?? `${t(config.lang, "wait")}: ${project}`) : t(config.lang, "doneIn", { name: project });
  } catch {
    text = kind.endsWith("_wait") ? t(config.lang, "wait") : t(config.lang, "done");
  }
}

// "claude_start" (a hook for "the user sent a prompt") only tells the agent that work began: no pop-up.
if (kind.endsWith("_start")) {
  try {
    await fetch(`http://127.0.0.1:${config.port}/activity`, { method: "POST", headers: { "X-Token": config.token }, body: JSON.stringify({ agent: kind.slice(0, -6) === "ai" ? "other" : kind.slice(0, -6), state: "working" }), signal: AbortSignal.timeout(3000) });
  } catch {
    /* the agent is not running: a hook must never get in the way */
  }
  process.exit(0);
}
try {
  const res = await fetch(`http://127.0.0.1:${config.port}/notify`, {
    method: "POST",
    headers: { "X-Token": config.token },
    body: JSON.stringify({ kind, text }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) process.exitCode = 1;
} catch {
  // The agent is not running: a hook must never get in Claude's way.
}
