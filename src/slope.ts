// Slope generation (descent-and-controls.md §Slope generation): hand-drawn chunks stitched under a
// difficulty budget, a tree line along both edges, and a validator that rejects any slope without a
// clean line fast enough to stay ahead of the yeti. Everything here is a pure function of (seed, params).
import { CELL, CHUNKS, CHUNK_COLS, CHUNK_ROWS, type Chunk } from './chunks';
import { createRng, type Rng } from './rng';

export type ObstacleKind = 'tree' | 'deadtree' | 'rock' | 'stump' | 'moguls' | 'ramp' | 'dog';
type Effect = 'crash' | 'slow' | 'ramp';

export const KINDS: Record<ObstacleKind, { r: number; jumpable: boolean; effect: Effect }> = {
  tree: { r: 0.7, jumpable: false, effect: 'crash' },
  deadtree: { r: 0.5, jumpable: true, effect: 'crash' },
  rock: { r: 0.55, jumpable: true, effect: 'crash' },
  stump: { r: 0.45, jumpable: true, effect: 'crash' },
  moguls: { r: 1.3, jumpable: true, effect: 'slow' },
  ramp: { r: 0.9, jumpable: true, effect: 'ramp' },
  dog: { r: 0.45, jumpable: true, effect: 'crash' },
};

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  /** Dogs wander ±DOG_WANDER around x0. */
  x0: number;
  phase: number;
  /** Crashed into or used up: ignored from then on, so you can get up and ski off. */
  hit: boolean;
  /** Moguls/ramp/jump-over effect already used. */
  touched: boolean;
  /** Has scrolled past the skier (near-miss check done). */
  passed: boolean;
  /** Dead tree set alight (Matchbook). */
  burning: boolean;
}

export const SLOPE = {
  /** Skiable half-width; the edge tree line stands just outside it. */
  halfWidth: 27,
  edgeLine: 27.5,
  forestTo: 46,
  startClear: 30,
  skierR: 0.35,
  dogWander: 2.5,
};

export type BossKind = 'big' | 'twins' | 'old';

/** Whole-slope modifiers (descent-and-controls.md §Conditions). */
export type Condition = 'powder' | 'ice' | 'night' | 'fog' | 'avalanche';

export const CONDITIONS: Record<Condition, {
  name: string;
  text: string;
  /** Skier top speeds (cruise and tuck) — only ever lowered together with the pursuers' (the pursuer rule). */
  speedMult: number;
  yetiMult: number;
  crashMult: number;
  turnMult: number;
  /**
   * Avalanche: a wall replaces the yeti. Starts at `start` m/s, reaches `max` over `ramp` s, and (with `leash`)
   * is never more than that many meters behind you once it arrives.
   */
  wall?: { start: number; max: number; ramp: number; leash?: number };
}> = {
  powder: { name: 'Powder', text: 'Deep snow: you and the yeti are 20% slower, and crashes are softer.', speedMult: 0.8, yetiMult: 0.8, crashMult: 0.7, turnMult: 1 },
  ice: { name: 'Ice', text: 'Hard ice: every turn is 25% slower.', speedMult: 1, yetiMult: 1, crashMult: 1, turnMult: 0.75 },
  night: { name: 'Night', text: 'You can only see what your headlamp lights up.', speedMult: 1, yetiMult: 1, crashMult: 1, turnMult: 1 },
  fog: { name: 'Fog', text: 'Obstacles appear late out of the fog. Watch the yeti meter.', speedMult: 1, yetiMult: 1, crashMult: 1, turnMult: 1 },
  avalanche: { name: 'Avalanche', text: 'No yeti. An avalanche right on your heels, nearly as fast as your tuck: you\'ll want speed and control Gear, and a clean run. Pays triple Tokens and two rares.', speedMult: 1, yetiMult: 1, crashMult: 1, turnMult: 1, wall: { start: 16.5, max: 17, ramp: 10, leash: 10 } },
};
export const CONDITION_IDS = Object.keys(CONDITIONS) as Condition[];

