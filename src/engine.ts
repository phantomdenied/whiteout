// Pure Whiteout simulation (no DOM). Rules follow docs/features/descent-and-controls.md and yetis.md.
// step() advances one fixed 60 Hz tick and mutates the state in place (it runs 60 times a second);
// determinism comes from the seed plus the input sequence, so a run replays exactly.
import { BASE_MODS, type Mods } from './gear';
import { KINDS, type Obstacle, type ObstacleKind, SLOPE, type SlopeParams, buildSlope } from './slope';

export { KINDS, type Obstacle, type ObstacleKind } from './slope';

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
  /** Speed boost (Rocket Boots, Good Boy, foraging): top speed × this, accelerating twice as fast. */
  boostMult: 1.4,

  hopAir: 0.6,
  springAir: 1.1,
  rampAirMin: 0.7,
  rampAirPerCruise: 0.6,
  trickTime: 0.25,
  maxTricks: 3,
  trickStyle: [0, 50, 150, 400],
  crashTime: 1.4,
  /** Slowdown factor for riding through moguls on the ground. */
  mogulFactor: 0.55,
  skierR: SLOPE.skierR,

  nearMissGap: 0.5,
  nearMissMinSpeed: 8,
  nearMissStyle: 25,
  /** Combo multiplier = min(maxMult, 1 + chain × multPerChain). Only trick and near-miss Style is multiplied. */
  multPerChain: 0.5,
  maxMult: 4,
  /** Tokens = Style ÷ this, paid at the finish gate. */
  styleRate: 200,

  yeti: {
    grace: 8,
    speed: 14,
    cross: 8,
    uphill: 4,
    /** Hard pursuer cap, always below clean tuck speed (yetis.md). */
    cap: 17.5,
    minGrace: 3,
    spawnBehind: 40,
    leash: 60,
    catchR: 1.0,
    eatTime: 2,
    /** Max stagger per slope. */
    staggerCap: 3,
  },
};

/** An endless M0-style slope, used by tests and as a sandbox. */
export const ENDLESS: SlopeParams = { length: Infinity, difficulty: 3, mountain: 0, yetiSpeed: CFG.yeti.speed, grace: CFG.yeti.grace };

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
  boostT: number;
}

export type YetiState = 'waiting' | 'chasing' | 'eating';

export interface Yeti {
  state: YetiState;
  x: number;
  y: number;
  vx: number;
  vy: number;
  timer: number;
  stunT: number;
}

export type GameEvent =
  | { type: 'jump' }
  | { type: 'ramp' }
  | { type: 'trick'; n: number }
  | { type: 'land'; tricks: number; style: number }
  | { type: 'crash'; kind: ObstacleKind | 'botched' }
  | { type: 'bounce' }
  | { type: 'moguls' }
  | { type: 'nearMiss'; style: number }
  | { type: 'burn' }
  | { type: 'forage' }
  | { type: 'goodBoy' }
  | { type: 'yetiSpawn' }
  | { type: 'eaten' }
  | { type: 'finish' }
  | { type: 'over' };

