// Run structure for M2: three mountains, each Slope, Slope, Lodge, Slope, Slope, Lodge, Summit (the route map
// comes in M3). A reward pick after every descent, a shop at every Lodge. See docs/features/run-structure-and-gear.md.
// Pure functions; the UI holds the state.
import { BOSSES, CFG } from './engine';
import { GEAR, PRICE, type Rarity, SNACKS, SNACK_IDS, type SnackId, addGear, gearById, modsFor } from './gear';
import { createRng } from './rng';
import { type BossKind, type SlopeParams, mix } from './slope';

export const MOUNTAINS: { name: string; blurb: string; boss: BossKind }[] = [
  { name: 'Bunny Hill Range', blurb: 'Groomed runs, lots of dogs.', boss: 'big' },
  { name: 'Black Pine', blurb: 'Thick forest and dead trees.', boss: 'twins' },
  { name: 'The Spine', blurb: 'The last bus leaves from the bottom.', boss: 'old' },
];
export type StageKind = 'slope' | 'lodge' | 'summit';
const MOUNTAIN_STAGES: StageKind[] = ['slope', 'slope', 'lodge', 'slope', 'slope', 'lodge', 'summit'];
export const STAGES_PER_MOUNTAIN = MOUNTAIN_STAGES.length;
export const TOTAL_STAGES = MOUNTAINS.length * STAGES_PER_MOUNTAIN;
export const SLOPES_PER_MOUNTAIN = MOUNTAIN_STAGES.filter((k) => k === 'slope').length;
export const TOTAL_SLOPES = MOUNTAINS.length * SLOPES_PER_MOUNTAIN;
export const TOTAL_DESCENTS = TOTAL_STAGES - MOUNTAINS.length * MOUNTAIN_STAGES.filter((k) => k === 'lodge').length;
const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };
const SUMMIT_LENGTH = 1200;
const TOKEN_BUNDLE = 6;
const REROLL_BASE = 2;
const SHOP_GEAR = 3;
const SHOP_SNACKS = 2;

export type OfferItem = { kind: 'gear'; id: string } | { kind: 'snack'; id: SnackId } | { kind: 'tokens'; n: number };

export interface DescentResult {
  stage: number;
  cleared: boolean;
  distance: number;
  style: number;
  tokens: number;
  time: number;
}

export interface Shop {
  /** null once bought. */
  gear: (string | null)[];
  snacks: (SnackId | null)[];
  rerolls: number;
  /** Snacks handed out free on arrival (Lunchbox). */
  freebies: SnackId[];
}

export interface RunState {
  seed: number;
  /** Index into the run's stages, 0 … TOTAL_STAGES - 1. */
  stage: number;
  gear: string[];
  snacks: SnackId[];
  tokens: number;
  results: DescentResult[];
  /** skiing: on (or about to drop into) a descent. reward: choosing a reward. lodge: shopping. won / lost: over. */
  status: 'skiing' | 'reward' | 'lodge' | 'won' | 'lost';
  offer: OfferItem[];
  shop: Shop | null;
}

export function newRun(seed: number): RunState {
  return { seed: seed >>> 0, stage: 0, gear: [], snacks: [], tokens: 0, results: [], status: 'skiing', offer: [], shop: null };
}

/** A fresh run starting at `stage` (dev/playtest shortcut: ?stage=N). */
export function startAt(seed: number, stage: number): RunState {
  const s = Math.max(0, Math.min(TOTAL_STAGES - 1, Math.floor(stage)));
  const run = newRun(seed);
  return s === 0 ? run : advance({ ...run, stage: s - 1 });
}

export const stageKind = (stage: number): StageKind => MOUNTAIN_STAGES[stage % STAGES_PER_MOUNTAIN];
export const mountainOf = (stage: number) => Math.floor(stage / STAGES_PER_MOUNTAIN);
/** Which slope of its mountain (0-based) a slope stage is. */
export const slopeInMountain = (stage: number) =>
  MOUNTAIN_STAGES.slice(0, stage % STAGES_PER_MOUNTAIN).filter((k) => k === 'slope').length;
/** Run-wide slope number (0 … TOTAL_SLOPES - 1) of a slope stage; drives difficulty. */
export const slopeNumber = (stage: number) => mountainOf(stage) * SLOPES_PER_MOUNTAIN + slopeInMountain(stage);
/** Descents (slopes and Summits) finished before this stage. */
export const descentsBefore = (stage: number) =>
  Array.from({ length: stage }, (_, i) => stageKind(i)).filter((k) => k !== 'lodge').length;
export const slopeSeed = (run: RunState, stage = run.stage) => mix(run.seed, 1000 + stage);
export const snackSlots = (run: RunState) => modsFor(run.gear).snackSlots;

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

export function paramsFor(stage: number): SlopeParams {
  return stageKind(stage) === 'summit' ? summitParams(mountainOf(stage)) : slopeParams(slopeNumber(stage));
}

// ---------- Descents and rewards ----------

