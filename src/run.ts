// Run structure (run-structure-and-gear.md): three mountains, each a branching route map of six rows
// (Slope, Slope, Stop, Slope, Slope, Stop) and a Summit. Slope rows offer Slopes and Black Diamonds; Stop
// rows offer the Lodge, a Warming Hut and Events. Pure functions; the UI holds the state.
import { BOSSES, CFG } from './engine';
import { type EventEffect, EVENTS, eventById } from './events';
import {
  type Build,
  CURSES,
  GEAR,
  PRICE,
  type Rarity,
  SKIERS,
  SNACKS,
  SNACK_IDS,
  type SkierId,
  type SnackId,
  addGear,
  canWear,
  gearById,
  modsFor,
} from './gear';
import { createRng } from './rng';
import { type BossKind, CONDITION_IDS, type Condition, type SlopeParams, mix } from './slope';

export const MOUNTAINS: { name: string; blurb: string; boss: BossKind }[] = [
  { name: 'Bunny Hill Range', blurb: 'Groomed runs, lots of dogs.', boss: 'big' },
  { name: 'Black Pine', blurb: 'Thick forest, dead trees, and weather.', boss: 'twins' },
  { name: 'The Spine', blurb: 'The last bus leaves from the bottom.', boss: 'old' },
];

export type NodeKind = 'slope' | 'diamond' | 'lodge' | 'hut' | 'event' | 'slalom' | 'summit';
export interface MapNode {
  kind: NodeKind;
  /** Indices of the nodes in the next row this one leads to. */
  next: number[];
  event?: string;
}
export interface MountainMap {
  rows: MapNode[][];
}

const ROW_PATTERN = ['descent', 'descent', 'stop', 'descent', 'descent', 'stop'] as const;
/** Six map rows plus the Summit row. */
export const ROWS = ROW_PATTERN.length + 1;
export const SUMMIT_ROW = ROW_PATTERN.length;
export const SLOPES_PER_MOUNTAIN = ROW_PATTERN.filter((k) => k === 'descent').length;
export const TOTAL_SLOPES = MOUNTAINS.length * SLOPES_PER_MOUNTAIN;
/** Slopes (or Black Diamonds) plus Summits in a run, whatever the route. */
export const TOTAL_DESCENTS = TOTAL_SLOPES + MOUNTAINS.length;
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare'];
const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };
const SUMMIT_LENGTH = 1200;
const TOKEN_BUNDLE = 6;
const REROLL_BASE = 2;
const SHOP_GEAR = 3;
const SHOP_SNACKS = 2;
/** Black Diamond: harder, longer, always a Condition; better rewards. */
const DIAMOND = { difficulty: 1.5, maxDifficulty: 9, length: 100, tokenMult: 1.5 };
/** Avalanche descents: the wall is the danger, so the slope is a more open race (fewer obstacles); better pay. */
export const AVALANCHE = { difficulty: -1.5, minDifficulty: 2, tokenMult: 2 };
const withCondition = (p: SlopeParams, condition: Condition | undefined): SlopeParams =>
  !condition ? p
    : condition === 'avalanche' ? { ...p, condition, difficulty: Math.max(AVALANCHE.minDifficulty, p.difficulty + AVALANCHE.difficulty) }
      : { ...p, condition };
/** Slalom: gates on some plain slopes, and the bonus stage (no pursuer; Tokens per gate, a reward pick for a perfect run). */
export const SLALOM = { sectionChance: 0.35, tokensPerGate: 1, perfectBonus: 8 };
/** Chance of a Condition on a normal slope, per mountain. */
const CONDITION_CHANCE = [0, 0.3, 0.5];
/**
 * Altitude (run-structure-and-gear.md §Meta progression): an ascension ladder unlocked by winning.
 * Each level: pursuers 1.2% faster, 0.25 s less grace (never under the 3 s minimum), +5% chance of a Condition.
 */
export const MAX_ALTITUDE = 10;
export const ALTITUDE = { yetiPerLevel: 0.008, gracePerLevel: 0.2, conditionPerLevel: 0.05 };

export type OfferItem = { kind: 'gear'; id: string } | { kind: 'snack'; id: SnackId } | { kind: 'tokens'; n: number };

