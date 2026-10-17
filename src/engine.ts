// Pure Whiteout simulation (no DOM). Rules follow docs/features/descent-and-controls.md and yetis.md.
// step() advances one fixed 60 Hz tick and mutates the state in place (it runs 60 times a second);
// determinism comes from the seed plus the input sequence, so a run replays exactly.
import { createRng } from './rng';

/** All tuning in one place. Units are meters and seconds; +y is downhill, x = 0 is the slope's center line. */
export const CFG = {
  dt: 1 / 60,
  /** Meters per "screen", used for the yeti leash and meter. */
  screen: 40,

  cruise: 12,
  tuck: 18,
  accel: 8,
  decel: 10,
  brakeFactor: 0.5,
  /** Radians per second. Tucking turns at half rate. */
  turnRate: Math.PI * 1.6,
  tuckTurnRate: Math.PI * 0.8,
  maxAngle: Math.PI / 2,
  hikeSpeed: 1.5,

  hopAir: 0.6,
  rampAirMin: 0.7,
  rampAirPerCruise: 0.6,
  trickTime: 0.25,
  maxTricks: 3,
  trickStyle: [0, 50, 150, 400],
  crashTime: 1.4,
  /** Slowdown factor for riding through moguls on the ground. */
  mogulFactor: 0.55,
  skierR: 0.35,

  nearMissGap: 0.5,
  nearMissMinSpeed: 8,
  nearMissStyle: 25,
  /** Combo multiplier = min(maxMult, 1 + chain × multPerChain). */
  multPerChain: 0.5,
  maxMult: 4,

  slopeHalfWidth: 30,
  genHalfWidth: 48,
  band: 10,
  genAhead: 70,
  cullBehind: 70,
  /** Clear run-in at the start of the slope. */
  startClear: 30,

  yeti: {
    grace: 8,
    speed: 14,
    cross: 8,
    uphill: 4,
    /** Hard pursuer cap, always below clean tuck speed (yetis.md). */
    cap: 17.5,
    spawnBehind: 40,
    leash: 60,
    catchR: 1.0,
    eatTime: 2,
  },
};

export type ObstacleKind = 'tree' | 'rock' | 'stump' | 'moguls' | 'ramp' | 'dog';
type Effect = 'crash' | 'slow' | 'ramp';

export const KINDS: Record<ObstacleKind, { r: number; jumpable: boolean; effect: Effect; weight: number }> = {
  tree: { r: 0.7, jumpable: false, effect: 'crash', weight: 45 },
  rock: { r: 0.55, jumpable: true, effect: 'crash', weight: 12 },
  stump: { r: 0.45, jumpable: true, effect: 'crash', weight: 12 },
  moguls: { r: 1.3, jumpable: true, effect: 'slow', weight: 10 },
  ramp: { r: 0.9, jumpable: true, effect: 'ramp', weight: 6 },
  dog: { r: 0.45, jumpable: true, effect: 'crash', weight: 5 },
};

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  /** Dogs wander around x0. */
  x0: number;
  phase: number;
  /** Crashed into: ignored from then on, so you can get up and ski off. */
  hit: boolean;
  /** Moguls/ramp already used. */
  touched: boolean;
  /** Has scrolled past the skier (near-miss check done). */
  passed: boolean;
}

export type SkierState = 'ski' | 'crash' | 'eaten';

export interface Skier {
  x: number;
  y: number;
  /** 0 = straight downhill, negative = toward -x (left), ±π/2 = across the slope. */
  angle: number;
  speed: number;
  state: SkierState;
  tuck: boolean;
  brake: boolean;
  /** Seconds of airtime left; 0 on the ground. */
  air: number;
  airTotal: number;
  airKind: 'hop' | 'ramp';
  tricks: number;
  /** Seconds left in the current trick pose; landing while > 0 is a crash. */
  trickT: number;
  crashT: number;
}

export type YetiState = 'waiting' | 'chasing' | 'eating';

export interface Yeti {
  state: YetiState;
  x: number;
  y: number;
  vx: number;
  vy: number;
  timer: number;
}