export interface SlopeParams {
  /** Meters from the start to the finish gate (Infinity for an endless slope). */
  length: number;
  /** Base chunk difficulty, 1–10. Rises across the run. */
  difficulty: number;
  /** 0, 1, 2. Changes the tree mix. */
  mountain: number;
  yetiSpeed: number;
  grace: number;
  /** A Summit: the boss replaces the yeti. */
  boss?: BossKind;
  condition?: Condition;
  /** Slalom gates along the clean line: a section mid-slope, or a whole course (the Slalom bonus stage, no pursuer). */
  gates?: 'section' | 'course';
  /** Altitude: every pursuer on this slope runs this much faster (still under the cap). */
  yetiMult?: number;
}

export interface Slope {
  obstacles: Obstacle[];
  /** The validator's clean line: x at each meter from the start, or null for an unvalidated slope. */
  line: number[] | null;
  chunks: string[];
  /** Layouts tried before one passed (1 = first try). */
  attempts: number;
  /** No layout passed; a corridor was cleared instead. */
  fallback: boolean;
}

const CHUNK_H = CHUNK_ROWS * CELL;
/** Open snow between chunks, so a corridor that exits on one side can reach the next chunk's entry. */
const SEAM = 8;
const PITCH = CHUNK_H + SEAM;
const MAX_ATTEMPTS = 24;
/** Share of trees that are dead (jumpable, burnable) on each mountain. */
const DEAD_SHARE = [0.08, 0.25, 0.15];
/**
 * Loose obstacles per m² of open snow. Heaviest on easy slopes, whose chunks are mostly open, and
 * thinning on hard slopes, whose dense chunks already set the challenge.
 */
const SCATTER_BASE = 0.06;
const SCATTER_PER_DIFFICULTY = -0.012;
/** A chunk with this many obstacles gets no scatter (its corridors are designed). */
const SCATTER_FULL_CHUNK = 150;
/** Scatter keeps this far from anything already placed, so it never seals a designed gap. */
const SCATTER_CLEARANCE = 2.2;
const CELL_KIND: Record<string, ObstacleKind> = { T: 'tree', D: 'deadtree', r: 'rock', s: 'stump', m: 'moguls', R: 'ramp', d: 'dog' };

/** Validator tuning: how much room a clean line keeps, and how fast it can traverse. */
export const LINE = {
  col: 0.5,
  /** Extra clearance beyond the hitbox. */
  margin: 0.75,
  /** Max sideways meters per meter downhill (45°). */
  maxShift: 1,
  /** The yeti must never get closer than this to a skier holding the line in a tuck. */
  minGap: 12,
  /** A leashed avalanche starts this close anyway; it just must never gain on a skier holding the line. */
  minGapLeashed: 3,
};

export function mix(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 0x632be5ab, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function buildSlope(seed: number, params: SlopeParams, tuck: number): Slope {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng(mix(seed, attempt));
    const { obstacles, chunks } = layout(rng, params);
    if (!Number.isFinite(params.length)) return { obstacles, line: null, chunks, attempts: attempt + 1, fallback: false };
    // On Ice the skier turns slower, so the line must be straighter (at most ~27° instead of 45°).
    const line = findLine(obstacles, params.length, 0, params.condition === 'ice' ? LINE.maxShift / 2 : LINE.maxShift);
    // Validate against the conditions the skier will actually face: Powder slows both sides, an Avalanche
    // is modeled as a pursuer already at its top speed (generous to the avalanche).
    const c = params.condition ? CONDITIONS[params.condition] : null;
    const chaser = c?.wall ? c.wall.max : Math.min(17.5, params.yetiSpeed * (c?.yetiMult ?? 1) * (params.yetiMult ?? 1));
    const leash = c?.wall?.leash;
    const ok = params.gates === 'course'
      ? line !== null
      : line && chaseGap(line, tuck * (c?.speedMult ?? 1), chaser, params.grace, params.boss ? BOSS_HOLD : undefined, leash) >= (leash ? LINE.minGapLeashed : LINE.minGap);
    if (line && ok) {
      return { obstacles, line, chunks, attempts: attempt + 1, fallback: false };
    }
  }
  // Nothing passed: clear a straight corridor down the middle of the last layout.
  const { obstacles, chunks } = layout(createRng(mix(seed, MAX_ATTEMPTS)), params);
  const kept = obstacles.filter((o) => Math.abs(o.x) > 3 || KINDS[o.kind].effect === 'slow');
  return { obstacles: kept, line: new Array(Math.ceil(params.length) + 1).fill(0), chunks, attempts: MAX_ATTEMPTS, fallback: true };
}

