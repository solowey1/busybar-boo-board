import { mascotSprite, spriteOf } from "../mascot";
import type { Pose } from "../mascot";
import type { Ctx, El, Screen } from "../types";
import { mix, tr, xpm } from "../util";
import { moodOf, styleOf } from "./claude";

/**
 * The mascot screen: only the mascot, in the middle. While an agent works (or has just finished) it jumps for joy
 * and a blue "pulse" spreads from it: one continuous wave that fades as it goes.
 *
 * The pulse is a loop of a few frames that are built once and kept while the screen is shown (`leave` lets them go):
 * a frame costs the bar's small JavaScript engine real time to build, and the same objects are what is sent again.
 */
const H = 16;
/** Where the mascot's 12x16 sprite goes, and the centre the waves spread from. */
const MX = 30;
const CX = 36;
const CY = 7.5;
const BLUE = "#4DA3FF";
/** Frames in one loop of the pulse, how long each shows, and how many fronts are on the screen at once. */
const FRAMES = 12;
const FRAME_MS = 80;
const FRONTS = 2;
/** Steps of brightness the wave is cut into: the keys "1".."8". */
const LEVELS = 8;
const KEYS = "12345678";
/** How high the mascot is, in rows, at each step of a jump; two jumps in one loop. */
const HOP = [0, 2, 4, 4, 2, 0];

let waves: El[] = [];
let sprites: El[] = [];
let signature = "";
/** The step of the loop; it moves on by one with every picture, so the motion is even however fast the bar takes them. */
let step = 0;
/** Distance of each pixel of the left half of a row from the centre, in quarter units, for the 8 distinct rows. */
let dist: number[][] | null = null;

/** A shade of the wave; level 1 is the faintest. Mixed with black, which on an LED panel is what transparency looks like. */
const shade = (level: number): string => mix(BLUE, 1 - level / LEVELS, "#000000");

/** One-character strings, so a row is built without making a new string for every pixel. */
const CHARS: string[] = ["."];
for (let l = 1; l <= LEVELS; l++) CHARS.push(KEYS.charAt(l - 1));
const REACH = 9;
/** How far behind its front a wave still glows, in the same units. */
const TAIL = 6;
/** Distances are looked up in steps of a quarter. */
const STEPS = 4 * (REACH + 4) + 8;

function makeDist(): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < H / 2; y++) {
    const dy = CY - y;
    const row: number[] = [];
    for (let x = 0; x < CX; x++) {
      // Squashed circles: the screen is wide and low, so the wave runs sideways about 4.5 times faster than it climbs.
      const dx = (CX - x) / 4.5;
      row.push(Math.round(Math.sqrt(dx * dx + dy * dy) * 4));
    }
    out.push(row);
  }
  return out;
}

/** The brightness of the wave at each distance (in quarters) in step `f` of the loop: one continuous, fading wave. */
function profile(f: number): number[] {
  const out: number[] = [];
  for (let q = 0; q < STEPS; q++) {
    const d = q / 4;
    let best = 0;
    for (let k = 0; k < FRONTS; k++) {
      const front = (((f + (k * FRAMES) / FRONTS) % FRAMES) / FRAMES) * REACH;
      const behind = front - d;
      // A soft edge ahead of the front, then a long tail behind it that fades smoothly towards the middle.
      if (behind < -0.75 || behind > TAIL) continue;
      const shape = behind < 0 ? 1 + behind / 0.75 : 1 - behind / TAIL;
      // The whole wave dies away as it travels outwards.
      const v = shape * shape * (1 - front / REACH) * LEVELS;
      if (v > best) best = v;
    }
    out.push(best >= LEVELS ? LEVELS : Math.floor(best));
  }
  return out;
}

/** The wave alone, 72x16; the mascot is a separate small picture on top. */
function buildWave(f: number): El {
  if (dist === null) dist = makeDist();
  const prof = profile(f);
  const half: string[] = [];
  for (let r = 0; r < dist.length; r++) {
    const left: string[] = [];
    for (let x = 0; x < CX; x++) left.push(CHARS[prof[dist[r][x]]]);
    const text = left.join("");
    left.reverse();
    half.push(text + left.join(""));
  }
  const rows = half.concat(half.slice().reverse());
  const colors: Record<string, string> = {};
  for (let l = 1; l <= LEVELS; l++) colors[KEYS.charAt(l - 1)] = shade(l);
  return xpm("mc.w", rows, 0, 0, colors, { z_index: 0 });
}

/** The mascot jumping in step `f` of the loop. */
function jump(f: number): Pose {
  const lift = HOP[f % HOP.length];
  const beat = (f % 2) as 0 | 1;
  return { eyes: "happy", lift, armL: lift > 0 ? "up" : "down", armR: lift > 0 ? "up" : "down", legs: lift > 0 ? "spread" : "stand", wave: beat, sway: beat };
}

export const mascotScreen: Screen = {
  id: "mascot",
  title: (cfg) => tr(cfg, "mascot"),
  /** Busy moods move fast; a resting or sleeping mascot is slow and cheap. */
  tickMs(ctx: Ctx) {
    const m = moodOf(ctx);
    return m === "work" || m === "dance" || m === "rock" ? FRAME_MS : 400;
  },
  elements(ctx: Ctx) {
    const { cfg, at } = ctx;
    const mood = moodOf(ctx);
    const style = cfg.s.aiMascot === "ghost" ? "ghost" : styleOf(ctx);
    const body = cfg.s.aiColor;

    if (mood === "work" || mood === "dance" || mood === "rock") {
      step = (step + 1) % FRAMES;
      const f = step;
      const sig = style + body;
      if (sig !== signature) {
        sprites = [];
        signature = sig;
      }
      if (!waves[f]) waves[f] = buildWave(f);
      if (!sprites[f]) {
        const sp = spriteOf(jump(f), body, style);
        sprites[f] = xpm("mc.p", sp.rows, MX, 0, sp.colors, { z_index: 1 });
      }
      return [waves[f], sprites[f]];
    }
    // Resting: just the mascot, small, in the middle.
    sprites = [];
    signature = "";
    const sp = mascotSprite(mood, at, body, style);
    return [xpm("mc.p", sp.rows, MX, 0, sp.colors, { z_index: 1 })];
  },
  /** The screen went off the display: the loop of frames is not needed until it comes back. */
  leave() {
    waves = [];
    sprites = [];
    dist = null;
    signature = "";
    step = 0;
  },
};
