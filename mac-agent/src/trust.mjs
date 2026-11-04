import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** "::ffff:192.168.1.68" -> "192.168.1.68" */
export const plainAddress = (addr) => String(addr ?? "").replace(/^::ffff:/, "");

const cache = new Map();
const TTL_MS = 60_000;

/** The address behind the bar's host setting (an IP as it is, a name looked up and remembered for a minute). */
export async function barAddress(host) {
  const h = String(host ?? "").trim();
  if (!h) return "";
  if (isIP(h)) return h;
  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.addr;
  let addr = "";
  try {
    addr = (await lookup(h)).address;
  } catch {
    addr = "";
  }
  cache.set(h, { addr, at: Date.now() });
  return addr;
}

/**
 * True when the request comes from the BUSY Bar itself: its address is the one set as the bar's host.
 * The bar app has no place to keep a token (its settings page cannot hide one), so the bar is known by its address;
 * it may only read the state and press the big button (see the paths in server.mjs).
 */
export async function isBar(req, host) {
  const expected = await barAddress(host);
  return expected !== "" && plainAddress(req.socket.remoteAddress) === expected;
}
