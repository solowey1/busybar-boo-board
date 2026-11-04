import type { El } from "./types";
import { xpm } from "./util";

/** "dance" is the happy mood after Claude has finished. */
export type Mood = "idle" | "work" | "dance" | "sleep" | "rock";

type Arm = "up" | "mid" | "down";

export interface Pose {
  /** rows the body is moved up (a hop); negative moves it down */
  lift?: number;
  armL?: Arm;
  armR?: Arm;
  /** eyes: open (looking ahead / aside / down), a blink, shut, or happy arches */
  eyes?: "open" | "left" | "right" | "down" | "blink" | "shut" | "happy";
  legs?: "stand" | "spread";
  /** how many rows of leg: 2 when standing, 1 when lying down */
  legRows?: 1 | 2;
  /** the body's top row, instead of the standing one (the sleeper lies on the bottom edge) */
  top?: number;
  /** which "z" frame to draw above the head, 0 = none */
  z?: 0 | 1 | 2 | 3;
  /** the ghost only: its hem, in one of two shapes, and a sway to the right */
  wave?: 0 | 1;
  sway?: 0 | 1;
}

export type Style = "claude" | "ghost";

const W = 12;
const H = 16;
/** The body's top row; the rows above it are for hops, raised arms and the "z". */
const TOP = 5;

/** Draws one frame of the mascot into 16 rows of 12 characters: "#" is the body, "z" is the sleep mark. */
function draw(p: Pose): string[] {
  const g: string[][] = [];
  for (let y = 0; y < H; y++) {
    const r: string[] = [];
    for (let x = 0; x < W; x++) r.push(".");
    g.push(r);
  }
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
  };
  const top = p.top !== undefined ? p.top : TOP - (p.lift || 0);
  // The body: 10 wide, 7 tall.
  for (let y = 0; y < 7; y++) for (let x = 1; x <= 10; x++) set(x, top + y, "#");
  // Arms stick out on the sides, two rows each.
  const armRow = (a: Arm | undefined) => (a === "up" ? -1 : a === "down" ? 5 : 3);
  [0, 11].forEach((x) => {
    const r = armRow(x === 0 ? p.armL : p.armR);
    set(x, top + r, "#");
    set(x, top + r + 1, "#");
  });
  // Legs: four short stubs.
  const legs = p.legs === "spread" ? [1, 4, 7, 10] : [2, 4, 7, 9];
  legs.forEach((x) => {
    set(x, top + 7, "#");
    if (p.legRows !== 1) set(x, top + 8, "#");
  });
  // Eyes are black pixels ("e"), not holes: a hole would show whatever is behind the mascot, such as the wave.
  const e = p.eyes || "open";
  const shift = e === "left" ? -1 : e === "right" ? 1 : 0;
  const row = e === "down" ? 2 : 1;
  const hole = (x: number, y: number) => set(x, top + y, "e");
  if (e === "happy") {
    // ^ ^ : one pixel on top, two below
    [3, 8].forEach((x) => {
      hole(x, 1);
      hole(x - 1, 2);
      hole(x + 1, 2);
    });
  } else if (e === "shut") {
    [2, 3, 4, 7, 8, 9].forEach((x) => hole(x, 2));
  } else if (e === "blink") {
    hole(3, 2);
    hole(8, 2);
  } else {
    [3, 8].forEach((x) => {
      hole(x + shift, row);
      hole(x + shift, row + 1);
    });
  }
  // A sleeper's "z" grows: a small one, then a small and a large one, then the large one alone.
  const small = ["###", "..#", ".#.", "###"];
  const large = ["####", "...#", "..#.", ".#..", "####"];
  const stamp = (shape: string[], x0: number, y0: number) => shape.forEach((row, i) => row.split("").forEach((c, k) => c === "#" && set(x0 + k, y0 + i, "z")));
  if (p.z === 1) stamp(small, 9, 3);
  if (p.z === 2) {
    stamp(small, 4, 4);
    stamp(large, 8, 0);
  }
  if (p.z === 3) stamp(large, 8, 0);
  return g.map((r) => r.join(""));
}

