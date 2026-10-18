// Run structure for M1: three mountains in a straight line, four slopes each, a reward pick of 1 Gear
// from 3 after every slope. See docs/features/run-structure-and-gear.md. Pure functions; the UI holds the state.
import { CFG } from './engine';
import { GEAR, type Rarity, addGear } from './gear';
import { createRng } from './rng';
import { type SlopeParams, mix } from './slope';

export const MOUNTAINS = [
  { name: 'Bunny Hill Range', blurb: 'Groomed runs, lots of dogs.' },
  { name: 'Black Pine', blurb: 'Thick forest and dead trees.' },
  { name: 'The Spine', blurb: 'The last bus leaves from the bottom.' },
];
export const SLOPES_PER_MOUNTAIN = 4;
export const TOTAL_SLOPES = MOUNTAINS.length * SLOPES_PER_MOUNTAIN;
const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };

export interface SlopeResult {
  slope: number;
  cleared: boolean;
  distance: number;
  style: number;
  tokens: number;
  time: number;
}

export interface RunState {
  seed: number;
  /** Index of the current (or last played) slope, 0 … TOTAL_SLOPES - 1. */
  slope: number;
  gear: string[];
  tokens: number;
  results: SlopeResult[];
  /** skiing: on (or about to drop into) a slope. reward: choosing Gear. won / lost: run over. */
  status: 'skiing' | 'reward' | 'won' | 'lost';
  offer: string[];
}

export function newRun(seed: number): RunState {
  return { seed: seed >>> 0, slope: 0, gear: [], tokens: 0, results: [], status: 'skiing', offer: [] };
}

export const mountainOf = (slope: number) => Math.floor(slope / SLOPES_PER_MOUNTAIN);
export const slopeSeed = (run: RunState, slope = run.slope) => mix(run.seed, 1000 + slope);

/** Length, difficulty and yeti for each slope: everything rises across the run (yetis.md numbers). */
export function slopeParams(slope: number): SlopeParams {
  const mountain = mountainOf(slope);
  const k = slope % SLOPES_PER_MOUNTAIN;
  return {
    length: 600 + k * 50 + mountain * 150,
    difficulty: Math.round((1.5 + slope * 0.6) * 10) / 10,
    mountain,
    yetiSpeed: CFG.yeti.speed + mountain,
    grace: Math.round((8 - (slope / (TOTAL_SLOPES - 1)) * 4) * 10) / 10,
  };
}

export function finishSlope(run: RunState, result: SlopeResult): RunState {
  const results = [...run.results, result];
  const tokens = run.tokens + (result.cleared ? result.tokens : 0);
  if (!result.cleared) return { ...run, results, tokens, status: 'lost', offer: [] };
  if (run.slope === TOTAL_SLOPES - 1) return { ...run, results, tokens, status: 'won', offer: [] };
  const next = { ...run, results, tokens, status: 'reward' as const };
  return { ...next, offer: rollOffer(next) };
}

/** Three distinct Gear you don't own, by rarity (70/25/5). Deterministic per run seed and slope. */
export function rollOffer(run: RunState): string[] {
  const rng = createRng(mix(run.seed, 5000 + run.slope));
  const pool = GEAR.filter((g) => !run.gear.includes(g.id));
  const out: string[] = [];
  while (out.length < 3 && pool.length) {
    let r = rng() * 100;
    let rarity: Rarity = 'common';
    for (const k of ['common', 'uncommon', 'rare'] as Rarity[]) {
      r -= RARITY_WEIGHT[k];
      if (r < 0) {
        rarity = k;
        break;
      }
    }
    const ofRarity = pool.filter((g) => g.rarity === rarity);
    const from = ofRarity.length ? ofRarity : pool;
    const pick = from[Math.floor(rng() * from.length)];
    out.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

/** Take one of the offered Gear (or null to skip) and move on to the next slope. */
export function pickReward(run: RunState, id: string | null): RunState {
  if (run.status !== 'reward') return run;
  if (id !== null && !run.offer.includes(id)) throw new Error(`${id} was not offered`);
  return { ...run, gear: id ? addGear(run.gear, id) : run.gear, slope: run.slope + 1, status: 'skiing', offer: [] };
}

export function totals(run: RunState) {
  return run.results.reduce(
    (t, r) => ({ distance: t.distance + r.distance, style: t.style + r.style, time: t.time + r.time }),
    { distance: 0, style: 0, time: 0 },
  );
}