export interface DescentResult {
  mountain: number;
  row: number;
  kind: NodeKind;
  condition?: Condition;
  cleared: boolean;
  distance: number;
  style: number;
  tokens: number;
  time: number;
  /** Slalom gates made, if the descent had any. */
  gates?: { made: number; total: number };
}

export interface Shop {
  /** null once bought. */
  gear: (string | null)[];
  snacks: (SnackId | null)[];
  rerolls: number;
  /** Snacks handed out free on arrival (Lunchbox). */
  freebies: SnackId[];
}

export type HutChoice = 'refill' | 'cleanse' | 'tune';

/** One node visited, for the end-of-run summary. */
export interface LogEntry {
  mountain: number;
  row: number;
  kind: NodeKind;
  condition?: Condition;
  event?: string;
}

export interface RunState {
  seed: number;
  skier: SkierId;
  altitude: number;
  /** The Daily Seed's date (YYYY-MM-DD, UTC), or null for a normal run. */
  daily: string | null;
  log: LogEntry[];
  mountain: number;
  map: MountainMap;
  /** The row being chosen (status 'map') or played. */
  row: number;
  /** Column chosen in each row of this mountain so far. */
  path: number[];
  gear: string[];
  snacks: SnackId[];
  curses: string[];
  tokens: number;
  results: DescentResult[];
  /**
   * map: choosing the next node. skiing: on (or about to drop into) a descent. reward: choosing a reward.
   * lodge / hut / event: at a stop. won / lost: over.
   */
  status: 'map' | 'skiing' | 'reward' | 'lodge' | 'hut' | 'event' | 'won' | 'lost';
  offer: OfferItem[];
  shop: Shop | null;
  /** What the last Event or Warming Hut did, for the next screen to report. */
  note: string | null;
}

// ---------- Map ----------

/** A mountain's route map. Deterministic per run seed and mountain. */
export function generateMap(seed: number, mountain: number): MountainMap {
  const rng = createRng(mix(seed, 2000 + mountain));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const events = [...EVENTS];
  const rows: MapNode[][] = ROW_PATTERN.map((type, r) => {
    const n = 2 + (rng() < 0.55 ? 1 : 0);
    let kinds: NodeKind[];
    if (type === 'descent') {
      kinds = Array.from({ length: n }, () => (rng() < 0.3 ? 'diamond' : 'slope'));
      if (!kinds.includes('slope')) kinds[Math.floor(rng() * n)] = 'slope';
    } else {
      // The first stop row always has a Lodge, the second always a Warming Hut.
      const fixed: NodeKind = r === 2 ? 'lodge' : 'hut';
      const others: NodeKind[] = r === 2 ? ['hut', 'event', 'event', 'slalom'] : ['lodge', 'event', 'event', 'slalom'];
      kinds = [fixed, ...Array.from({ length: n - 1 }, () => pick(others))];
      for (let i = kinds.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
      }
    }
    return kinds.map((kind) => {
      const node: MapNode = { kind, next: [] };
      if (kind === 'event') node.event = events.splice(Math.floor(rng() * events.length), 1)[0].id;
      return node;
    });
  });
  // Connect each node to the nodes roughly below it, so paths branch and rejoin.
  const pos = (j: number, n: number) => (j + 0.5) / n;
  for (let r = 0; r < rows.length - 1; r++) {
    const [a, b] = [rows[r], rows[r + 1]];
    a.forEach((node, j) => {
      b.forEach((_, k) => {
        if (Math.abs(pos(k, b.length) - pos(j, a.length)) <= 0.34) node.next.push(k);
      });
    });
    b.forEach((_, k) => {
      if (a.some((node) => node.next.includes(k))) return;
      let best = 0;
      a.forEach((_, j) => {
        if (Math.abs(pos(j, a.length) - pos(k, b.length)) < Math.abs(pos(best, a.length) - pos(k, b.length))) best = j;
      });
      a[best].next.push(k);
      a[best].next.sort((x, y) => x - y);
    });
  }
  for (const node of rows[rows.length - 1]) node.next = [0];
  rows.push([{ kind: 'summit', next: [] }]);
  return { rows };
}

