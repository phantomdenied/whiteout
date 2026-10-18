// Pure Whiteout simulation (no DOM). Rules follow docs/features/descent-and-controls.md and yetis.md.
// step() advances one fixed 60 Hz tick and mutates the state in place (it runs 60 times a second);
// determinism comes from the seed plus the input sequence, so a run replays exactly.
import { BASE_MODS, type Mods, type SnackId } from './gear';
import { BOSS_HOLD, type BossKind, CONDITIONS, KINDS, type Obstacle, type ObstacleKind, SLOPE, type SlopeParams, buildSlope } from './slope';

export { type BossKind, CONDITIONS, type Condition, KINDS, type Obstacle, type ObstacleKind } from './slope';

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
  /** Speed boost (Rocket Boots, Good Boy, foraging, Cocoa…): top speed × this, accelerating twice as fast. */
  boostMult: 1.4,

  hopAir: 0.6,
  springAir: 1.1,
  rampAirMin: 0.7,
  rampAirPerCruise: 0.6,
  trickTime: 0.25,
  maxTricks: 3,
  trickStyle: [0, 50, 150, 400],
  crashTime: 1.4,
  warmerCrashTime: 0.3,
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
  /** Close Call: finish with the yeti meter above this. */
  closeCall: 0.8,
  mapRange: 200,

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
    /** Where a boss (and the avalanche front) waits at the start, so you see it as you drop in. */
    bossHold: BOSS_HOLD,
    wallHold: BOSS_HOLD,
  },
};

export type YetiLook = 'yeti' | 'big' | 'twin' | 'old';