export interface Game {
  seed: number;
  params: SlopeParams;
  mods: Mods;
  tick: number;
  time: number;
  skier: Skier;
  yeti: Yeti;
  /** Sorted by y. */
  obstacles: Obstacle[];
  /** The generator's clean line (x per meter), or null. */
  line: number[] | null;
  /** Furthest downhill point reached; distance Style is 1 per meter of it. */
  maxY: number;
  /** Style from tricks and near misses (combo-multiplied). */
  skillStyle: number;
  /** Tricks and near misses since the last crash. */
  chain: number;
  bonusTokens: number;
  staggerUsed: number;
  bouncesLeft: number;
  result: 'cleared' | 'eaten' | null;
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

export interface GameOptions {
  params?: SlopeParams;
  mods?: Mods;
  /** Hand-placed obstacles instead of a generated slope (tests). */
  obstacles?: Obstacle[];
}

export function newGame(seed: number, opts: GameOptions = {}): Game {
  const params = opts.params ?? ENDLESS;
  const mods = opts.mods ?? BASE_MODS;
  const slope = opts.obstacles ? { obstacles: [...opts.obstacles].sort((a, b) => a.y - b.y), line: null } : buildSlope(seed, params, CFG.tuck);
  return {
    seed: seed >>> 0,
    params,
    mods,
    tick: 0,
    time: 0,
    skier: {
      x: 0, y: 0, angle: 0, speed: 0, state: 'ski', tuck: false, brake: false,
      air: 0, airTotal: 0, airKind: 'hop', tricks: 0, trickT: 0, crashT: 0, boostT: 0,
    },
    yeti: { state: 'waiting', x: 0, y: -CFG.yeti.spawnBehind, vx: 0, vy: 0, timer: 0, stunT: 0 },
    obstacles: slope.obstacles,
    line: slope.line,
    maxY: 0,
    skillStyle: 0,
    chain: 0,
    bonusTokens: 0,
    staggerUsed: 0,
    bouncesLeft: mods.bounces,
    result: null,
    over: false,
    events: [],
  };
}

export const multiplier = (g: Game) => Math.min(CFG.maxMult, 1 + g.chain * CFG.multPerChain);
export const style = (g: Game) => Math.floor(g.maxY) + Math.floor(g.skillStyle);
export const distance = (g: Game) => Math.max(0, Math.floor(g.maxY));
export const tokens = (g: Game) => Math.floor(style(g) / CFG.styleRate) + g.bonusTokens;
export const airborne = (s: Skier) => s.air > 0;
export const graceFor = (g: Game) => Math.max(CFG.yeti.minGrace, g.params.grace + g.mods.graceAdd);
export const yetiSpeedFor = (g: Game) => Math.min(CFG.yeti.cap, g.params.yetiSpeed * g.mods.yetiSpeedMult);

/** 0 when the yeti is waiting or a full leash away, 1 when it's on you. */
export function yetiProximity(g: Game): number {
  const y = g.yeti;
  if (y.state === 'waiting') return 0;
  if (y.state === 'eating') return 1;
  const d = Math.hypot(g.skier.x - y.x, g.skier.y - y.y);
  return 1 - Math.min(1, d / CFG.yeti.leash);
}

/** Index of the first obstacle with y >= minY (obstacles are sorted by y). */
export function firstAtOrBelow(obstacles: Obstacle[], minY: number): number {
  let lo = 0;
  let hi = obstacles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (obstacles[mid].y < minY) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------- Step ----------

export function step(g: Game, input: Input): void {
  if (g.over) return;
  g.tick++;
  g.time = g.tick * CFG.dt;
  const s = g.skier;
  for (let i = firstAtOrBelow(g.obstacles, s.y - 60); i < g.obstacles.length && g.obstacles[i].y < s.y + 60; i++) {
    const o = g.obstacles[i];
    if (o.kind === 'dog' && !o.hit) o.x = o.x0 + Math.sin(g.time * 0.9 + o.phase) * SLOPE.dogWander;
  }
  updateSkier(g, input);
  if (g.over) return;
  updateYeti(g);
}

function crash(g: Game, kind: ObstacleKind | 'botched', o?: Obstacle) {
  const s = g.skier;
  if (o) o.hit = o.passed = true;
  if (g.bouncesLeft > 0) {
    g.bouncesLeft--;
    s.speed *= 0.4;
    s.air = 0;
    s.tricks = 0;
    s.trickT = 0;
    g.events.push({ type: 'bounce' });
    return;
  }
  s.state = 'crash';
  s.crashT = CFG.crashTime * g.mods.crashTimeMult;
  s.speed = 0;
  s.air = 0;
  s.tricks = 0;
  s.trickT = 0;
  s.boostT = 0;
  g.chain = 0;
  g.events.push({ type: 'crash', kind });
}

function stagger(g: Game, seconds: number) {
  const amount = Math.min(seconds, CFG.yeti.staggerCap - g.staggerUsed);
  if (amount <= 0 || g.yeti.state !== 'chasing') return;
  g.staggerUsed += amount;
  g.yeti.stunT += amount;
}

function updateSkier(g: Game, input: Input) {
  const s = g.skier;
  const m = g.mods;
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
  s.boostT = Math.max(0, s.boostT - dt);

  // Steering: in the air you can still turn (it's a game, and it makes landings readable).
  const rate = (grounded ? (s.tuck ? CFG.tuckTurnRate * m.tuckTurnMult : CFG.turnRate) : CFG.turnRate * m.airTurnMult) * dt;
  if (input.targetAngle !== undefined) {
    const target = clamp(input.targetAngle, -CFG.maxAngle, CFG.maxAngle);
    s.angle += clamp(target - s.angle, -rate, rate);
  } else {
    s.angle = clamp(s.angle + input.turn * rate, -CFG.maxAngle, CFG.maxAngle);
  }

  let hike = 0;
  if (grounded) {
    let top = (s.tuck ? CFG.tuck * m.tuckMult : CFG.cruise) * Math.max(0, Math.cos(s.angle));
    if (s.brake) top *= CFG.brakeFactor;
    const boosting = s.boostT > 0;
    if (boosting) top *= CFG.boostMult;
    const accel = CFG.accel * (boosting ? 2 : 1);
    s.speed = s.speed < top ? Math.min(top, s.speed + accel * dt) : Math.max(top, s.speed - CFG.decel * dt);
    if (s.brake && s.speed < 0.3) hike = CFG.hikeSpeed;
    if (input.jump) {
      s.air = s.airTotal = m.springHop ? CFG.springAir : CFG.hopAir;
      s.airKind = m.springHop ? 'ramp' : 'hop';
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

  if (s.y >= g.params.length) {
    g.result = 'cleared';
    g.over = true;
    g.events.push({ type: 'finish' }, { type: 'over' });
    return;
  }

  const obs = g.obstacles;
  for (let i = firstAtOrBelow(obs, s.y - 3); i < obs.length && obs[i].y <= s.y + 3; i++) {
    const o = obs[i];
    if (o.hit) continue;
    const k = KINDS[o.kind];
    const dx = o.x - s.x;
    const dy = o.y - s.y;
    if (Math.hypot(dx, dy) < k.r + CFG.skierR) {
      if (airborne(s) && (k.jumpable || s.airKind === 'ramp')) {
        // Jumped over it: Gear hooks.
        if (o.touched) continue;
        if (o.kind === 'deadtree' && m.matchbook) {
          o.touched = o.burning = o.hit = true;
          stagger(g, 1);
          g.events.push({ type: 'burn' });
        } else if (o.kind === 'stump' && m.forager) {
          o.touched = o.hit = true;
          g.bonusTokens++;
          s.boostT = Math.max(s.boostT, 1.5);
          g.events.push({ type: 'forage' });
        }
        continue;
      }
      if (o.kind === 'dog' && m.goodBoy) {
        o.hit = o.passed = true;
        s.boostT = Math.max(s.boostT, 1);
        g.events.push({ type: 'goodBoy' });
        continue;
      }
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
        if (m.nearMissBoost > 0) s.boostT = Math.max(s.boostT, m.nearMissBoost);
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
    if (g.time < graceFor(g)) return;
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
  if (y.stunT > 0) {
    y.stunT = Math.max(0, y.stunT - dt);
    y.vx = y.vy = 0;
    return;
  }

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
    g.result = 'eaten';
    g.events.push({ type: 'eaten' });
    return;
  }
  // Head straight for the skier, with separate caps downhill / across / uphill, then the hard pursuer cap.
  const speed = yetiSpeedFor(g);
  let vx = d > 0 ? (dx / d) * speed : 0;
  let vy = d > 0 ? (dy / d) * speed : 0;
  vx = clamp(vx, -Y.cross, Y.cross);
  vy = clamp(vy, -Y.uphill, speed);
  const v = Math.hypot(vx, vy);
  if (v > Y.cap) {
    vx *= Y.cap / v;
    vy *= Y.cap / v;
  }
  // Don't overshoot on the last step.
  if (v * dt > d && d > 0) {
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