export type GameEvent =
  | { type: 'jump' }
  | { type: 'ramp' }
  | { type: 'trick'; n: number }
  | { type: 'land'; tricks: number; style: number }
  | { type: 'crash'; kind: ObstacleKind | 'botched' }
  | { type: 'moguls' }
  | { type: 'nearMiss'; style: number }
  | { type: 'yetiSpawn' }
  | { type: 'eaten' }
  | { type: 'over' };

export interface Game {
  seed: number;
  tick: number;
  time: number;
  skier: Skier;
  yeti: Yeti;
  obstacles: Obstacle[];
  /** Next band index to generate. */
  nextBand: number;
  generate: boolean;
  /** Furthest downhill point reached; distance Style is 1 per meter of it. */
  maxY: number;
  /** Style from tricks and near misses (combo-multiplied). */
  skillStyle: number;
  /** Tricks and near misses since the last crash. */
  chain: number;
  over: boolean;
  /** Appended by step(); the UI drains it for sound, shake and toasts. */
  events: GameEvent[];
}

export interface Input {
  /** Touch: absolute target heading (radians). Takes precedence over turn. */
  targetAngle?: number;
  /** Keyboard: -1 left, 0, +1 right, turning at the turn rate. */
  turn: number;
  tuck: boolean;
  brake: boolean;
  /** Edge-triggered: true for the one tick the jump/trick was pressed. */
  jump: boolean;
}

export const NO_INPUT: Input = { turn: 0, tuck: false, brake: false, jump: false };

export function newGame(seed: number, opts: { generate?: boolean } = {}): Game {
  const g: Game = {
    seed: seed >>> 0,
    tick: 0,
    time: 0,
    skier: {
      x: 0, y: 0, angle: 0, speed: 0, state: 'ski', tuck: false, brake: false,
      air: 0, airTotal: 0, airKind: 'hop', tricks: 0, trickT: 0, crashT: 0,
    },
    yeti: { state: 'waiting', x: 0, y: -CFG.yeti.spawnBehind, vx: 0, vy: 0, timer: 0 },
    obstacles: [],
    nextBand: -Math.ceil(CFG.cullBehind / CFG.band),
    generate: opts.generate ?? true,
    maxY: 0,
    skillStyle: 0,
    chain: 0,
    over: false,
    events: [],
  };
  generateAhead(g);
  return g;
}

export const multiplier = (g: Game) => Math.min(CFG.maxMult, 1 + g.chain * CFG.multPerChain);
export const style = (g: Game) => Math.floor(g.maxY) + Math.floor(g.skillStyle);
export const distance = (g: Game) => Math.max(0, Math.floor(g.maxY));
export const airborne = (s: Skier) => s.air > 0;

/** 0 when the yeti is waiting or a full leash away, 1 when it's on you. */
export function yetiProximity(g: Game): number {
  const y = g.yeti;
  if (y.state === 'waiting') return 0;
  if (y.state === 'eating') return 1;
  const d = Math.hypot(g.skier.x - y.x, g.skier.y - y.y);
  return 1 - Math.min(1, d / CFG.yeti.leash);
}

// ---------- Slope generation ----------