/** Summit bosses (yetis.md §Summit bosses). Speeds stay under the pursuer cap. */
export const BOSSES: Record<BossKind, {
  name: string;
  twist: string;
  yetis: { dx: number; speed: number; cross: number; look: YetiLook }[];
  /** Avalanche wall: starts at `start` m/s and reaches `max` over `ramp` seconds. */
  wall?: { start: number; max: number; ramp: number };
}> = {
  big: {
    name: 'Big Yeti',
    twist: 'Faster than any yeti so far, and it runs straight through whatever is in its way.',
    yetis: [{ dx: 0, speed: 16, cross: 9, look: 'big' }],
  },
  twins: {
    name: 'The Twins',
    twist: 'Two yetis, one from each side, and they are quick across the slope.',
    yetis: [
      { dx: -9, speed: 15.5, cross: 12, look: 'twin' },
      { dx: 9, speed: 15.5, cross: 12, look: 'twin' },
    ],
  },
  old: {
    name: 'The Old One',
    twist: 'An avalanche is coming down behind you, and something is riding it.',
    yetis: [{ dx: 0, speed: 16.5, cross: 9, look: 'old' }],
    wall: { start: 10, max: 15, ramp: 30 },
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
  /** Seconds of unbroken grounded tuck (Downhill Suit). */
  tuckT: number;
}

/** holding: a boss, visible and waiting out the grace period. */
export type YetiState = 'waiting' | 'holding' | 'chasing' | 'eating';

export interface Yeti {
  state: YetiState;
  look: YetiLook;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  cross: number;
  /** Spawn offset from the skier's x. */
  dx: number;
  timer: number;
  stunT: number;
}

export interface Wall {
  /** An Avalanche Condition's wall appears (40 m back) only when the grace ends; the Old One's waits in view. */
  armed: boolean;
  y: number;
  v: number;
  start: number;
  max: number;
  ramp: number;
}

export type GameEvent =
  | { type: 'jump' }
  | { type: 'ramp' }
  | { type: 'trick'; n: number }
  | { type: 'land'; tricks: number; style: number }
  | { type: 'safeLanding' }
  | { type: 'crash'; kind: ObstacleKind | 'botched' }
  | { type: 'bounce' }
  | { type: 'moguls' }
  | { type: 'nearMiss'; style: number; dog: boolean }
  | { type: 'burn' }
  | { type: 'forage' }
  /** The old secret: skiing backwards uphill over a stump turns it into a mushroom. */
  | { type: 'mushroom' }
  | { type: 'goodBoy' }
  | { type: 'token'; n: number; why: string }
  | { type: 'snack'; id: SnackId }
  | { type: 'yetiSpawn' }
  | { type: 'eaten' }
  | { type: 'buried' }
  | { type: 'closeCall' }
  | { type: 'finish' }
  | { type: 'over' };

export interface Game {
  seed: number;
  params: SlopeParams;
  mods: Mods;
  tick: number;
  time: number;
  skier: Skier;
  /** Every pursuer on this slope (bosses can bring more than one). */
  yetis: Yeti[];
  /** The first pursuer (convenience for single-yeti slopes). */
  yeti: Yeti;
  wall: Wall | null;
  /** Sorted by y. */
  obstacles: Obstacle[];
  /** The generator's clean line (x per meter), or null. */
  line: number[] | null;
  /** Snacks carried into this slope; used ones are removed. */
  snacks: SnackId[];
  /** Trail Map: the clean line is drawn down to this y. */
  mapUntil: number;
  /** Hand Warmer: the next crash is short. */
  warm: boolean;
  /** Furthest downhill point reached; distance Style is 1 per meter of it. */
  maxY: number;
  /** Style from tricks and near misses (combo-multiplied). */
  skillStyle: number;
  /** Tricks and near misses since the last crash. */
  chain: number;
  bonusTokens: number;
  staggerUsed: number;
  bouncesLeft: number;
  closeCall: boolean;
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
  /** Edge-triggered: index of the Snack to use this tick. */
  snack?: number;
}

export const NO_INPUT: Input = { turn: 0, tuck: false, brake: false, jump: false };

export interface GameOptions {
  params?: SlopeParams;
  mods?: Mods;
  snacks?: SnackId[];
  /** Hand-placed obstacles instead of a generated slope (tests). */
  obstacles?: Obstacle[];
}

function makeYeti(look: YetiLook, speed: number, cross: number, dx: number, state: YetiState): Yeti {
  return { state, look, x: dx, y: -CFG.yeti.leash, vx: 0, vy: 0, speed, cross, dx, timer: 0, stunT: 0 };
}

export function newGame(seed: number, opts: GameOptions = {}): Game {
  const params = opts.params ?? ENDLESS;
  const mods = opts.mods ?? BASE_MODS;
  const slope = opts.obstacles ? { obstacles: [...opts.obstacles].sort((a, b) => a.y - b.y), line: null } : buildSlope(seed, params, CFG.tuck);
  const boss = params.boss ? BOSSES[params.boss] : null;
  const cond = params.condition ? CONDITIONS[params.condition] : null;
  const yetis = boss
    ? boss.yetis.map((b) => makeYeti(b.look, b.speed, b.cross, b.dx, 'holding'))
    : cond?.wall ? [] : [makeYeti('yeti', params.yetiSpeed, CFG.yeti.cross, 0, 'waiting')];
  const wall: Wall | null = boss?.wall
    ? { armed: true, y: CFG.yeti.wallHold, v: 0, ...boss.wall }
    : cond?.wall ? { armed: false, y: -Infinity, v: 0, ...cond.wall } : null;
  return {
    seed: seed >>> 0,
    params,
    mods,
    tick: 0,
    time: 0,
    skier: {
      x: 0, y: 0, angle: 0, speed: 0, state: 'ski', tuck: false, brake: false,
      air: 0, airTotal: 0, airKind: 'hop', tricks: 0, trickT: 0, crashT: 0, boostT: 0, tuckT: 0,
    },
    yetis,
    // Avalanche slopes have no yeti; a never-moving stand-in keeps single-yeti code paths simple.
    yeti: yetis[0] ?? makeYeti('yeti', 0, 0, 0, 'waiting'),
    wall,
    obstacles: slope.obstacles,
    line: slope.line,
    snacks: [...(opts.snacks ?? [])],
    mapUntil: -Infinity,
    warm: false,
    maxY: 0,
    skillStyle: 0,
    chain: 0,
    bonusTokens: 0,
    staggerUsed: 0,
    bouncesLeft: mods.bounces,
    closeCall: false,
    result: null,
    over: false,
    events: [],
  };
}

export const multiplier = (g: Game) => Math.min(CFG.maxMult, 1 + g.chain * CFG.multPerChain);
export const style = (g: Game) =>
  Math.floor((Math.floor(g.maxY) + Math.floor(g.skillStyle)) * (g.closeCall ? g.mods.closeCallMult : 1));
export const distance = (g: Game) => Math.max(0, Math.floor(g.maxY));
export const tokens = (g: Game) =>
  Math.floor(style(g) / CFG.styleRate) + g.bonusTokens + (g.result === 'cleared' ? g.mods.finishTokens : 0);
export const airborne = (s: Skier) => s.air > 0;
export const graceFor = (g: Game) => Math.max(CFG.yeti.minGrace, g.params.grace + g.mods.graceAdd);
export const condition = (g: Game) => (g.params.condition ? CONDITIONS[g.params.condition] : null);
export const speedOf = (g: Game, y: Yeti) =>
  Math.min(CFG.yeti.cap, y.speed * g.mods.yetiSpeedMult * (condition(g)?.yetiMult ?? 1) * (g.params.yetiMult ?? 1));
/** The fastest pursuer on this slope, after Gear. */
export const yetiSpeedFor = (g: Game) => Math.max(g.wall?.max ?? 0, ...g.yetis.map((y) => speedOf(g, y)));

/** 0 when nothing is chasing or it's a full leash away, 1 when it's on you. */
export function yetiProximity(g: Game): number {
  let p = 0;
  for (const y of g.yetis) {
    if (y.state === 'waiting') continue;
    if (y.state === 'eating') return 1;
    const d = Math.hypot(g.skier.x - y.x, g.skier.y - y.y);
    p = Math.max(p, 1 - Math.min(1, d / CFG.yeti.leash));
  }
  if (g.wall?.armed) p = Math.max(p, 1 - Math.min(1, (g.skier.y - g.wall.y) / CFG.yeti.leash));
  return p;
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
  if (input.snack !== undefined) useSnack(g, input.snack);
  updateSkier(g, input);
  if (g.over) return;
  for (const y of g.yetis) {
    updateYeti(g, y);
    if (g.over || g.result) break;
  }
  if (!g.result) updateWall(g);
}

/** Use the Snack at `index`. Returns false (and keeps it) when it would do nothing right now. */
export function useSnack(g: Game, index: number): boolean {
  const id = g.snacks[index];
  const s = g.skier;
  if (!id || s.state === 'eaten') return false;
  switch (id) {
    case 'cocoa':
      if (s.state !== 'ski') return false;
      s.speed = Math.max(s.speed, CFG.tuck * g.mods.tuckMult);
      s.boostT = Math.max(s.boostT, 2);
      break;
    case 'fish':
      if (!g.yetis.some((y) => y.state === 'chasing')) return false;
      stagger(g, 2);
      break;
    case 'map':
      if (!g.line) return false;
      g.mapUntil = s.y + CFG.mapRange;
      break;
    case 'warmer':
      if (g.warm) return false;
      g.warm = true;
      break;
  }
  g.snacks.splice(index, 1);
  g.events.push({ type: 'snack', id });
  return true;
}

function pay(g: Game, n: number, why: string) {
  if (n <= 0) return;
  g.bonusTokens += n;
  g.events.push({ type: 'token', n, why });
}

function boost(s: Skier, seconds: number) {
  if (seconds > 0) s.boostT = Math.max(s.boostT, seconds);
}

function crash(g: Game, kind: ObstacleKind | 'botched', o?: Obstacle) {
  const s = g.skier;
  const m = g.mods;
  if (o) o.hit = o.passed = true;
  const small = m.smallBounce && (kind === 'rock' || kind === 'stump');
  if (small || g.bouncesLeft > 0) {
    if (!small) g.bouncesLeft--;
    s.speed *= 0.4;
    s.air = 0;
    s.tricks = 0;
    s.trickT = 0;
    g.events.push({ type: 'bounce' });
    return;
  }
  s.state = 'crash';
  s.crashT = g.warm ? CFG.warmerCrashTime : CFG.crashTime * m.crashTimeMult * (condition(g)?.crashMult ?? 1);
  g.warm = false;
  s.speed = 0;
  s.air = 0;
  s.tricks = 0;
  s.trickT = 0;
  s.boostT = 0;
  s.tuckT = 0;
  if (!m.keepCombo) g.chain = 0;
  g.events.push({ type: 'crash', kind });
  pay(g, m.crashTokens, 'Insurance');
}

function stagger(g: Game, seconds: number) {
  const amount = Math.min(seconds, CFG.yeti.staggerCap - g.staggerUsed);
  const chasing = g.yetis.filter((y) => y.state === 'chasing');
  if (amount <= 0 || !chasing.length) return;
  g.staggerUsed += amount;
  for (const y of chasing) y.stunT += amount;
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
  s.brake = input.brake && !m.noBrake;
  s.tuck = input.tuck && !s.brake;
  s.boostT = Math.max(0, s.boostT - dt);

  // Steering: in the air you can still turn (it's a game, and it makes landings readable).
  const cond = condition(g);
  const base = CFG.turnRate * m.turnMult * (cond?.turnMult ?? 1);
  const rate = (grounded ? (s.tuck ? CFG.tuckTurnRate * m.tuckTurnMult : base) : base * m.airTurnMult) * dt;
  if (input.targetAngle !== undefined) {
    const target = clamp(input.targetAngle, -CFG.maxAngle, CFG.maxAngle);
    s.angle += clamp(target - s.angle, -rate, rate);
  } else {
    s.angle = clamp(s.angle + input.turn * rate, -CFG.maxAngle, CFG.maxAngle);
  }

  let hike = 0;
  if (grounded) {
    let top = (s.tuck ? CFG.tuck * m.tuckMult : CFG.cruise) * (cond?.speedMult ?? 1) * Math.max(0, Math.cos(s.angle));
    if (s.brake) top *= CFG.brakeFactor;
    const boosting = s.boostT > 0;
    if (boosting) top *= CFG.boostMult;
    const accel = CFG.accel * m.accelMult * (boosting ? 2 : 1);
    s.speed = s.speed < top ? Math.min(top, s.speed + accel * dt) : Math.max(top, s.speed - CFG.decel * dt);
    if (s.brake && s.speed < 0.3) hike = CFG.hikeSpeed * m.hikeMult;
    if (m.tuckStreakBoost > 0) {
      s.tuckT = s.tuck ? s.tuckT + dt : 0;
      if (s.tuckT >= m.tuckStreakBoost) {
        s.tuckT = 0;
        boost(s, 1);
      }
    }
    if (input.jump) {
      s.air = s.airTotal = (m.springHop ? CFG.springAir : CFG.hopAir) * m.airMult;
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
      if (s.trickT > 0) {
        if (!m.safeBotch) return crash(g, 'botched');
        s.trickT = 0;
        s.tricks = 0;
        g.events.push({ type: 'safeLanding' });
      } else if (s.tricks > 0) {
        const pts = CFG.trickStyle[s.tricks] * m.trickMult * multiplier(g);
        g.skillStyle += pts;
        g.chain += s.tricks;
        g.events.push({ type: 'land', tricks: s.tricks, style: pts });
        if (m.trickStagger > 0) stagger(g, m.trickStagger);
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
    if (yetiProximity(g) > CFG.closeCall) {
      g.closeCall = true;
      g.events.push({ type: 'closeCall' });
    }
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
    const skierR = CFG.skierR * m.hitboxMult;
    if (Math.hypot(dx, dy) < k.r + skierR) {
      if (airborne(s) && (k.jumpable || s.airKind === 'ramp')) {
        // Jumped over it: Gear hooks.
        if (o.touched) continue;
        if (o.kind === 'deadtree' && m.matchbook) {
          o.touched = o.burning = o.hit = true;
          stagger(g, 1);
          g.events.push({ type: 'burn' });
        } else if (o.kind === 'stump' && m.forager) {
          o.touched = o.hit = true;
          boost(s, 1.5);
          g.events.push({ type: 'forage' });
          pay(g, 1, 'Mushroom');
        }
        continue;
      }
      if (o.kind === 'dog' && m.goodBoy) {
        o.hit = o.passed = true;
        boost(s, 1);
        g.events.push({ type: 'goodBoy' });
        continue;
      }
      if (o.kind === 'stump' && hike > 0) {
        // Hiking backwards uphill into a stump: it sprouts a mushroom instead of tripping you.
        o.hit = o.touched = o.passed = true;
        g.events.push({ type: 'mushroom' });
        continue;
      }
      if (k.effect === 'crash') return crash(g, o.kind, o);
      if (o.touched) continue;
      o.touched = true;
      if (k.effect === 'slow') {
        if (m.mogulProof) continue;
        s.speed *= CFG.mogulFactor;
        g.events.push({ type: 'moguls' });
      } else if (k.effect === 'ramp') {
        s.air = s.airTotal = (CFG.rampAirMin + CFG.rampAirPerCruise * Math.min(1.2, s.speed / CFG.cruise)) * m.airMult;
        s.airKind = 'ramp';
        s.tricks = 0;
        g.events.push({ type: 'ramp' });
        boost(s, m.rampBoost);
        pay(g, m.rampTokens, 'Ramp Rat');
      }
    } else if (!o.passed && dy < 0) {
      // Just went by it: a near miss if it was close and we were moving.
      o.passed = true;
      if (k.effect === 'crash' && !airborne(s) && s.speed >= CFG.nearMissMinSpeed &&
          Math.abs(dx) < k.r + skierR + CFG.nearMissGap) {
        const dog = o.kind === 'dog' && m.dogNearMult > 1;
        const pts = CFG.nearMissStyle * multiplier(g) * (dog ? m.dogNearMult : 1);
        g.skillStyle += pts;
        g.chain++;
        boost(s, m.nearMissBoost);
        if (dog) boost(s, 1);
        g.events.push({ type: 'nearMiss', style: pts, dog });
      }
    }
  }
}

function updateYeti(g: Game, y: Yeti) {
  const s = g.skier;
  const Y = CFG.yeti;
  const dt = CFG.dt;
  if (y.state === 'waiting') {
    if (g.time < graceFor(g)) return;
    y.state = 'chasing';
    y.x = s.x + y.dx;
    y.y = s.y - Y.spawnBehind;
    g.events.push({ type: 'yetiSpawn' });
    return;
  }
  if (y.state === 'holding') {
    // A boss: visible just behind the start line (or riding the avalanche) until the grace ends.
    y.x = s.x + y.dx;
    y.y = g.wall ? g.wall.y : Y.bossHold;
    if (g.time >= graceFor(g)) {
      y.state = 'chasing';
      g.events.push({ type: 'yetiSpawn' });
    }
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
    for (const other of g.yetis) if (other !== y && other.state === 'chasing') other.vx = other.vy = 0;
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
  const speed = speedOf(g, y);
  let vx = d > 0 ? (dx / d) * speed : 0;
  let vy = d > 0 ? (dy / d) * speed : 0;
  vx = clamp(vx, -y.cross, y.cross);
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

/** An avalanche (the Old One's, or the Avalanche Condition): a wall across the slope that speeds up after the grace period and buries you. */
function updateWall(g: Game) {
  const w = g.wall;
  if (!w) return;
  const s = g.skier;
  const t = g.time - graceFor(g);
  if (t < 0) return;
  if (!w.armed) {
    w.armed = true;
    w.y = s.y - CFG.yeti.spawnBehind;
    g.events.push({ type: 'yetiSpawn' });
  }
  w.v = Math.min(w.max, w.start + (t / w.ramp) * (w.max - w.start));
  w.y = Math.max(w.y + w.v * CFG.dt, s.y - CFG.yeti.leash * 1.4);
  if (w.y >= s.y && s.state !== 'eaten') {
    s.state = 'eaten';
    s.speed = 0;
    g.result = 'eaten';
    g.over = true;
    g.events.push({ type: 'buried' }, { type: 'over' });
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