/** Which chunks go where: warm-up, crux, final sprint (difficulty budget). */
export function pickChunks(rng: Rng, params: SlopeParams): Chunk[] {
  const out: Chunk[] = [];
  const end = Number.isFinite(params.length) ? params.length : SLOPE.startClear + PITCH * 40;
  let prev: Chunk | null = null;
  for (let y = SLOPE.startClear; y + CHUNK_H <= end; y += PITCH) {
    const p = (y - SLOPE.startClear) / Math.max(1, end - SLOPE.startClear);
    const target = clamp(params.difficulty + (p < 0.15 ? -1 : p < 0.75 ? 1 : 0), 1, 10);
    const ok = (c: Chunk) => c !== prev && !(prev && prev.difficulty >= 8 && c.difficulty >= 8);
    let pool = CHUNKS.filter((c) => ok(c) && Math.abs(c.difficulty - target) <= 1);
    if (!pool.length) {
      const near = Math.min(...CHUNKS.filter(ok).map((c) => Math.abs(c.difficulty - target)));
      pool = CHUNKS.filter((c) => ok(c) && Math.abs(c.difficulty - target) === near);
    }
    prev = pool[Math.floor(rng() * pool.length)];
    out.push(prev);
  }
  return out;
}

function layout(rng: Rng, params: SlopeParams): { obstacles: Obstacle[]; chunks: string[] } {
  const obstacles: Obstacle[] = [];
  let id = 0;
  const add = (kind: ObstacleKind, x: number, y: number) =>
    obstacles.push({ id: id++, kind, x, y, x0: x, phase: rng() * Math.PI * 2, hit: false, touched: false, passed: false, burning: false });

  const chunks = pickChunks(rng, params);
  const dead = DEAD_SHARE[params.mountain] ?? 0.1;
  // Regions of the slope and how much scatter each takes: chunks by how busy they are, seams fully.
  const regions: { y0: number; y1: number; share: number }[] = [];
  chunks.forEach((chunk, i) => {
    const y0 = SLOPE.startClear + i * PITCH;
    const count = chunk.rows.join('').replace(/\./g, '').length;
    regions.push({ y0, y1: y0 + CHUNK_H, share: Math.max(0, 1 - count / SCATTER_FULL_CHUNK) }, { y0: y0 + CHUNK_H, y1: y0 + PITCH, share: 1 });
    const mirror = rng() < 0.5;
    chunk.rows.forEach((row, r) => {
      for (let c = 0; c < CHUNK_COLS; c++) {
        let kind = CELL_KIND[row[c]];
        if (!kind) continue;
        if (kind === 'tree' && rng() < dead) kind = 'deadtree';
        const col = mirror ? CHUNK_COLS - 1 - c : c;
        const jitter = kind === 'moguls' || kind === 'ramp' ? 0 : 0.8;
        add(kind, -29 + col * CELL + (rng() - 0.5) * jitter, y0 + 1 + r * CELL + (rng() - 0.5) * jitter);
      }
    });
  });

  // Scatter: loose trees, rocks and stumps in the open snow, so no slope is an empty meadow.
  const length = Number.isFinite(params.length) ? params.length : SLOPE.startClear + PITCH * 40;
  const lastY = SLOPE.startClear + chunks.length * PITCH;
  if (lastY < length) regions.push({ y0: lastY, y1: length, share: 1 });
  const grid = new Map<string, Obstacle[]>();
  const key = (x: number, y: number) => `${Math.floor(x / SCATTER_CLEARANCE)},${Math.floor(y / SCATTER_CLEARANCE)}`;
  for (const o of obstacles) {
    const k = key(o.x0, o.y);
    grid.set(k, [...(grid.get(k) ?? []), o]);
  }
  const clear = (x: number, y: number) => {
    const gx = Math.floor(x / SCATTER_CLEARANCE);
    const gy = Math.floor(y / SCATTER_CLEARANCE);
    for (let i = gx - 1; i <= gx + 1; i++) {
      for (let j = gy - 1; j <= gy + 1; j++) {
        for (const o of grid.get(`${i},${j}`) ?? []) {
          const reach = SCATTER_CLEARANCE + (o.kind === 'dog' ? SLOPE.dogWander : 0) + (o.kind === 'moguls' || o.kind === 'ramp' ? 1 : 0);
          if (Math.hypot(Math.max(0, Math.abs(o.x0 - x)), o.y - y) < reach) return false;
        }
      }
    }
    return true;
  };
  const density = Math.max(0, SCATTER_BASE + SCATTER_PER_DIFFICULTY * params.difficulty);
  for (const reg of regions) {
    const count = Math.floor((reg.y1 - reg.y0) * SLOPE.halfWidth * 2 * density * reg.share + rng());
    for (let n = 0; n < count; n++) {
      const x = (rng() * 2 - 1) * (SLOPE.halfWidth - 1.5);
      const y = reg.y0 + rng() * (reg.y1 - reg.y0);
      const r = rng();
      let kind: ObstacleKind = r < 0.68 ? 'tree' : r < 0.82 ? 'rock' : r < 0.94 ? 'stump' : r < 0.97 ? 'moguls' : 'ramp';
      if (kind === 'tree' && rng() < dead) kind = 'deadtree';
      if (!clear(x, y)) continue;
      add(kind, x, y);
      const o = obstacles[obstacles.length - 1];
      const k = key(x, y);
      grid.set(k, [...(grid.get(k) ?? []), o]);
    }
  }

  // Edge: a tree line just outside the skiable width, then open forest beyond it.
  const end = Number.isFinite(params.length) ? params.length + 80 : SLOPE.startClear + PITCH * 40;
  for (let y = -80; y < end; y += 2) {
    for (const side of [-1, 1]) {
      add('tree', side * (SLOPE.edgeLine + rng() * 0.3), y + (rng() - 0.5) * 0.4);
      if (rng() < 0.55) add('tree', side * (SLOPE.edgeLine + 2 + rng() * (SLOPE.forestTo - SLOPE.edgeLine - 2)), y + rng() * 2);
    }
  }
  obstacles.sort((a, b) => a.y - b.y || a.x - b.x);
  return { obstacles, chunks: chunks.map((c) => c.name) };
}