/** Seed for one band: the slope is a pure function of (seed, band), independent of play timing. */
function bandSeed(seed: number, band: number): number {
  let h = (seed ^ Math.imul(band, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

function pickKind(r: number): ObstacleKind {
  const kinds = Object.keys(KINDS) as ObstacleKind[];
  const total = kinds.reduce((sum, k) => sum + KINDS[k].weight, 0);
  let t = r * total;
  for (const k of kinds) {
    t -= KINDS[k].weight;
    if (t < 0) return k;
  }
  return 'tree';
}

/** Obstacles for one 10 m band. Density rises with distance; outside the slope's edges it's dense forest. */
export function generateBand(seed: number, band: number): Obstacle[] {
  const rng = createRng(bandSeed(seed, band));
  const y0 = band * CFG.band;
  const out: Obstacle[] = [];
  let i = 0;
  const place = (kind: ObstacleKind, x: number, y: number, spacing: number) => {
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < spacing)) return;
    out.push({ id: band * 1000 + i++, kind, x, y, x0: x, phase: rng() * Math.PI * 2, hit: false, touched: false, passed: false });
  };

  // Forest beyond both edges keeps the slope bounded (Edge Yetis come later).
  const edgeWidth = CFG.genHalfWidth - CFG.slopeHalfWidth;
  const edgeCount = Math.floor(edgeWidth * 2 * CFG.band * 0.05 + rng());
  for (let n = 0; n < edgeCount; n++) {
    const side = rng() < 0.5 ? -1 : 1;
    place('tree', side * (CFG.slopeHalfWidth + rng() * edgeWidth), y0 + rng() * CFG.band, 1.6);
  }

  if (y0 + CFG.band <= CFG.startClear || y0 < 0) return out;
  const difficulty = Math.min(1, y0 / 2000);
  const density = 0.006 + 0.01 * difficulty;
  const count = Math.floor(CFG.slopeHalfWidth * 2 * CFG.band * density + rng());
  for (let n = 0; n < count; n++) {
    const y = y0 + rng() * CFG.band;
    if (y < CFG.startClear) continue;
    place(pickKind(rng()), (rng() * 2 - 1) * CFG.slopeHalfWidth, y, 2.5);
  }
  return out;
}

function generateAhead(g: Game) {
  if (!g.generate) return;
  const s = g.skier;
  while (g.nextBand * CFG.band < s.y + CFG.genAhead) {
    g.obstacles.push(...generateBand(g.seed, g.nextBand));
    g.nextBand++;
  }
  const behind = s.y - CFG.cullBehind;
  if (g.obstacles.length && g.obstacles[0].y < behind) g.obstacles = g.obstacles.filter((o) => o.y >= behind);
}

// ---------- Step ----------

export function step(g: Game, input: Input): void {
  if (g.over) return;
  g.tick++;
  g.time = g.tick * CFG.dt;
  generateAhead(g);
  for (const o of g.obstacles) {
    if (o.kind === 'dog' && !o.hit) o.x = o.x0 + Math.sin(g.time * 0.9 + o.phase) * 2.5;
  }
  updateSkier(g, input);
  updateYeti(g);
}

function crash(g: Game, kind: ObstacleKind | 'botched', o?: Obstacle) {
  const s = g.skier;
  s.state = 'crash';
  s.crashT = CFG.crashTime;
  s.speed = 0;
  s.air = 0;
  s.tricks = 0;
  s.trickT = 0;
  g.chain = 0;
  if (o) o.hit = o.passed = true;
  g.events.push({ type: 'crash', kind });
}

function updateSkier(g: Game, input: Input) {
  const s = g.skier;
  const dt = CFG.dt;
  if (s.state === 'eaten') return;
  if (s.state === 'crash') {
    s.crashT -= dt;
    if (s.crashT <= 0) s.state = 'ski';
    return;
  }

  const grounded = !airborne(s);
  s.brake = input.brake;
  s.tuck = input.tuck && !input.brake;

  // Steering: in the air you can still turn (it's a game, and it makes landings readable).
  const rate = (s.tuck && grounded ? CFG.tuckTurnRate : CFG.turnRate) * dt;
  if (input.targetAngle !== undefined) {
    const target = clamp(input.targetAngle, -CFG.maxAngle, CFG.maxAngle);
    s.angle += clamp(target - s.angle, -rate, rate);
  } else {
    s.angle = clamp(s.angle + input.turn * rate, -CFG.maxAngle, CFG.maxAngle);
  }

  let hike = 0;
  if (grounded) {
    let top = (s.tuck ? CFG.tuck : CFG.cruise) * Math.max(0, Math.cos(s.angle));
    if (s.brake) top *= CFG.brakeFactor;
    s.speed = s.speed < top ? Math.min(top, s.speed + CFG.accel * dt) : Math.max(top, s.speed - CFG.decel * dt);
    if (s.brake && s.speed < 0.3) hike = CFG.hikeSpeed;
    if (input.jump) {
      s.air = s.airTotal = CFG.hopAir;
      s.airKind = 'hop';
      g.events.push({ type: 'jump' });
    }
  } else {
    if (input.jump && s.tricks < CFG.maxTricks && s.trickT <= 0) {
      s.tricks++;
      s.trickT = CFG.trickTime;
      g.events.push({ type: 'trick', n: s.tricks });
    }
    s.trickT = Math.max(0, s.trickT - dt);
    s.air -= dt;
    if (s.air <= 0) {
      s.air = 0;
      if (s.trickT > 0) return crash(g, 'botched');
      if (s.tricks > 0) {
        const pts = CFG.trickStyle[s.tricks] * multiplier(g);
        g.skillStyle += pts;
        g.chain += s.tricks;
        g.events.push({ type: 'land', tricks: s.tricks, style: pts });
      }
      s.tricks = 0;
    }
  }

  s.x += s.speed * Math.sin(s.angle) * dt;
  s.y += s.speed * Math.cos(s.angle) * dt - hike * dt;
  if (s.y > g.maxY) g.maxY = s.y;

  for (const o of g.obstacles) {
    if (o.hit) continue;
    const k = KINDS[o.kind];
    const dx = o.x - s.x;
    const dy = o.y - s.y;
    if (Math.abs(dy) > 3) {
      if (!o.passed && dy < -3) o.passed = true;
      continue;
    }
    if (Math.hypot(dx, dy) < k.r + CFG.skierR) {
      if (airborne(s) && (k.jumpable || s.airKind === 'ramp')) continue;
      if (k.effect === 'crash') return crash(g, o.kind, o);
      if (o.touched) continue;
      o.touched = true;
      if (k.effect === 'slow') {
        s.speed *= CFG.mogulFactor;
        g.events.push({ type: 'moguls' });
      } else if (k.effect === 'ramp') {
        s.air = s.airTotal = CFG.rampAirMin + CFG.rampAirPerCruise * Math.min(1.2, s.speed / CFG.cruise);
        s.airKind = 'ramp';
        s.tricks = 0;
        g.events.push({ type: 'ramp' });
      }
    } else if (!o.passed && dy < 0) {
      // Just went by it: a near miss if it was close and we were moving.
      o.passed = true;
      if (k.effect === 'crash' && !airborne(s) && s.speed >= CFG.nearMissMinSpeed &&
          Math.abs(dx) < k.r + CFG.skierR + CFG.nearMissGap) {
        const pts = CFG.nearMissStyle * multiplier(g);
        g.skillStyle += pts;
        g.chain++;
        g.events.push({ type: 'nearMiss', style: pts });
      }
    }
  }
}

function updateYeti(g: Game) {
  const y = g.yeti;
  const s = g.skier;
  const Y = CFG.yeti;
  const dt = CFG.dt;
  if (y.state === 'waiting') {
    if (g.time < Y.grace) return;
    y.state = 'chasing';
    y.x = s.x;
    y.y = s.y - Y.spawnBehind;
    g.events.push({ type: 'yetiSpawn' });
    return;
  }
  if (y.state === 'eating') {
    y.timer -= dt;
    if (y.timer <= 0) {
      g.over = true;
      g.events.push({ type: 'over' });
    }
    return;
  }

  // Leash: never more than 1.5 screens away, so you can stay ahead of it but never lose it.
  if (s.y - y.y > Y.leash) y.y = s.y - Y.leash;
  if (Math.abs(s.x - y.x) > Y.leash) y.x = s.x - Math.sign(s.x - y.x) * Y.leash;

  const dx = s.x - y.x;
  const dy = s.y - y.y;
  const d = Math.hypot(dx, dy);
  if (d < Y.catchR && !airborne(s)) {
    s.state = 'eaten';
    s.speed = 0;
    y.state = 'eating';
    y.timer = Y.eatTime;
    y.x = s.x;
    y.y = s.y;
    y.vx = y.vy = 0;
    g.events.push({ type: 'eaten' });
    return;
  }
  // Head straight for the skier, with separate caps downhill / across / uphill, then the hard pursuer cap.
  let vx = d > 0 ? (dx / d) * Y.speed : 0;
  let vy = d > 0 ? (dy / d) * Y.speed : 0;
  vx = clamp(vx, -Y.cross, Y.cross);
  vy = clamp(vy, -Y.uphill, Y.speed);
  const v = Math.hypot(vx, vy);
  if (v > Y.cap) {
    vx *= Y.cap / v;
    vy *= Y.cap / v;
  }
  // Don't overshoot on the last step.
  const stepLen = v * dt;
  if (stepLen > d && d > 0) {
    vx = dx / dt;
    vy = dy / dt;
  }
  y.vx = vx;
  y.vy = vy;
  y.x += vx * dt;
  y.y += vy * dt;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
