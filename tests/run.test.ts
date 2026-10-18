import { describe, expect, it } from 'vitest';
import { CFG } from '../src/engine';
import { GEAR, addGear, displaced, modsFor } from '../src/gear';
import { TOTAL_SLOPES, finishSlope, newRun, pickReward, rollOffer, slopeParams, slopeSeed } from '../src/run';

const cleared = (slope: number) => ({ slope, cleared: true, distance: 600, style: 2100, tokens: 10, time: 40 });

describe('run structure', () => {
  it('has 12 slopes whose length, difficulty and yeti rise, with the yeti always under the cap', () => {
    expect(TOTAL_SLOPES).toBe(12);
    for (let i = 1; i < TOTAL_SLOPES; i++) {
      const [a, b] = [slopeParams(i - 1), slopeParams(i)];
      expect(b.difficulty).toBeGreaterThan(a.difficulty);
      expect(b.length).toBeGreaterThanOrEqual(a.length);
      expect(b.grace).toBeLessThanOrEqual(a.grace);
      expect(b.grace).toBeGreaterThanOrEqual(CFG.yeti.minGrace);
      expect(b.yetiSpeed).toBeLessThan(CFG.yeti.cap);
    }
  });

  it('clearing a slope pays Tokens and offers 3 distinct unowned Gear', () => {
    const run = finishSlope(newRun(9), cleared(0));
    expect(run.status).toBe('reward');
    expect(run.tokens).toBe(10);
    expect(new Set(run.offer).size).toBe(3);
    const next = pickReward(run, run.offer[0]);
    expect(next.gear).toEqual([run.offer[0]]);
    expect(next.slope).toBe(1);
    expect(rollOffer(finishSlope(next, cleared(1)))).not.toContain(run.offer[0]);
  });

  it('getting eaten ends the run; clearing the last slope wins it', () => {
    expect(finishSlope(newRun(1), { ...cleared(0), cleared: false }).status).toBe('lost');
    const last = { ...newRun(1), slope: TOTAL_SLOPES - 1 };
    expect(finishSlope(last, cleared(TOTAL_SLOPES - 1)).status).toBe('won');
  });

  it('a run replays exactly from its seed', () => {
    const a = finishSlope(newRun(77), cleared(0));
    const b = finishSlope(newRun(77), cleared(0));
    expect(a.offer).toEqual(b.offer);
    expect(slopeSeed(a, 5)).toBe(slopeSeed(b, 5));
    expect(slopeSeed(a, 5)).not.toBe(slopeSeed(a, 6));
  });
});

describe('gear slots', () => {
  it('there are 10 Gear, and a second item in a one-slot type replaces the first', () => {
    expect(GEAR).toHaveLength(10);
    expect(displaced(['spring-boots'], 'rocket-boots')).toBe('spring-boots');
    expect(addGear(['spring-boots', 'matchbook'], 'rocket-boots')).toEqual(['matchbook', 'rocket-boots']);
    expect(displaced(['matchbook'], 'good-boy')).toBeNull();
  });

  it('every Gear changes the mods', () => {
    const base = JSON.stringify(modsFor([]));
    for (const g of GEAR) expect(JSON.stringify(modsFor([g.id])), g.id).not.toBe(base);
  });
});