/** Which frame to draw at time `at` (ms); the bar moves it on by itself. */
export function pose(mood: Mood, at: number): Pose {
  const f = Math.floor(at / 500);
  if (mood === "work") {
    // Typing: the arms take turns, the eyes watch the work (the ghost wriggles its hem instead).
    const wave = (f % 2) as 0 | 1;
    return f % 2 === 0 ? { eyes: "down", armL: "mid", armR: "down", wave } : { eyes: "down", armL: "down", armR: "mid", lift: 0, wave };
  }
  if (mood === "rock") {
    // Playing the guitar: the head bobs, the strumming hand goes up and down.
    const beat = (f % 2) as 0 | 1;
    return { eyes: "happy", armL: "mid", armR: beat ? "down" : "mid", lift: beat, wave: beat, sway: beat };
  }
  if (mood === "dance") {
    const steps: Pose[] = [
      { eyes: "happy", armL: "up", armR: "up", lift: 1, legs: "stand" },
      { eyes: "happy", armL: "up", armR: "down", legs: "spread" },
      { eyes: "happy", armL: "down", armR: "down", lift: 1, legs: "stand" },
      { eyes: "happy", armL: "down", armR: "up", legs: "spread" },
    ];
    return { ...steps[f % 4], wave: (f % 2) as 0 | 1, sway: (f % 2) as 0 | 1 };
  }
  if (mood === "sleep") {
    // A slow cycle of the "z".
    const z = (Math.floor(at / 1500) % 4) as 0 | 1 | 2 | 3;
    // Lying on the bottom edge: the legs are one row, the body sits at rows 8-14, the "z" has the room above.
    return { eyes: "shut", z, top: 8, legRows: 1 };
  }
  // Idle: mostly looking ahead, sometimes blinking or glancing aside.
  const t = f % 30;
  if (t === 9 || t === 10 || t === 24) return { eyes: "blink" };
  if (t >= 14 && t <= 16) return { eyes: "left" };
  if (t >= 19 && t <= 21) return { eyes: "right" };
  return {};
}

// ---- the ghost ----------------------------------------------------------------------------------
// The app's icon: a rainbow ghost. It is the mascot of every AI that has none of its own.
const GHOST = ["...xxxxx...", "..xxxxxxx..", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx."];
const HEM = [
  [".xxxx.xxxx.", ".xxx...xxx."],
  [".x.xxxxx.x.", "..xxx.xxx.."],
];
/** One colour band per row, top to bottom: orange, yellow, green, blue. */
const BANDS = "oooyyyggbbb";

function drawGhost(p: Pose): string[] {
  const g: string[][] = [];
  for (let y = 0; y < H; y++) {
    const r: string[] = [];
    for (let x = 0; x < W; x++) r.push(".");
    g.push(r);
  }
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
  };
  const top = p.top !== undefined ? p.top : 4 - (p.lift || 0);
  const x0 = p.sway || 0;
  GHOST.concat(HEM[p.wave || 0]).forEach((row, r) => row.split("").forEach((c, x) => c === "x" && set(x0 + x, top + r, BANDS.charAt(r))));
  // Eyes: black pixels, two rows tall like the Claude mascot's.
  const e = p.eyes || "open";
  const shift = e === "left" ? -1 : e === "right" ? 1 : 0;
  const row = e === "down" ? 4 : 3;
  const hole = (x: number, y: number) => set(x0 + x, top + y, "e");
  if (e === "happy") {
    [3, 7].forEach((x) => {
      hole(x, 3);
      hole(x - 1, 4);
      hole(x + 1, 4);
    });
  } else if (e === "shut") {
    [2, 3, 4, 6, 7, 8].forEach((x) => hole(x, 4));
  } else if (e === "blink") {
    hole(3, 4);
    hole(7, 4);
  } else {
    [3, 7].forEach((x) => {
      hole(x + shift, row);
      hole(x + shift, row + 1);
    });
  }
  const small = ["###", "..#", ".#.", "###"];
  const large = ["####", "...#", "..#.", ".#..", "####"];
  const stamp = (shape: string[], x1: number, y1: number) => shape.forEach((r, i) => r.split("").forEach((c, k) => c === "#" && set(x1 + k, y1 + i, "z")));
  if (p.z === 1 || p.z === 3) stamp(small, 9, 1);
  if (p.z === 2) stamp(large, 8, 0);
  return g.map((r) => r.join(""));
}

export interface Sprite {
  rows: string[];
  colors: Record<string, string>;
}

/** The same, for a pose made by hand (the pulse screen builds its own jumps). */
export function spriteOf(p: Pose, body: string, style: Style = "claude"): Sprite {
  if (style === "ghost") return { rows: drawGhost(p), colors: { o: "#D97757", y: "#FFD000", g: "#3DDC84", b: "#4DA3FF", z: "#4DA3FF", e: "#000000" } };
  return { rows: draw(p), colors: { "#": body, z: "#4DA3FF", e: "#000000" } };
}

/** One frame of a mascot: 16 rows of 12 characters and the colour of each character. */
export function mascotSprite(mood: Mood, at: number, body: string, style: Style = "claude"): Sprite {
  if (style === "ghost") {
    const p = pose(mood, at);
    // Asleep it hovers at the bottom edge; the "z" frames come from the same slow cycle.
    return { rows: drawGhost(mood === "sleep" ? { ...p, top: 5 } : p), colors: { o: "#D97757", y: "#FFD000", g: "#3DDC84", b: "#4DA3FF", z: "#4DA3FF", e: "#000000" } };
  }
  return { rows: draw(pose(mood, at)), colors: { "#": body, z: "#4DA3FF", e: "#000000" } };
}

/**
 * The mascot as a 12x16 bitmap at the left edge. The Claude one takes the "#RRGGBB" body colour,
 * the ghost is always a rainbow.
 */
export function mascot(id: string, mood: Mood, at: number, body: string, style: Style = "claude"): El {
  const sp = mascotSprite(mood, at, body, style);
  return xpm(id, sp.rows, 0, 0, sp.colors);
}