/**
 * Cheapest clean line from the start (x = 0) to the finish: one x per meter downhill, never closer to a
 * crash obstacle (or ramp) than its hitbox plus margin, turning at most 45°. Moguls cost extra but are allowed.
 * Returns null when no such line exists.
 */
export function findLine(obstacles: Obstacle[], length: number, from = 0, maxShift = LINE.maxShift): number[] | null {
  const half = SLOPE.halfWidth;
  const n = Math.round((2 * half) / LINE.col) + 1;
  const rows = Math.ceil(length - from) + 1;
  const K = Math.max(1, Math.round(maxShift / LINE.col));
  const blocked = new Uint8Array(rows * n);
  const soft = new Uint8Array(rows * n);
  const xAt = (c: number) => -half + c * LINE.col;

  for (const o of obstacles) {
    if (o.y < from - 3 || o.y > from + rows + 3) continue;
    const k = KINDS[o.kind];
    const isSoft = k.effect === 'slow';
    const rad = k.r + SLOPE.skierR + (isSoft ? 0 : LINE.margin);
    const wander = o.kind === 'dog' ? SLOPE.dogWander : 0;
    const r0 = Math.max(0, Math.floor(o.y - from - rad));
    const r1 = Math.min(rows - 1, Math.ceil(o.y - from + rad));
    const c0 = Math.max(0, Math.floor((o.x0 - wander - rad + half) / LINE.col));
    const c1 = Math.min(n - 1, Math.ceil((o.x0 + wander + rad + half) / LINE.col));
    for (let r = r0; r <= r1; r++) {
      const dy = from + r - o.y;
      for (let c = c0; c <= c1; c++) {
        const dx = Math.max(0, Math.abs(xAt(c) - o.x0) - wander);
        if (dx * dx + dy * dy < rad * rad) (isSoft ? soft : blocked)[r * n + c] = 1;
      }
    }
  }

  // State = (column, sideways step taken into it). The step may change by at most one column per meter,
  // so the line curves smoothly enough for a skier (and the bot) to actually follow it.
  const S = 2 * K + 1;
  let cost = new Float32Array(n * S).fill(Infinity);
  const start = Math.round(half / LINE.col);
  if (blocked[start]) return null;
  cost[start * S + K] = 0;
  const prev = new Int32Array(rows * n * S).fill(-1);
  for (let r = 1; r < rows; r++) {
    const next = new Float32Array(n * S).fill(Infinity);
    for (let c = 0; c < n; c++) {
      if (blocked[r * n + c]) continue;
      const extra = soft[r * n + c] ? 3 : 0;
      for (let d = -K; d <= K; d++) {
        const p = c - d;
        if (p < 0 || p >= n) continue;
        let best = Infinity;
        let arg = -1;
        for (let dp = Math.max(-K, d - 1); dp <= Math.min(K, d + 1); dp++) {
          const v = cost[p * S + dp + K] + Math.abs(d) * LINE.col + Math.abs(d - dp) * 0.3;
          if (v < best) {
            best = v;
            arg = p * S + dp + K;
          }
        }
        if (arg < 0 || best === Infinity) continue;
        next[c * S + d + K] = best + extra;
        prev[(r * n + c) * S + d + K] = arg;
      }
    }
    cost = next;
  }
  let end = -1;
  for (let i = 0; i < n * S; i++) if (cost[i] < Infinity && (end < 0 || cost[i] < cost[end])) end = i;
  if (end < 0) return null;
  const line = new Array<number>(rows);
  for (let r = rows - 1, i = end; r >= 0; r--) {
    line[r] = xAt(Math.floor(i / S));
    i = prev[(r * n + Math.floor(i / S)) * S + (i % S)];
  }
  return line;
}

