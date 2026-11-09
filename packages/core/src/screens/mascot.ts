import { mascotSprite, spriteOf } from "../mascot";
import type { Pose } from "../mascot";
import type { Ctx, El } from "../types";
import { xpm } from "../util";
import { moodOf, styleOf } from "./moods";

/**
 * The mascot page of the agents screen (OK steps to it): only the mascot, in the middle. While an agent works (or has
 * just finished) the mascot jumps for joy and a blue "pulse" spreads from it: one continuous wave that fades as it goes.
 *
 * The wave is a native animation of the bar (`src/animations/pulse.anim`, made by `agent/tools/anim.mjs`): the
 * firmware plays it in a loop by itself, so the app sends it once. Only the small picture of the jumping mascot is sent
 * again and again, and those pictures are made once and kept while the page is shown.
 */
const MX = 30;
/** Frames of the jump, how long each shows. */
const FRAMES = 12;
const FRAME_MS = 100;
/** How high the mascot is, in rows, at each step of a jump; two jumps in one loop. */
const HOP = [0, 2, 4, 4, 2, 0];

/** The wave: the same element every time, so it is drawn once and the bar keeps playing it. */
const WAVE: El = { id: "mc.w", type: "animation", path: "animations/pulse.anim", loop: true, x: 0, y: 0, align: "top_left", display: "front", z_index: 0 };

let sprites: El[] = [];
let signature = "";
/** The step of the jump; it moves on by one with every picture, so the motion is even however fast the bar takes them. */
let step = 0;

/** The mascot jumping in step `f` of the loop. */
function jump(f: number): Pose {
  const lift = HOP[f % HOP.length];
  const beat = (f % 2) as 0 | 1;
  return { eyes: "happy", lift, armL: lift > 0 ? "up" : "down", armR: lift > 0 ? "up" : "down", legs: lift > 0 ? "spread" : "stand", wave: beat, sway: beat, squash: lift === 0 ? 1 : 0 };
}

/** How soon the next picture is wanted: fast while the mascot jumps, slowly while it rests. */
export function mascotTickMs(ctx: Ctx): number {
  const m = moodOf(ctx);
  return m === "work" || m === "dance" || m === "rock" ? FRAME_MS : 400;
}

/** The mascot page of the agents screen. */
export function mascotView(ctx: Ctx): El[] {
  const { cfg, at } = ctx;
  const mood = moodOf(ctx);
  const style = styleOf(ctx);
  const body = cfg.s.aiColor;

  if (mood === "work" || mood === "dance" || mood === "rock") {
    step = (step + 1) % FRAMES;
    const sig = style + body;
    if (sig !== signature) {
      sprites = [];
      signature = sig;
    }
    if (!sprites[step]) {
      const sp = spriteOf(jump(step), body, style);
      sprites[step] = xpm("mc.p", sp.rows, MX, 0, sp.colors, { z_index: 1 });
    }
    return [WAVE, sprites[step]];
  }
  // Resting: just the mascot, in the middle.
  sprites = [];
  signature = "";
  const sp = mascotSprite(mood, at, body, style);
  return [xpm("mc.p", sp.rows, MX, 0, sp.colors, { z_index: 1 })];
}

/** The page was left: the pictures are not needed until it comes back. */
export function releaseMascot(): void {
  if (sprites.length === 0 && step === 0) return;
  sprites = [];
  signature = "";
  step = 0;
}
