import { describe, expect, it } from 'vitest';
import { type Profile, isUnlocked, loadProfile, newProfile, recordDescent, recordRun, runSummaryText } from '../src/profile';
import {
  MAX_ALTITUDE,
  type RunState,
  SUMMIT_ROW,
  chooseNode,
  dailySeed,
  deserialize,
  finishDescent,
  newRun,
  nodeParams,
  paramsFor,
  serialize,
  startAt,
  todayUTC,
} from '../src/run';
import { conditionAt } from '../src/run';

const result = (cleared = true) => ({ cleared, distance: 600, style: 2100, tokens: 10, time: 40 });
const won = (opts: { altitude?: number; daily?: string } = {}): RunState =>
  finishDescent(chooseNode(startAt(1, 'rookie', 2, SUMMIT_ROW, opts), 0), result());
const lost = (opts: { daily?: string } = {}): RunState => finishDescent(chooseNode(newRun(1, 'rookie', opts), 0), result(false));

describe('profile', () => {
  it('starts with only the Rookie, and survives garbage', () => {
    const p = newProfile();
    expect(p.unlocked).toEqual(['rookie']);
    expect(loadProfile('{nope')).toEqual(p);
    expect(loadProfile(null)).toEqual(p);
    expect(loadProfile(JSON.stringify({ ...p, altitude: 3 })).altitude).toBe(3);
  });

  it('the Retiree unlocks from the mushroom secret, the Dog after 50 dogs', () => {
    let p: Profile = newProfile();
    let r = recordDescent(p, { mushrooms: 1 });
    expect(r.unlocked).toEqual(['retiree']);
    p = r.profile;
    r = recordDescent(p, { dogsHit: 49 });
    expect(r.unlocked).toEqual([]);
    r = recordDescent(r.profile, { dogsHit: 1 });
    expect(r.unlocked).toEqual(['dog']);
    expect(isUnlocked(r.profile, 'dog')).toBe(true);
    // Never unlocked twice.
    expect(recordDescent(r.profile, { dogsHit: 5, mushrooms: 1 }).unlocked).toEqual([]);
  });

  it('the Snowboarder unlocks by beating the first Summit', () => {
    const run = finishDescent(chooseNode(startAt(1, 'rookie', 0, SUMMIT_ROW), 0), result());
    const r = recordRun(newProfile(), run);
    expect(r.unlocked).toEqual(['snowboarder']);
    expect(r.profile.stats.mountains).toBe(1);
  });

  it('winning at your highest Altitude unlocks the next one, up to the cap', () => {
    const r = recordRun(newProfile(), won());
    expect(r.altitudeUp).toBe(true);
    expect(r.profile.altitude).toBe(1);
    expect(r.profile.stats.wins).toBe(1);
    // Winning below your highest doesn't raise it.
    expect(recordRun({ ...newProfile(), altitude: 3 }, won({ altitude: 1 })).altitudeUp).toBe(false);
    expect(recordRun({ ...newProfile(), altitude: MAX_ALTITUDE }, won({ altitude: MAX_ALTITUDE })).profile.altitude).toBe(MAX_ALTITUDE);
    // Losing counts a run, not a win.
    const l = recordRun(newProfile(), lost());
    expect(l.altitudeUp).toBe(false);
    expect(l.profile.stats).toMatchObject({ runs: 1, wins: 0 });
  });

  it('Daily runs keep your best result and count attempts, and never raise Altitude', () => {
    let p = recordRun(newProfile(), lost({ daily: '2026-10-18' })).profile;
    expect(p.daily['2026-10-18']).toMatchObject({ descents: 0, won: false, attempts: 1 });
    const w = recordRun(p, won({ daily: '2026-10-18' }));
    expect(w.altitudeUp).toBe(false);
    p = w.profile;
    expect(p.daily['2026-10-18']).toMatchObject({ won: true, attempts: 2 });
    p = recordRun(p, lost({ daily: '2026-10-18' })).profile;
    expect(p.daily['2026-10-18']).toMatchObject({ won: true, attempts: 3 });
  });

  it('the run summary names the result, route and gear', () => {
    const run = { ...lost(), gear: ['racing-skis'] };
    const text = runSummaryText(run, 'Rookie', 'Buried');
    expect(text).toContain(`seed ${run.seed}`);
    expect(text).toContain('Buried on mountain 1');
    expect(text).toContain('Route: ');
    expect(text).toContain('Racing Skis');
    expect(runSummaryText(won({ daily: '2026-10-18' }), 'Rookie', null)).toContain('Whiteout Daily 2026-10-18');
  });
});

describe('Altitude and the Daily Seed', () => {
  it('Altitude raises yeti speed, trims the head start (never under 3 s) and adds Conditions', () => {
    const base = newRun(5);
    const map = base.map;
    const p0 = nodeParams(5, map, 0, 0, 0, 0);
    const p10 = nodeParams(5, map, 0, 0, 0, 10);
    expect(p0.yetiMult).toBeUndefined();
    expect(p10.yetiMult).toBeCloseTo(1.08);
    expect(p10.grace).toBeLessThan(p0.grace);
    expect(p10.grace).toBeGreaterThanOrEqual(3);
    let plain = 0, high = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (conditionAt(seed, 1, 0, 0, 'slope', 0)) plain++;
      if (conditionAt(seed, 1, 0, 0, 'slope', 10)) high++;
    }
    expect(high).toBeGreaterThan(plain);
    const run = chooseNode(newRun(5, 'rookie', { altitude: 4 }), 0);
    expect(paramsFor(run)).toEqual(nodeParams(5, run.map, 0, 0, run.path[0], 4));
  });

  it('the Daily Seed is the same for everyone on a date and differs between dates', () => {
    expect(dailySeed('2026-10-18')).toBe(dailySeed('2026-10-18'));
    expect(dailySeed('2026-10-18')).not.toBe(dailySeed('2026-10-19'));
    expect(todayUTC(new Date('2026-10-18T23:30:00Z'))).toBe('2026-10-18');
  });

  it('the route log records each node, and saves keep Altitude, Daily and the log', () => {
    const run = chooseNode(newRun(9, 'rookie', { altitude: 2, daily: '2026-10-18' }), 0);
    expect(run.log).toHaveLength(1);
    expect(run.log[0]).toMatchObject({ mountain: 0, row: 0 });
    const back = deserialize(serialize(run))!;
    expect(back).toMatchObject({ altitude: 2, daily: '2026-10-18' });
    expect(back.log).toEqual(run.log);
    const after = finishDescent(run, result());
    expect(after.results.at(-1)!.kind).toBe(run.log[0].kind);
  });
});
