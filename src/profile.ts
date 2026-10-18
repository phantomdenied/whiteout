// The player's profile, kept across runs in local storage: unlocked skiers, Altitude, lifetime stats and
// Daily Seed results (run-structure-and-gear.md §Meta progression). Unlocks add options, never raw power.
import { type SkierId, curseById, gearById } from './gear';
import { PIN_SLOTS, type PassiveRanks, passiveById } from './passives';
import { BURN, MAX_ALTITUDE, MOUNTAINS, type RunState, TOTAL_DESCENTS, descentsDone } from './run';

export interface DailyResult {
  descents: number;
  style: number;
  won: boolean;
  attempts: number;
}

export interface Profile {
  v: 1;
  unlocked: SkierId[];
  /** Highest Altitude you may pick (0 until your first win). */
  altitude: number;
  stats: {
    runs: number;
    wins: number;
    dogsHit: number;
    mushrooms: number;
    /** Most mountains cleared (Summit beaten) in one run. */
    mountains: number;
    bestDescents: number;
  };
  daily: Record<string, DailyResult>;
  /** Patches to spend at the Chalet. */
  patches: number;
  /** Passives bought, by id: rank. */
  owned: PassiveRanks;
  /** Passives pinned for the next run. */
  pins: string[];
  pinSlots: number;
  /** Highest mountain (0-based) you may start a run on: a Lift Pass for each mountain cleared. */
  liftPass: number;
  /** One-time Patch bonuses already earned. */
  firsts: string[];
}

export const UNLOCKS: { skier: SkierId; how: string; done: (p: Profile) => boolean }[] = [
  { skier: 'snowboarder', how: 'Clear mountain 1 (beat Big Yeti).', done: (p) => p.stats.mountains >= 1 },
  { skier: 'retiree', how: 'Find the old secret: hike back uphill into a stump.', done: (p) => p.stats.mushrooms >= 1 },
  { skier: 'dog', how: 'Hit 50 dogs (or dodge-bump them with Good Boy).', done: (p) => p.stats.dogsHit >= 50 },
];

export function newProfile(): Profile {
  return {
    v: 1, unlocked: ['rookie'], altitude: 0, stats: { runs: 0, wins: 0, dogsHit: 0, mushrooms: 0, mountains: 0, bestDescents: 0 }, daily: {},
    patches: 0, owned: {}, pins: [], pinSlots: PIN_SLOTS.base, liftPass: 0, firsts: [],
  };
}

export function loadProfile(text: string | null): Profile {
  if (!text) return newProfile();
  try {
    const p = JSON.parse(text) as Profile;
    if (p?.v !== 1 || !Array.isArray(p.unlocked)) return newProfile();
    const base = newProfile();
    return unlock({ ...base, ...p, stats: { ...base.stats, ...p.stats }, daily: p.daily ?? {}, owned: p.owned ?? {}, pins: p.pins ?? [], firsts: p.firsts ?? [] }).profile;
  } catch {
    return newProfile();
  }
}

export const isUnlocked = (p: Profile, skier: SkierId) => p.unlocked.includes(skier);

/** Apply unlock rules; returns the profile and any skiers that just unlocked. */
function unlock(p: Profile): { profile: Profile; unlocked: SkierId[] } {
  const fresh = UNLOCKS.filter((u) => !p.unlocked.includes(u.skier) && u.done(p)).map((u) => u.skier);
  return { profile: fresh.length ? { ...p, unlocked: [...p.unlocked, ...fresh] } : p, unlocked: fresh };
}

/** Progress made during one descent (counted even if the run is later lost). */
export function recordDescent(p: Profile, delta: { dogsHit?: number; mushrooms?: number }): { profile: Profile; unlocked: SkierId[] } {
  return unlock({
    ...p,
    stats: { ...p.stats, dogsHit: p.stats.dogsHit + (delta.dogsHit ?? 0), mushrooms: p.stats.mushrooms + (delta.mushrooms ?? 0) },
  });
}