/** The nodes you may choose in the current row. */
export function choices(run: RunState): number[] {
  if (run.row === 0) return run.map.rows[0].map((_, i) => i);
  return run.map.rows[run.row - 1][run.path[run.row - 1]].next;
}

export const currentNode = (run: RunState): MapNode | null =>
  run.path[run.row] === undefined ? null : run.map.rows[run.row][run.path[run.row]];

// ---------- Runs ----------

export function newRun(seed: number, skier: SkierId = 'rookie', opts: { altitude?: number; daily?: string | null } = {}): RunState {
  return {
    seed: seed >>> 0,
    skier,
    altitude: Math.max(0, Math.min(MAX_ALTITUDE, Math.floor(opts.altitude ?? 0))),
    daily: opts.daily ?? null,
    log: [],
    mountain: 0,
    map: generateMap(seed >>> 0, 0),
    row: 0,
    path: [],
    gear: [...SKIERS[skier].gear],
    snacks: [],
    curses: [],
    tokens: 0,
    results: [],
    status: 'map',
    offer: [],
    shop: null,
    note: null,
  };
}

/** A fresh run starting at a mountain (and optionally a row), always taking the first branch (dev: ?mountain=N&row=R). */
export function startAt(seed: number, skier: SkierId, mountain: number, row = 0, opts: { altitude?: number; daily?: string | null } = {}): RunState {
  const m = Math.max(0, Math.min(MOUNTAINS.length - 1, Math.floor(mountain)));
  let run: RunState = { ...newRun(seed, skier, opts), mountain: m, map: generateMap(seed >>> 0, m) };
  const r = Math.max(0, Math.min(SUMMIT_ROW, Math.floor(row)));
  for (let i = 0; i < r; i++) run = { ...run, path: [...run.path, choices(run)[0]], row: i + 1 };
  return run;
}

export const runMods = (run: RunState) => modsFor(run.gear, run.curses, run.skier);
export const snackSlots = (run: RunState) => runMods(run).snackSlots;
/** Descents cleared (the Slalom bonus stage doesn't count toward the 15). */
export const descentsDone = (run: RunState) => run.results.filter((r) => r.cleared && r.kind !== 'slalom').length;
export const nodeSeed = (run: RunState) => mix(run.seed, 1000 + run.mountain * 100 + run.row * 10 + (run.path[run.row] ?? 0));

/** Which slope of its mountain (0-based) a descent row is. */
export const slopeInMountain = (row: number) => ROW_PATTERN.slice(0, row).filter((k) => k === 'descent').length;

/** Length, difficulty and yeti for each slope: everything rises across the run (yetis.md numbers). */
export function slopeParams(slope: number): SlopeParams {
  const mountain = Math.floor(slope / SLOPES_PER_MOUNTAIN);
  const k = slope % SLOPES_PER_MOUNTAIN;
  return {
    length: 600 + k * 50 + mountain * 150,
    difficulty: Math.round((2.5 + slope * 0.5) * 10) / 10,
    mountain,
    yetiSpeed: CFG.yeti.speed + mountain,
    grace: Math.round((8 - (slope / (TOTAL_SLOPES - 1)) * 4) * 10) / 10,
  };
}

/** A Black Diamond on that slope: harder, longer, and always under a Condition. */
export function diamondParams(slope: number, condition: Condition): SlopeParams {
  const p = slopeParams(slope);
  return withCondition({ ...p, difficulty: Math.min(DIAMOND.maxDifficulty, p.difficulty + DIAMOND.difficulty), length: p.length + DIAMOND.length }, condition);
}

/** A mountain's Summit: 1,200 m, the boss instead of the yeti, the 3 s minimum grace. */
export function summitParams(mountain: number): SlopeParams {
  const boss = MOUNTAINS[mountain].boss;
  const last = slopeParams(mountain * SLOPES_PER_MOUNTAIN + SLOPES_PER_MOUNTAIN - 1);
  return {
    length: SUMMIT_LENGTH,
    // One step easier than the mountain's last slope: the boss is the challenge.
    difficulty: last.difficulty - 1,
    mountain,
    yetiSpeed: Math.max(...BOSSES[boss].yetis.map((y) => y.speed)),
    grace: CFG.yeti.minGrace,
    boss,
  };
}