/** Where a Summit boss waits at the start (mirrors CFG.yeti.bossHold in the engine). */
export const BOSS_HOLD = -6;

/**
 * Closest the yeti gets to a skier holding `line` in a clean tuck (accelerating from a standstill).
 * One-dimensional and slightly generous to the yeti: it runs straight downhill at full speed.
 * A normal yeti appears 40 m behind the skier when the grace ends; a boss starts from `holdAt`.
 */
/** The closest the pursuer gets to a skier holding the line in a tuck (a leashed one starts `leash` behind). */
export function chaseGap(line: number[], tuck: number, yetiSpeed: number, grace: number, holdAt?: number, leash?: number): number {
  const dt = 0.05;
  let y = 0;
  let v = 0;
  let t = 0;
  let yetiY = -Infinity;
  let gap = Infinity;
  const end = line.length - 1;
  while (y < end) {
    const i = Math.min(end - 1, Math.floor(y));
    const slope = line[i + 1] - line[i];
    const top = tuck * Math.cos(Math.atan(slope));
    v = Math.min(top, v + 8 * dt);
    y += v * dt;
    t += dt;
    if (t >= grace) {
      if (yetiY === -Infinity) yetiY = holdAt ?? y - (leash ?? 40);
      yetiY = Math.max(yetiY + yetiSpeed * dt, y - (leash ?? 60));
      gap = Math.min(gap, y - yetiY);
    }
    if (t > 600) return 0;
  }
  return gap;
}

export interface Gate {
  x: number;
  y: number;
  /** Gap between the poles, meters. */
  w: number;
  passed: boolean;
  made: boolean;
}

export const GATES = { width: 3.6, sectionEvery: 22, courseEvery: 17 };

/** Slalom gates centered on the clean line, so following the gates is a safe way down. */
export function placeGates(line: number[] | null, kind: 'section' | 'course' | undefined, length: number): Gate[] {
  if (!line || !kind || !Number.isFinite(length)) return [];
  const [from, to, every] = kind === 'course' ? [40, length - 30, GATES.courseEvery] : [length * 0.35, length * 0.7, GATES.sectionEvery];
  const gates: Gate[] = [];
  for (let y = Math.round(from); y <= to; y += every) gates.push({ x: line[y], y, w: GATES.width, passed: false, made: false });
  return gates;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
