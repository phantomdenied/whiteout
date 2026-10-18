// Persistent passives (run-structure-and-gear.md §Meta progression): bought with Patches at the Chalet between
// runs, then pinned to your jacket (3 pins, up to 5) for the next run. Owning everything never means using
// everything. Passives never touch tuck speed or speed up a pursuer; the Daily ignores them.
import type { Mods } from './gear';

export type PassiveGroup = 'kit' | 'technique' | 'avalanche' | 'knowhow';

export interface Passive {
  id: string;
  name: string;
  group: PassiveGroup;
  /** What each rank does, in plain words (one entry per rank). */
  ranks: string[];
  /** Patch cost of each rank. */
  costs: number[];
  /** In-run effect, at this rank (1-based). */
  apply?: (m: Mods, rank: number) => void;
}

export const GROUP_NAME: Record<PassiveGroup, string> = {
  kit: 'Kit · how a run starts',
  technique: 'Technique',
  avalanche: 'Avalanche',
  knowhow: 'Know-how',
};

export const PASSIVES: Passive[] = [
  { id: 'packed-lunch', name: 'Packed Lunch', group: 'kit', ranks: ['Start each run with a random Snack.'], costs: [20] },
  { id: 'deep-pockets', name: 'Deep Pockets', group: 'kit', ranks: ['+1 Snack slot.'], costs: [40], apply: (m) => { m.snackSlots += 1; } },
  { id: 'pocket-money', name: 'Pocket Money', group: 'kit', ranks: ['Start with 4 Tokens.', 'Start with 8 Tokens.', 'Start with 12 Tokens.'], costs: [15, 30, 50] },
  { id: 'hand-me-downs', name: 'Hand-me-downs', group: 'kit', ranks: ['Start each run with a random common Gear.'], costs: [40] },
  { id: 'second-wind', name: 'Second Wind', group: 'technique', ranks: ['Once per run, a crash is a bounce instead.'], costs: [60] },
  {
    id: 'quick-feet', name: 'Quick Feet', group: 'technique', ranks: ['Get up from crashes 10% faster.', 'Get up from crashes 20% faster.'], costs: [30, 60],
    apply: (m, r) => { m.crashTimeMult *= 1 - 0.1 * r; },
  },
  { id: 'long-pop', name: 'Long Pop', group: 'technique', ranks: ['Every jump and trick pop stays up 8% longer.'], costs: [35], apply: (m) => { m.airMult *= 1.08; } },
  {
    id: 'beacon', name: 'Avalanche Beacon', group: 'avalanche',
    ranks: ['Avalanches stay 2 m further back.', 'Avalanches stay 4 m further back.', 'Avalanches stay 6 m further back.'], costs: [25, 45, 70],
    apply: (m, r) => { m.avalancheLeash += 2 * r; },
  },
  { id: 'snow-sense', name: 'Snow Sense', group: 'avalanche', ranks: ['Avalanches run 0.5 m/s slower.'], costs: [50], apply: (m) => { m.avalancheSlow += 0.5; } },
  { id: 'haggler', name: 'Haggler', group: 'knowhow', ranks: ['Lodge prices 10% lower.'], costs: [40], apply: (m) => { m.shopDiscount += 0.1; } },
  { id: 'scouts-eye', name: "Scout's Eye", group: 'knowhow', ranks: ['Black Diamond rewards offer one more choice.'], costs: [50], apply: (m) => { m.diamondOffer += 1; } },
  { id: 'trail-sense', name: 'Trail Sense', group: 'knowhow', ranks: ['Trail Maps show the line 50% further.'], costs: [20], apply: (m) => { m.mapRangeMult *= 1.5; } },
];

/** Pin slots: 3 to start, then buy a 4th and 5th. */
export const PIN_SLOTS = { base: 3, max: 5, costs: [60, 100] };
/** Tokens for each mountain skipped with a Lift Pass (you missed its rewards and Lodge). */
export const LIFT_PASS_TOKENS = 15;

export const passiveById = (id: string): Passive => {
  const p = PASSIVES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown passive ${id}`);
  return p;
};

/** Pinned passives with their ranks, as a run carries them. */
export type PassiveRanks = Record<string, number>;

export function applyPassives(m: Mods, passives: PassiveRanks) {
  for (const [id, rank] of Object.entries(passives)) {
    const p = PASSIVES.find((x) => x.id === id);
    if (p?.apply && rank > 0) p.apply(m, Math.min(rank, p.costs.length));
  }
}

export const rankOf = (passives: PassiveRanks | undefined, id: string) => passives?.[id] ?? 0;