/** The Slalom bonus stage: a gate course with no pursuer, a little longer on each mountain. */
export function slalomParams(mountain: number): SlopeParams {
  return { length: 450 + mountain * 75, difficulty: 2 + mountain * 0.5, mountain, yetiSpeed: 0, grace: 99, gates: 'course' };
}

/** The Condition (if any) on the node at (mountain, row, col). Avalanches only from the second mountain on. */
export function conditionAt(seed: number, mountain: number, row: number, col: number, kind: NodeKind, altitude = 0): Condition | undefined {
  const rng = createRng(mix(seed, 3000 + mountain * 100 + row * 10 + col));
  if (kind !== 'diamond' && rng() >= CONDITION_CHANCE[mountain] + altitude * ALTITUDE.conditionPerLevel) return undefined;
  const pool = CONDITION_IDS.filter((c) => c !== 'avalanche' || mountain > 0);
  return pool[Math.floor(rng() * pool.length)];
}

/** Parameters for any descent node (Slope, Black Diamond or Summit) at (mountain, row, col), at an Altitude. */
export function nodeParams(seed: number, map: MountainMap, mountain: number, row: number, col: number, altitude = 0): SlopeParams {
  const kind = map.rows[row][col].kind;
  if (kind === 'slalom') return slalomParams(mountain);
  let p: SlopeParams;
  if (kind === 'summit') p = summitParams(mountain);
  else {
    const slope = mountain * SLOPES_PER_MOUNTAIN + slopeInMountain(row);
    const condition = conditionAt(seed, mountain, row, col, kind, altitude);
    p = kind === 'diamond' ? diamondParams(slope, condition!) : withCondition(slopeParams(slope), condition);
    // Some plain slopes have a slalom section mid-way.
    if (kind === 'slope' && condition !== 'avalanche' && createRng(mix(seed, 3500 + mountain * 100 + row * 10 + col))() < SLALOM.sectionChance) {
      p = { ...p, gates: 'section' };
    }
  }
  if (!altitude) return p;
  return {
    ...p,
    yetiMult: 1 + altitude * ALTITUDE.yetiPerLevel,
    grace: Math.max(CFG.yeti.minGrace, Math.round((p.grace - altitude * ALTITUDE.gracePerLevel) * 10) / 10),
  };
}

/** Parameters for the descent the run is on. */
export const paramsFor = (run: RunState) => nodeParams(run.seed, run.map, run.mountain, run.row, run.path[run.row], run.altitude);

/** The Daily Seed: the same run for everyone on a given UTC date. */
export function dailySeed(date: string): number {
  return mix(Number(date.replace(/-/g, '')) || 0, 424242);
}
export const todayUTC = (now = new Date()) => now.toISOString().slice(0, 10);

/** Pick the next node on the map. */
export function chooseNode(run: RunState, col: number): RunState {
  if (run.status !== 'map' || !choices(run).includes(col)) return run;
  const path = [...run.path];
  path[run.row] = col;
  const node = run.map.rows[run.row][col];
  const kind = node.kind;
  const entry: LogEntry = { mountain: run.mountain, row: run.row, kind };
  if (kind === 'slope' || kind === 'diamond') {
    const condition = conditionAt(run.seed, run.mountain, run.row, col, kind, run.altitude);
    if (condition) entry.condition = condition;
  }
  if (node.event) entry.event = node.event;
  const next = { ...run, path, note: null, log: [...run.log, entry] };
  if (kind === 'lodge') return enterLodge(next);
  if (kind === 'hut') return { ...next, status: 'hut' };
  if (kind === 'event') return { ...next, status: 'event' };
  return { ...next, status: 'skiing' };
}

/** Leave the current node: on to the next row, or the next mountain after a Summit. */
function advance(run: RunState): RunState {
  const base = { ...run, offer: [] as OfferItem[], shop: null };
  if (run.row < SUMMIT_ROW) return { ...base, row: run.row + 1, status: 'map' };
  const mountain = run.mountain + 1;
  return { ...base, mountain, map: generateMap(run.seed, mountain), row: 0, path: [], status: 'map' };
}

