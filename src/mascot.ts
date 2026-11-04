import type { El } from "./types";
import { xpm } from "./util";

export type Mood = "idle" | "work" | "dance" | "sleep";

type Arm = "up" | "mid" | "down";

interface Pose {
  /** rows the body is moved up (a hop); negative moves it down */
  lift?: number;
  armL?: Arm;
  armR?: Arm;
  /** eyes: open (looking ahead / aside / down), a blink, or shut */
  eyes?: "open" | "left" | "right" | "down" | "blink" | "shut";
  legs?: "stand" | "spread";
  /** a "z" of the given size above the head: 1 small, 2 large */
  z?: 0 | 1 | 2;
}

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
  const top = TOP - (p.lift || 0);
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
    set(x, top + 8, "#");
  });
  // Eyes are holes in the body.
  const e = p.eyes || "open";
  const shift = e === "left" ? -1 : e === "right" ? 1 : 0;
  const row = e === "down" ? 2 : 1;
  const hole = (x: number, y: number) => set(x, top + y, ".");
  if (e === "shut") {
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
  // "z": 3x4, or 4x5 when large.
  if (p.z === 1) ["###", "..#", ".#.", "###"].forEach((s, i) => s.split("").forEach((c, k) => c === "#" && set(9 + k, 1 + i, "z")));
  if (p.z === 2) ["####", "...#", "..#.", ".#..", "####"].forEach((s, i) => s.split("").forEach((c, k) => c === "#" && set(8 + k, i, "z")));
  return g.map((r) => r.join(""));
}

/** Which frame to draw at time `at` (ms); the bar moves it on by itself. */
export function pose(mood: Mood, at: number): Pose {
  const f = Math.floor(at / 500);
  if (mood === "work") {
    // Typing: the arms take turns, the eyes watch the work.
    return f % 2 === 0 ? { eyes: "down", armL: "mid", armR: "down" } : { eyes: "down", armL: "down", armR: "mid", lift: 0 };
  }
  if (mood === "dance") {
    const steps: Pose[] = [
      { armL: "up", armR: "up", lift: 1, legs: "stand" },
      { armL: "up", armR: "down", legs: "spread" },
      { armL: "down", armR: "down", lift: 1, legs: "stand" },
      { armL: "down", armR: "up", legs: "spread" },
    ];
    return steps[f % 4];
  }
  if (mood === "sleep") {
    // A slow cycle: nothing, a small z, a large one, a small one.
    const z = [0, 1, 2, 1][Math.floor(at / 1500) % 4] as 0 | 1 | 2;
    return { eyes: "shut", z, lift: -1 };
  }
  // Idle: mostly looking ahead, sometimes blinking or glancing aside.
  const t = f % 30;
  if (t === 9 || t === 10 || t === 24) return { eyes: "blink" };
  if (t >= 14 && t <= 16) return { eyes: "left" };
  if (t >= 19 && t <= 21) return { eyes: "right" };
  return {};
}

/** The mascot as a 12x16 bitmap at the left edge. */
export function mascot(id: string, mood: Mood, at: number): El {
  return xpm(id, draw(pose(mood, at)), 0, 0, { "#": "#D97757", z: "#B0B0B0" });
}