/** Mountains cleared so far in a run (Summits beaten). */
export const mountainsCleared = (run: RunState) => run.results.filter((r) => r.cleared && r.kind === 'summit').length;

/**
 * Patches for a finished run: 1 per descent, +3 per Summit, +2 per perfect Slalom or Burning Man inferno, +N
 * for a win at Altitude N, and +5 for each first (once ever). Losing still earns something.
 */
export const PATCHES = { descent: 1, summit: 3, bonus: 2, first: 5 };
export const FIRSTS: Record<string, string> = {
  diamond: 'First Black Diamond',
  avalanche: 'First Avalanche survived',
  summit: 'First Summit',
  slalom: 'First perfect Slalom',
  inferno: 'First Burning Man inferno',
  mushroom: 'The old secret',
  win: 'First win',
};

export function runPatches(p: Profile, run: RunState): { patches: number; firsts: string[] } {
  const r = run.results.filter((x) => x.cleared);
  const bonusWins = r.filter((x) => (x.kind === 'slalom' && x.gates && x.gates.made === x.gates.total) ||
    (x.kind === 'burn' && (x.burned ?? 0) >= (BURN.pickAt[x.mountain] ?? Infinity))).length;
  let patches = descentsDone(run) * PATCHES.descent + r.filter((x) => x.kind === 'summit').length * PATCHES.summit + bonusWins * PATCHES.bonus;
  if (run.status === 'won') patches += run.altitude;
  const hit: Record<string, boolean> = {
    diamond: r.some((x) => x.kind === 'diamond'),
    avalanche: r.some((x) => x.condition === 'avalanche'),
    summit: r.some((x) => x.kind === 'summit'),
    slalom: r.some((x) => x.kind === 'slalom' && !!x.gates && x.gates.made === x.gates.total),
    inferno: r.some((x) => x.kind === 'burn' && (x.burned ?? 0) >= (BURN.pickAt[x.mountain] ?? Infinity)),
    mushroom: p.stats.mushrooms > 0,
    win: run.status === 'won',
  };
  const firsts = Object.keys(FIRSTS).filter((k) => hit[k] && !p.firsts.includes(k));
  return { patches: patches + firsts.length * PATCHES.first, firsts };
}

/** Called whenever the run moves on, and at its end: mountain progress, wins, Altitude, the Daily result. */
export function recordRun(p: Profile, run: RunState): { profile: Profile; unlocked: SkierId[]; altitudeUp: boolean; patches: number; firsts: string[]; liftPass: boolean } {
  const over = run.status === 'won' || run.status === 'lost';
  const won = run.status === 'won';
  const descents = descentsDone(run);
  let next: Profile = {
    ...p,
    stats: {
      ...p.stats,
      mountains: Math.max(p.stats.mountains, mountainsCleared(run)),
      bestDescents: Math.max(p.stats.bestDescents, descents),
      runs: p.stats.runs + (over ? 1 : 0),
      wins: p.stats.wins + (won ? 1 : 0),
    },
  };
  // Beating the game at your highest Altitude unlocks the next one (Daily runs don't count: everyone plays them at
  // 0; neither do Lift Pass runs, which skip mountains).
  const altitudeUp = won && !run.daily && run.startMountain === 0 && run.altitude >= p.altitude && p.altitude < MAX_ALTITUDE;
  if (altitudeUp) next = { ...next, altitude: p.altitude + 1 };
  if (over && run.daily) {
    const prev = next.daily[run.daily];
    const style = run.results.reduce((t, r) => t + r.style, 0);
    const better = !prev || descents > prev.descents || (descents === prev.descents && style > prev.style);
    next = {
      ...next,
      daily: {
        ...next.daily,
        [run.daily]: better
          ? { descents, style, won, attempts: (prev?.attempts ?? 0) + 1 }
          : { ...prev, attempts: prev.attempts + 1 },
      },
    };
  }
  // A Lift Pass for the mountain after each Summit you beat.
  const reached = Math.min(MOUNTAINS.length - 1, Math.max(0, ...run.results.filter((x) => x.cleared && x.kind === 'summit').map((x) => x.mountain + 1)));
  const liftPass = reached > next.liftPass;
  if (liftPass) next = { ...next, liftPass: reached };
  let patches = 0;
  let firsts: string[] = [];
  if (over) {
    ({ patches, firsts } = runPatches(next, run));
    next = { ...next, patches: next.patches + patches, firsts: [...next.firsts, ...firsts] };
  }
  const { profile, unlocked } = unlock(next);
  return { profile, unlocked, altitudeUp, patches, firsts, liftPass };
}

