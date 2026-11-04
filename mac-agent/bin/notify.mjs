#!/usr/bin/env node
// Sends an alert to the BUSY Bar through the local agent.
//   notify.mjs <kind> [text]        e.g. notify.mjs claude_done "Готово"
// Used as a Claude Code hook: with no text, it reads the hook JSON from stdin
// (cwd, message) and makes a short text out of it.
import { basename } from "node:path";
import { loadConfig } from "../src/config.mjs";

const [kind = "info", ...rest] = process.argv.slice(2);
let text = rest.join(" ").trim();

if (!text && !process.stdin.isTTY) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const hook = JSON.parse(raw);
    const project = hook.cwd ? basename(hook.cwd) : "";
    text = kind === "claude_wait" ? (hook.message ?? `Ждёт ответа: ${project}`) : `Готово: ${project}`;
  } catch {
    text = kind === "claude_wait" ? "Claude ждёт ответа" : "Claude закончил";
  }
}

const config = loadConfig();
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
