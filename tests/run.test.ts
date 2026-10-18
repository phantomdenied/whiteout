import { describe, expect, it } from 'vitest';
import { BOSSES, CFG } from '../src/engine';
import { GEAR, PRICE, addGear, displaced, modsFor } from '../src/gear';
import {
  MOUNTAINS,
  type RunState,
  TOTAL_DESCENTS,
  TOTAL_SLOPES,
  TOTAL_STAGES,
  buyGear,
  buySnack,
  deserialize,
  finishDescent,
  leaveLodge,
  newRun,
  paramsFor,
  pickReward,
  price,
  reroll,
  rollOffer,
  sellGear,
  serialize,
  slopeParams,
  slopeSeed,
  stageKind,
  summitParams,
} from '../src/run';

const cleared = (stage: number, tokens = 10) => ({ stage, cleared: true, distance: 600, style: 2100, tokens, time: 40 });

/** Clear the current descent and take the first reward. */
function clearAndPick(run: RunState, tokens = 10): RunState {
  return pickReward(finishDescent(run, cleared(run.stage, tokens)), 0);
}

describe('run structure', () => {
  it('each mountain is Slope, Slope, Lodge, Slope, Slope, Lodge, Summit', () => {
    expect(TOTAL_STAGES).toBe(21);
    expect(TOTAL_SLOPES).toBe(12);
    expect(TOTAL_DESCENTS).toBe(15);
    expect(Array.from({ length: 7 }, (_, i) => stageKind(i))).toEqual(['slope', 'slope', 'lodge', 'slope', 'slope', 'lodge', 'summit']);
  });

  it('slopes rise in length, difficulty and yeti, with the yeti always under the cap', () => {
    for (let i = 1; i < TOTAL_SLOPES; i++) {
      const [a, b] = [slopeParams(i - 1), slopeParams(i)];
      expect(b.difficulty).toBeGreaterThan(a.difficulty);
      expect(b.length).toBeGreaterThanOrEqual(a.length);
      expect(b.grace).toBeLessThanOrEqual(a.grace);
      expect(b.grace).toBeGreaterThanOrEqual(CFG.yeti.minGrace);
      expect(b.yetiSpeed).toBeLessThan(CFG.yeti.cap);
    }
  });

  it('each Summit brings its mountain\'s boss, with every boss under the pursuer cap', () => {
    MOUNTAINS.forEach((m, i) => {
      const p = summitParams(i);
      expect(p.boss).toBe(m.boss);
      expect(p.length).toBe(1200);
      expect(p.grace).toBe(CFG.yeti.minGrace);
      expect(paramsFor(i * 7 + 6)).toEqual(p);
      for (const y of BOSSES[m.boss].yetis) expect(y.speed).toBeLessThan(CFG.yeti.cap);
    });
  });

  it('clearing a descent pays Tokens and offers distinct rewards; the third stage is a Lodge', () => {
    const run = finishDescent(newRun(9), cleared(0));
    expect(run.status).toBe('reward');
    expect(run.tokens).toBe(10);
    expect(run.offer).toHaveLength(3);
    const ids = run.offer.filter((o) => o.kind === 'gear').map((o) => (o as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
    const second = clearAndPick(pickReward(run, 0));
    expect(second.stage).toBe(2);
    expect(second.status).toBe('lodge');
    expect(second.shop!.gear).toHaveLength(3);
  });

  it('getting eaten ends the run; beating the last Summit wins it', () => {
    expect(finishDescent(newRun(1), { ...cleared(0), cleared: false }).status).toBe('lost');
    const last = { ...newRun(1), stage: TOTAL_STAGES - 1 };
    expect(finishDescent(last, cleared(TOTAL_STAGES - 1)).status).toBe('won');
  });

  it('a run replays exactly from its seed', () => {
    const a = finishDescent(newRun(77), cleared(0));
    const b = finishDescent(newRun(77), cleared(0));
    expect(a.offer).toEqual(b.offer);
    expect(slopeSeed(a, 5)).toBe(slopeSeed(b, 5));
    expect(slopeSeed(a, 5)).not.toBe(slopeSeed(a, 6));
  });

  it('Lucky Charm offers 4 rewards', () => {
    const run = { ...newRun(3), gear: ['lucky-charm'] };
    expect(rollOffer(finishDescent(run, cleared(0)))).toHaveLength(4);
  });
});

describe('the Lodge', () => {
  const lodge = (tokens: number, gear: string[] = []): RunState => {
    let run: RunState = { ...newRun(42), gear };
    run = clearAndPick(run, 0);
    run = pickReward(finishDescent(run, cleared(run.stage, 0)), null);
    expect(run.status).toBe('lodge');
    return { ...run, tokens };
  };

  it('buying Gear costs its price and marks it sold; you cannot buy what you cannot afford', () => {
    const run = lodge(100);
    const id = run.shop!.gear[0]!;
    const after = buyGear(run, 0);
    expect(after.gear).toContain(id);
    expect(after.tokens).toBe(100 - PRICE[GEAR.find((g) => g.id === id)!.rarity]);
    expect(after.shop!.gear[0]).toBeNull();
    const poor = lodge(0);
    expect(buyGear(poor, 0)).toBe(poor);
  });

  it('Snacks fill slots up to the limit; Fanny Pack adds one', () => {
    let run = lodge(100);
    run = buySnack(buySnack(run, 0), 1);
    expect(run.snacks).toHaveLength(2);
    const packed = lodge(100, ['fanny-pack']);
    expect(buySnack(buySnack(packed, 0), 1).snacks).toHaveLength(2);
    expect({ ...packed, snacks: ['fish', 'fish'] as const }.snacks.length).toBeLessThan(modsFor(['fanny-pack']).snackSlots);
  });

  it('selling pays half price; rerolling costs more each time and restocks', () => {
    const run = lodge(20, ['bubble-wrap']);
    expect(sellGear(run, 'bubble-wrap').tokens).toBe(20 + PRICE.common / 2);
    const once = reroll(run);
    expect(once.tokens).toBe(18);
    expect(reroll(once).tokens).toBe(15);
    expect(once.shop!.gear).not.toEqual(run.shop!.gear);
  });

  it('Coupon Book takes 25% off; Lunchbox hands out a Snack on arrival', () => {
    const run = lodge(0, ['coupon-book']);
    expect(price(run, { kind: 'gear', id: 'showboat' })).toBe(Math.round(PRICE.rare * 0.75));
    expect(lodge(0, ['lunchbox']).snacks).toHaveLength(1);
  });

  it('leaving moves on to the next slope', () => {
    const run = leaveLodge(lodge(0));
    expect(run.status).toBe('skiing');
    expect(stageKind(run.stage)).toBe('slope');
  });
});

describe('save', () => {
  it('round-trips, and rejects garbage or older saves', () => {
    const run = clearAndPick(newRun(5));
    expect(deserialize(serialize(run))).toEqual(run);
    expect(deserialize('{nope')).toBeNull();
    expect(deserialize(JSON.stringify({ v: 1, run }))).toBeNull();
    expect(deserialize(null)).toBeNull();
  });
});

describe('gear', () => {
  it('there are 30 Gear with unique ids, and every one changes the mods', () => {
    expect(GEAR).toHaveLength(30);
    expect(new Set(GEAR.map((g) => g.id)).size).toBe(30);
    const base = JSON.stringify(modsFor([]));
    for (const g of GEAR) expect(JSON.stringify(modsFor([g.id])), g.id).not.toBe(base);
  });

  it('every build has Gear in it', () => {
    for (const build of ['tuck', 'jump', 'crash', 'risk']) expect(GEAR.filter((g) => g.build === build).length).toBeGreaterThanOrEqual(6);
  });

  it('a second item in a one-slot type replaces the first', () => {
    expect(displaced(['spring-boots'], 'rocket-boots')).toBe('spring-boots');
    expect(addGear(['spring-boots', 'matchbook'], 'rocket-boots')).toEqual(['matchbook', 'rocket-boots']);
    expect(displaced(['matchbook'], 'good-boy')).toBeNull();
  });
});