// ---------- Descents and rewards ----------

/** Record a finished descent. `snacks` is what the skier still carries (used ones are gone). */
export function finishDescent(run: RunState, result: Omit<DescentResult, 'mountain' | 'row' | 'kind' | 'condition'>, snacks: SnackId[] = run.snacks): RunState {
  const node = currentNode(run);
  const diamond = node?.kind === 'diamond';
  const condition = paramsFor(run).condition;
  const mult = (diamond ? DIAMOND.tokenMult : 1) * (condition === 'avalanche' ? AVALANCHE.tokenMult : 1);
  let earned = result.cleared ? Math.round(result.tokens * mult) : 0;
  const slalom = node?.kind === 'slalom';
  const perfect = slalom && !!result.gates && result.gates.made === result.gates.total;
  if (slalom && result.gates) earned += result.gates.made * SLALOM.tokensPerGate + (perfect ? SLALOM.perfectBonus : 0);
  const full: DescentResult = { ...result, tokens: earned, mountain: run.mountain, row: run.row, kind: node?.kind ?? 'slope' };
  if (condition) full.condition = condition;
  const base = { ...run, results: [...run.results, full], tokens: run.tokens + earned, snacks: [...snacks] };
  // The Slalom has no pursuer, so it can't be lost; a perfect run earns a reward pick.
  if (slalom && !perfect) {
    return advance({ ...base, note: `Slalom: ${result.gates?.made ?? 0} of ${result.gates?.total ?? 0} gates, +${earned} Tokens.` });
  }
  if (!result.cleared) return { ...base, status: 'lost', offer: [] };
  if (run.row === SUMMIT_ROW && run.mountain === MOUNTAINS.length - 1) return { ...base, status: 'won', offer: [] };
  const next = { ...base, status: 'reward' as const };
  return { ...next, offer: rollOffer(next) };
}

function rollRarity(rng: () => number): Rarity {
  let r = rng() * 100;
  for (const k of RARITY_ORDER) {
    r -= RARITY_WEIGHT[k];
    if (r < 0) return k;
  }
  return 'common';
}