// ---------- The Chalet ----------

export const pinnedRanks = (p: Profile): PassiveRanks =>
  Object.fromEntries(p.pins.filter((id) => (p.owned[id] ?? 0) > 0).map((id) => [id, p.owned[id]]));

/** Cost of the next rank of a passive, or null when maxed. */
export function nextRankCost(p: Profile, id: string): number | null {
  const rank = p.owned[id] ?? 0;
  return passiveById(id).costs[rank] ?? null;
}

export function buyPassive(p: Profile, id: string): Profile {
  const cost = nextRankCost(p, id);
  if (cost === null || p.patches < cost) return p;
  const owned = { ...p.owned, [id]: (p.owned[id] ?? 0) + 1 };
  // A first purchase pins itself if there's a free pin.
  const pins = !p.owned[id] && p.pins.length < p.pinSlots ? [...p.pins, id] : p.pins;
  return { ...p, patches: p.patches - cost, owned, pins };
}

export function togglePin(p: Profile, id: string): Profile {
  if (p.pins.includes(id)) return { ...p, pins: p.pins.filter((x) => x !== id) };
  if (!p.owned[id] || p.pins.length >= p.pinSlots) return p;
  return { ...p, pins: [...p.pins, id] };
}

export const pinSlotCost = (p: Profile): number | null => PIN_SLOTS.costs[p.pinSlots - PIN_SLOTS.base] ?? null;

export function buyPinSlot(p: Profile): Profile {
  const cost = pinSlotCost(p);
  if (cost === null || p.patches < cost) return p;
  return { ...p, patches: p.patches - cost, pinSlots: p.pinSlots + 1 };
}

const KIND_GLYPH: Record<string, string> = { slope: '▫', diamond: '◆', lodge: '⌂', hut: '♨', event: '?', slalom: '⚑', burn: '🔥', summit: '▲' };

/** Plain-text summary of a run, for pasting into feedback or sharing a Daily result. */
export function runSummaryText(run: RunState, skierName: string, how: string | null): string {
  const descents = descentsDone(run);
  const style = run.results.reduce((t, r) => t + r.style, 0);
  const time = run.results.reduce((t, r) => t + r.time, 0);
  const route = MOUNTAINS.map((_, m) => run.log.filter((e) => e.mountain === m).map((e) => KIND_GLYPH[e.kind]).join('')).filter(Boolean).join(' | ');
  const head = run.daily ? `Whiteout Daily ${run.daily}` : `Whiteout seed ${run.seed}${run.altitude ? ` · Altitude ${run.altitude}` : ''}`;
  const result = run.status === 'won' ? 'Made the last bus' : `${how ?? 'Eaten'} on mountain ${run.mountain + 1}`;
  return [
    `${head} · ${skierName}`,
    `${result} · ${descents}/${TOTAL_DESCENTS} descents · ${style.toLocaleString('en-US')} style · ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`,
    `Route: ${route}`,
    run.gear.length ? `Gear: ${run.gear.map((id) => gearById(id).name).join(', ')}` : 'Gear: none',
    run.curses.length ? `Curses: ${run.curses.map((id) => curseById(id).name).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}