/** Record a finished descent. `snacks` is what the skier still carries (used ones are gone). */
export function finishDescent(run: RunState, result: DescentResult, snacks: SnackId[] = run.snacks): RunState {
  const results = [...run.results, result];
  const tokens = run.tokens + (result.cleared ? result.tokens : 0);
  const base = { ...run, results, tokens, snacks: [...snacks] };
  if (!result.cleared) return { ...base, status: 'lost', offer: [] };
  if (run.stage === TOTAL_STAGES - 1) return { ...base, status: 'won', offer: [] };
  const next = { ...base, status: 'reward' as const };
  return { ...next, offer: rollOffer(next) };
}

function rollRarity(rng: () => number): Rarity {
  let r = rng() * 100;
  for (const k of ['common', 'uncommon', 'rare'] as Rarity[]) {
    r -= RARITY_WEIGHT[k];
    if (r < 0) return k;
  }
  return 'common';
}

/** Distinct Gear you don't own (and that isn't excluded), by rarity (70/25/5). */
function rollGear(rng: () => number, owned: string[], n: number, exclude: string[] = []): string[] {
  const pool = GEAR.filter((g) => !owned.includes(g.id) && !exclude.includes(g.id));
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

/**
 * The reward pick: mostly Gear, sometimes a Snack or a bundle of Tokens in the last slot.
 * Deterministic per run seed and stage. Lucky Charm offers 4.
 */
export function rollOffer(run: RunState): OfferItem[] {
  const rng = createRng(mix(run.seed, 5000 + run.stage));
  const size = modsFor(run.gear).offerSize;
  const items: OfferItem[] = rollGear(rng, run.gear, size).map((id) => ({ kind: 'gear', id }));
  const r = rng();
  if (items.length && r < 0.3) {
    items[items.length - 1] = r < 0.2
      ? { kind: 'snack', id: SNACK_IDS[Math.floor(rng() * SNACK_IDS.length)] }
      : { kind: 'tokens', n: TOKEN_BUNDLE };
  }
  return items;
}

/** Take one offered reward (or null to skip) and move on. A Snack with no free slot is not taken. */
export function pickReward(run: RunState, index: number | null): RunState {
  if (run.status !== 'reward') return run;
  let next = { ...run, offer: [] as OfferItem[] };
  if (index !== null) {
    const item = run.offer[index];
    if (!item) throw new Error(`no offer at ${index}`);
    if (item.kind === 'gear') next = { ...next, gear: addGear(run.gear, item.id) };
    else if (item.kind === 'tokens') next = { ...next, tokens: run.tokens + item.n };
    else if (run.snacks.length < snackSlots(run)) next = { ...next, snacks: [...run.snacks, item.id] };
  }
  return advance(next);
}

function advance(run: RunState): RunState {
  const stage = run.stage + 1;
  if (stageKind(stage) === 'lodge') return enterLodge({ ...run, stage });
  return { ...run, stage, status: 'skiing', shop: null };
}

// ---------- Lodge ----------

export function price(run: RunState, item: { kind: 'gear'; id: string } | { kind: 'snack'; id: SnackId }): number {
  const base = item.kind === 'gear' ? PRICE[gearById(item.id).rarity] : SNACKS[item.id].price;
  return Math.max(1, Math.round(base * (1 - modsFor(run.gear).shopDiscount)));
}
export const sellPrice = (id: string) => Math.floor(PRICE[gearById(id).rarity] / 2);
export const rerollPrice = (run: RunState) => REROLL_BASE + (run.shop?.rerolls ?? 0);

function stock(run: RunState, rerolls: number): Pick<Shop, 'gear' | 'snacks'> {
  const rng = createRng(mix(run.seed, 9000 + run.stage * 31 + rerolls));
  return {
    gear: rollGear(rng, run.gear, SHOP_GEAR),
    snacks: Array.from({ length: SHOP_SNACKS }, () => SNACK_IDS[Math.floor(rng() * SNACK_IDS.length)]),
  };
}

function enterLodge(run: RunState): RunState {
  const rng = createRng(mix(run.seed, 7000 + run.stage));
  const freebies: SnackId[] = [];
  const snacks = [...run.snacks];
  for (let i = 0; i < modsFor(run.gear).lodgeSnacks && snacks.length < snackSlots(run); i++) {
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
  return { ...run, tokens: run.tokens - cost, gear: addGear(run.gear, id), shop: { ...run.shop!, gear } };
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
  const snacks = run.snacks.slice(0, modsFor(gear).snackSlots);
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

export function totals(run: RunState) {
  return run.results.reduce(
    (t, r) => ({ distance: t.distance + r.distance, style: t.style + r.style, time: t.time + r.time }),
    { distance: 0, style: 0, time: 0 },
  );
}

// ---------- Save ----------

const SAVE_VERSION = 2;

export function serialize(run: RunState): string {
  return JSON.stringify({ v: SAVE_VERSION, run });
}

/** The saved run, or null if there is none or it's from an older version. */
export function deserialize(text: string | null): RunState | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (data?.v !== SAVE_VERSION || !data.run || typeof data.run.stage !== 'number') return null;
    const run = data.run as RunState;
    if (!run.gear.every((id) => GEAR.some((g) => g.id === id))) return null;
    return run;
  } catch {
    return null;
  }
}