/** Distinct Gear this skier can wear and doesn't own, by rarity (70/25/5). */
function rollGear(rng: () => number, run: RunState, n: number): string[] {
  const pool = GEAR.filter((g) => !run.gear.includes(g.id) && canWear(g.id, run.skier));
  const out: string[] = [];
  while (out.length < n && pool.length) {
    const rarity = rollRarity(rng);
    const ofRarity = pool.filter((g) => g.rarity === rarity);
    const from = ofRarity.length ? ofRarity : pool;
    const pick = from[Math.floor(rng() * from.length)];
    out.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

/** A random wearable, unowned Gear of at least `rarity` (and of `build`, if any such exists). */
function rollGearAtLeast(rng: () => number, run: RunState, rarity: Rarity, build?: Build): string | null {
  const ok = (min: Rarity, b?: Build) =>
    GEAR.filter((g) => !run.gear.includes(g.id) && canWear(g.id, run.skier) &&
      RARITY_ORDER.indexOf(g.rarity) >= RARITY_ORDER.indexOf(min) && (!b || g.build === b));
  const pool = [ok(rarity, build), ok(rarity), ok('common')].find((p) => p.length) ?? [];
  return pool.length ? pool[Math.floor(rng() * pool.length)].id : null;
}

/**
 * The reward pick: mostly Gear, sometimes a Snack or a bundle of Tokens in the last slot.
 * A Black Diamond guarantees a rare in the first slot. Lucky Charm offers 4. Deterministic per node.
 */
export function rollOffer(run: RunState): OfferItem[] {
  const rng = createRng(mix(run.seed, 5000 + run.mountain * 100 + run.row * 10 + (run.path[run.row] ?? 0)));
  const size = runMods(run).offerSize;
  const items: OfferItem[] = rollGear(rng, run, size).map((id) => ({ kind: 'gear', id }));
  // Black Diamonds and Avalanches each guarantee a rare (an Avalanche Black Diamond, two).
  const rares = (currentNode(run)?.kind === 'diamond' ? 1 : 0) + (paramsFor(run).condition === 'avalanche' ? 1 : 0);
  for (let k = 0; k < rares && k < items.length; k++) {
    const owned = { ...run, gear: [...run.gear, ...items.slice(0, k).map((x) => (x as { id: string }).id)] };
    const rare = rollGearAtLeast(rng, owned, 'rare');
    if (!rare) break;
    const dup = items.findIndex((x, i) => i > k && x.kind === 'gear' && x.id === rare);
    if (dup >= 0) items.splice(dup, 1);
    items[k] = { kind: 'gear', id: rare };
  }
  const r = rng();
  if (items.length > 1 && r < 0.3) {
    items[items.length - 1] = r < 0.2
      ? { kind: 'snack', id: SNACK_IDS[Math.floor(rng() * SNACK_IDS.length)] }
      : { kind: 'tokens', n: TOKEN_BUNDLE };
  }
  return items;
}

/** Take one offered reward (or null to skip) and move on. A Snack with no free slot is not taken. */
export function pickReward(run: RunState, index: number | null): RunState {
  if (run.status !== 'reward') return run;
  let next = { ...run };
  if (index !== null) {
    const item = run.offer[index];
    if (!item) throw new Error(`no offer at ${index}`);
    if (item.kind === 'gear') next = { ...next, gear: addGear(run.gear, item.id, run.skier) };
    else if (item.kind === 'tokens') next = { ...next, tokens: run.tokens + item.n };
    else if (run.snacks.length < snackSlots(run)) next = { ...next, snacks: [...run.snacks, item.id] };
  }
  return advance(next);
}

// ---------- Lodge ----------

export function price(run: RunState, item: { kind: 'gear'; id: string } | { kind: 'snack'; id: SnackId }): number {
  const base = item.kind === 'gear' ? PRICE[gearById(item.id).rarity] : SNACKS[item.id].price;
  return Math.max(1, Math.round(base * (1 - runMods(run).shopDiscount)));
}
export const sellPrice = (id: string) => Math.floor(PRICE[gearById(id).rarity] / 2);
export const rerollPrice = (run: RunState) => REROLL_BASE + (run.shop?.rerolls ?? 0);

function stock(run: RunState, rerolls: number): Pick<Shop, 'gear' | 'snacks'> {
  const rng = createRng(mix(run.seed, 9000 + run.mountain * 300 + run.row * 31 + rerolls));
  return {
    gear: rollGear(rng, run, SHOP_GEAR),
    snacks: Array.from({ length: SHOP_SNACKS }, () => SNACK_IDS[Math.floor(rng() * SNACK_IDS.length)]),
  };
}

function enterLodge(run: RunState): RunState {
  const rng = createRng(mix(run.seed, 7000 + run.mountain * 100 + run.row));
  const freebies: SnackId[] = [];
  const snacks = [...run.snacks];
  for (let i = 0; i < runMods(run).lodgeSnacks && snacks.length < snackSlots(run); i++) {
    const id = SNACK_IDS[Math.floor(rng() * SNACK_IDS.length)];
    freebies.push(id);
    snacks.push(id);
  }
  return { ...run, snacks, status: 'lodge', offer: [], shop: { ...stock(run, 0), rerolls: 0, freebies } };
}

export function buyGear(run: RunState, index: number): RunState {
  const id = run.shop?.gear[index];
  if (!id || run.status !== 'lodge') return run;
  const cost = price(run, { kind: 'gear', id });
  if (run.tokens < cost) return run;
  const gear = [...run.shop!.gear];
  gear[index] = null;
  return { ...run, tokens: run.tokens - cost, gear: addGear(run.gear, id, run.skier), shop: { ...run.shop!, gear } };
}

export function buySnack(run: RunState, index: number): RunState {
  const id = run.shop?.snacks[index];
  if (!id || run.status !== 'lodge' || run.snacks.length >= snackSlots(run)) return run;
  const cost = price(run, { kind: 'snack', id });
  if (run.tokens < cost) return run;
  const snacks = [...run.shop!.snacks];
  snacks[index] = null;
  return { ...run, tokens: run.tokens - cost, snacks: [...run.snacks, id], shop: { ...run.shop!, snacks } };
}

export function sellGear(run: RunState, id: string): RunState {
  if (run.status !== 'lodge' || !run.gear.includes(id)) return run;
  const gear = run.gear.filter((g) => g !== id);
  // Losing a Fanny Pack can leave more Snacks than slots: the extras are dropped.
  const snacks = run.snacks.slice(0, modsFor(gear, run.curses, run.skier).snackSlots);
  return { ...run, tokens: run.tokens + sellPrice(id), gear, snacks };
}

export function reroll(run: RunState): RunState {
  if (run.status !== 'lodge' || !run.shop) return run;
  const cost = rerollPrice(run);
  if (run.tokens < cost) return run;
  const rerolls = run.shop.rerolls + 1;
  return { ...run, tokens: run.tokens - cost, shop: { ...run.shop, ...stock(run, rerolls), rerolls } };
}

export function leaveLodge(run: RunState): RunState {
  return run.status === 'lodge' ? advance(run) : run;
}

// ---------- Warming Hut and Events ----------

/** Swap a random Gear you own (below rare) for a random unowned one of the next rarity up. */
function upgradeOne(rng: () => number, run: RunState): { run: RunState; text: string } {
  const owned = run.gear.filter((id) => gearById(id).rarity !== 'rare');
  if (!owned.length) return { run, text: 'Nothing to upgrade.' };
  const old = owned[Math.floor(rng() * owned.length)];
  const target = RARITY_ORDER[RARITY_ORDER.indexOf(gearById(old).rarity) + 1];
  const pool = GEAR.filter((g) => g.rarity === target && !run.gear.includes(g.id) && canWear(g.id, run.skier));
  if (!pool.length) return { run, text: 'Nothing to upgrade.' };
  const fresh = pool[Math.floor(rng() * pool.length)].id;
  const gear = addGear(run.gear.filter((g) => g !== old), fresh, run.skier);
  return { run: { ...run, gear }, text: `${gearById(old).name} became ${gearById(fresh).name}.` };
}

function randomSnacks(rng: () => number, run: RunState, n: number): SnackId[] {
  const room = Math.max(0, snackSlots(run) - run.snacks.length);
  return Array.from({ length: Math.min(n, room) }, () => SNACK_IDS[Math.floor(rng() * SNACK_IDS.length)]);
}

export const HUT_CHOICES: Record<HutChoice, { label: string; detail: string }> = {
  refill: { label: 'Pack a lunch', detail: 'Fill every empty Snack slot.' },
  cleanse: { label: 'Dry off by the fire', detail: 'Remove your oldest Curse.' },
  tune: { label: 'Tune your gear', detail: 'Upgrade a random Gear to the next rarity.' },
};

export function hutAvailable(run: RunState, choice: HutChoice): boolean {
  if (choice === 'refill') return run.snacks.length < snackSlots(run);
  if (choice === 'cleanse') return run.curses.length > 0;
  return run.gear.some((id) => gearById(id).rarity !== 'rare');
}

export function useHut(run: RunState, choice: HutChoice | null): RunState {
  if (run.status !== 'hut') return run;
  if (choice === null || !hutAvailable(run, choice)) return advance({ ...run, note: null });
  const rng = createRng(mix(run.seed, 8500 + run.mountain * 100 + run.row));
  if (choice === 'refill') {
    const add = randomSnacks(rng, run, 9);
    return advance({ ...run, snacks: [...run.snacks, ...add], note: `Packed ${add.map((id) => SNACKS[id].name).join(', ')}.` });
  }
  if (choice === 'cleanse') {
    const [gone, ...rest] = run.curses;
    return advance({ ...run, curses: rest, note: `${CURSES.find((c) => c.id === gone)!.name} is gone.` });
  }
  const up = upgradeOne(rng, run);
  return advance({ ...up.run, note: up.text });
}

export const currentEvent = (run: RunState) => {
  const id = currentNode(run)?.event;
  return id ? eventById(id) : null;
};

/** Whether an Event choice can be taken right now (enough Tokens, something to act on). */
export function eventChoiceAvailable(run: RunState, index: number): boolean {
  const choice = currentEvent(run)?.choices[index];
  if (!choice) return false;
  if ((choice.effect.tokens ?? 0) < 0 && run.tokens < -choice.effect.tokens!) return false;
  if (choice.needs === 'gear' && !run.gear.some((id) => gearById(id).rarity !== 'rare')) return false;
  if (choice.needs === 'curse' && run.curses.length === 0) return false;
  return true;
}

function applyEffect(rng: () => number, run: RunState, e: EventEffect): { run: RunState; notes: string[] } {
  let r = { ...run };
  const notes: string[] = [];
  const curse = () => {
    const fresh = CURSES.filter((c) => !r.curses.includes(c.id));
    if (!fresh.length) return;
    const c = fresh[Math.floor(rng() * fresh.length)];
    r = { ...r, curses: [...r.curses, c.id] };
    notes.push(`Cursed: ${c.name}.`);
  };
  if (e.gamble && rng() < 0.5) {
    curse();
    return { run: r, notes };
  }
  if (e.tokens) {
    r = { ...r, tokens: Math.max(0, r.tokens + e.tokens) };
    notes.push(`${e.tokens > 0 ? '+' : '−'}${Math.abs(e.tokens)} Tokens.`);
  }
  if (e.gear) {
    const id = rollGearAtLeast(rng, r, e.gear.rarity, e.gear.build);
    if (id) {
      r = { ...r, gear: addGear(r.gear, id, r.skier) };
      notes.push(`Got ${gearById(id).name}.`);
    }
  }
  if (e.snacks) {
    const add = randomSnacks(rng, r, e.snacks);
    r = { ...r, snacks: [...r.snacks, ...add] };
    notes.push(add.length ? `Got ${add.map((id) => SNACKS[id].name).join(' and ')}.` : 'No room for Snacks.');
  }
  if (e.upgradeGear) {
    const up = upgradeOne(rng, r);
    r = up.run;
    notes.push(up.text);
  }
  if (e.removeCurses && r.curses.length) {
    const gone = e.removeCurses === 'all' ? r.curses : r.curses.slice(0, 1);
    r = { ...r, curses: r.curses.filter((c) => !gone.includes(c)) };
    notes.push(`Removed ${gone.map((id) => CURSES.find((c) => c.id === id)!.name).join(', ')}.`);
  }
  if (e.curse) curse();
  return { run: r, notes };
}

/** Make an Event choice (or null to walk away) and move on. */
export function chooseEvent(run: RunState, index: number | null): RunState {
  if (run.status !== 'event') return run;
  if (index === null || !eventChoiceAvailable(run, index)) return advance({ ...run, note: null });
  const rng = createRng(mix(run.seed, 8000 + run.mountain * 100 + run.row * 10 + index));
  const { run: next, notes } = applyEffect(rng, run, currentEvent(run)!.choices[index].effect);
  return advance({ ...next, note: notes.join(' ') || 'Nothing happened.' });
}

export function totals(run: RunState) {
  return run.results.reduce(
    (t, r) => ({ distance: t.distance + r.distance, style: t.style + r.style, time: t.time + r.time }),
    { distance: 0, style: 0, time: 0 },
  );
}

// ---------- Save ----------

const SAVE_VERSION = 3;

export function serialize(run: RunState): string {
  return JSON.stringify({ v: SAVE_VERSION, run });
}

/** The saved run, or null if there is none or it's from an older version. */
export function deserialize(text: string | null): RunState | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const run = data?.run as RunState | undefined;
    if (data?.v !== SAVE_VERSION || !run || typeof run.row !== 'number' || !run.map?.rows) return null;
    if (!run.gear.every((id) => GEAR.some((g) => g.id === id))) return null;
    if (!run.curses.every((id) => CURSES.some((c) => c.id === id))) return null;
    if (!(run.skier in SKIERS)) return null;
    // Saves from before Altitude and the Daily Seed: fill in the defaults.
    return { ...run, altitude: run.altitude ?? 0, daily: run.daily ?? null, log: run.log ?? [] };
  } catch {
    return null;
  }
}
