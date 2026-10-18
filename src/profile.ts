// The player's profile, kept across runs in local storage: unlocked skiers, Altitude, lifetime stats and
// Daily Seed results (run-structure-and-gear.md §Meta progression). Unlocks add options, never raw power.
import { type SkierId, curseById, gearById } from './gear';
import { MAX_ALTITUDE, MOUNTAINS, type RunState, TOTAL_DESCENTS, descentsDone } from './run';

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
}

export const UNLOCKS: { skier: SkierId; how: string; done: (p: Profile) => boolean }[] = [
  { skier: 'snowboarder', how: 'Clear mountain 1 (beat Big Yeti).', done: (p) => p.stats.mountains >= 1 },
  { skier: 'retiree', how: 'Find the old secret: hike back uphill into a stump.', done: (p) => p.stats.mushrooms >= 1 },
  { skier: 'dog', how: 'Hit 50 dogs (or dodge-bump them with Good Boy).', done: (p) => p.stats.dogsHit >= 50 },
];

export function newProfile(): Profile {
  return { v: 1, unlocked: ['rookie'], altitude: 0, stats: { runs: 0, wins: 0, dogsHit: 0, mushrooms: 0, mountains: 0, bestDescents: 0 }, daily: {} };
}

export function loadProfile(text: string | null): Profile {
  if (!text) return newProfile();
  try {
    const p = JSON.parse(text) as Profile;
    if (p?.v !== 1 || !Array.isArray(p.unlocked)) return newProfile();
    const base = newProfile();
    return unlock({ ...base, ...p, stats: { ...base.stats, ...p.stats }, daily: p.daily ?? {} }).profile;
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

/** Called whenever the run moves on, and at its end: mountain progress, wins, Altitude, the Daily result. */
export function recordRun(p: Profile, run: RunState): { profile: Profile; unlocked: SkierId[]; altitudeUp: boolean } {
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
  // Beating the game at your highest Altitude unlocks the next one (Daily runs don't count: everyone plays them at 0).
  const altitudeUp = won && !run.daily && run.altitude >= p.altitude && p.altitude < MAX_ALTITUDE;
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
  const { profile, unlocked } = unlock(next);
  return { profile, unlocked, altitudeUp };
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
