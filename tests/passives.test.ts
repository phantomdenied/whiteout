import { describe, expect, it } from 'vitest';
import { botInput } from '../src/bot';
import { CFG, newGame, step } from '../src/engine';
import { modsFor } from '../src/gear';
import { LIFT_PASS_TOKENS, PASSIVES, PIN_SLOTS } from '../src/passives';
import {
  type Profile,
  buyPassive,
  buyPinSlot,
  newProfile,
  pinnedRanks,
  recordRun,
  runPatches,
  togglePin,
} from '../src/profile';
import { type RunState, SUMMIT_ROW, chooseNode, deserialize, diamondParams, finishDescent, newRun, runMods, serialize, startAt } from '../src/run';

const result = (cleared = true) => ({ cleared, distance: 600, style: 2100, tokens: 10, time: 40 });
const rich = (patches = 1000): Profile => ({ ...newProfile(), patches });

describe('the Chalet', () => {
  it('passives have names, rank texts and costs that line up; every cost is positive', () => {
    const ids = new Set(PASSIVES.map((p) => p.id));
    expect(ids.size).toBe(PASSIVES.length);
    for (const p of PASSIVES) {
      expect(p.ranks).toHaveLength(p.costs.length);
      for (const c of p.costs) expect(c).toBeGreaterThan(0);
    }
  });

  it('buying costs Patches, ranks up to the max, and a first buy pins itself while pins are free', () => {
    let p = rich(200);
    p = buyPassive(p, 'pocket-money');
    expect(p.owned['pocket-money']).toBe(1);
    expect(p.patches).toBe(185);
    expect(p.pins).toEqual(['pocket-money']);
    p = buyPassive(buyPassive(p, 'pocket-money'), 'pocket-money');
    expect(p.owned['pocket-money']).toBe(3);
    expect(buyPassive(p, 'pocket-money')).toBe(p);
    expect(buyPassive(rich(10), 'second-wind').owned['second-wind']).toBeUndefined();
  });

  it('pins are limited to your slots; more slots cost Patches, up to 5', () => {
    let p = rich();
    for (const id of ['packed-lunch', 'deep-pockets', 'haggler', 'trail-sense']) p = buyPassive(p, id);
    expect(p.pins).toHaveLength(PIN_SLOTS.base);
    expect(togglePin(p, 'trail-sense').pins).toHaveLength(PIN_SLOTS.base);
    p = buyPinSlot(p);
    expect(p.pinSlots).toBe(4);
    p = togglePin(p, 'trail-sense');
    expect(p.pins).toContain('trail-sense');
    p = buyPinSlot(buyPinSlot(p));
    expect(p.pinSlots).toBe(PIN_SLOTS.max);
    expect(pinnedRanks(togglePin(p, 'haggler'))).not.toHaveProperty('haggler');
  });
});

describe('passives in a run', () => {
  it('Kit passives apply at the start, the same way for the same seed; the Daily ignores passives', () => {
    const passives = { 'pocket-money': 3, 'packed-lunch': 1, 'hand-me-downs': 1, 'deep-pockets': 1 };
    const a = newRun(42, 'rookie', { passives });
    expect(a.tokens).toBe(12);
    expect(a.snacks).toHaveLength(1);
    expect(a.gear.length).toBe(2);
    expect(runMods(a).snackSlots).toBe(3);
    expect(newRun(42, 'rookie', { passives })).toEqual(a);
    const daily = newRun(42, 'rookie', { passives, daily: '2026-10-18', startMountain: 2 });
    expect(daily.tokens).toBe(0);
    expect(daily.passives).toEqual({});
    expect(daily.mountain).toBe(0);
  });

  it('Avalanche passives hold the wall further back and slow it', () => {
    const params = { length: 2000, difficulty: 1, mountain: 1, yetiSpeed: 0, grace: 3, condition: 'avalanche' as const };
    const gap = (passives: Record<string, number>) => {
      const g = newGame(1, { params, obstacles: [], mods: modsFor([], [], 'rookie', passives) });
      for (let i = 0; i < 60 * 15; i++) step(g, { turn: 0, tuck: true, brake: false, jump: false });
      return g.skier.y - g.wall!.y;
    };
    expect(gap({ beacon: 3 })).toBeCloseTo(gap({}) + 6, 0);
    expect(modsFor([], [], 'rookie', { 'snow-sense': 1 }).avalancheSlow).toBe(0.5);
  });

  it('with every avalanche passive, the starting kit can survive some Avalanche Black Diamonds (none without)', () => {
    let without = 0, with_ = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (const [passives, add] of [[{}, () => without++], [{ beacon: 3, 'snow-sense': 1, 'quick-feet': 2 }, () => with_++]] as const) {
        const g = newGame(seed * 7919 + 1, { params: diamondParams(7, 'avalanche'), mods: modsFor(['bubble-wrap'], [], 'rookie', passives) });
        while (!g.over && g.tick < 60 * 300) { step(g, botInput(g)); g.events.length = 0; }
        if (g.result === 'cleared') add();
      }
    }
    expect(without).toBe(0);
    expect(with_).toBeGreaterThanOrEqual(2);
  });

  it('Second Wind adds one bounce to a slope', () => {
    const g = newGame(1, { params: { length: 600, difficulty: 3, mountain: 0, yetiSpeed: 14, grace: 8 }, extraBounce: true });
    expect(g.bouncesLeft).toBe(1);
    expect(CFG.mapRange).toBeGreaterThan(0);
  });

  it('runs with passives save and load', () => {
    const run = newRun(5, 'rookie', { passives: { haggler: 1 }, startMountain: 1 });
    const back = deserialize(serialize(run))!;
    expect(back.passives).toEqual({ haggler: 1 });
    expect(back.startMountain).toBe(1);
  });
});

describe('Patches and Lift Passes', () => {
  it('every run earns Patches, win or lose; firsts pay once', () => {
    const lost = finishDescent(chooseNode(newRun(1), 0), result(false));
    expect(runPatches(newProfile(), lost).patches).toBe(0);
    const won = finishDescent(chooseNode(startAt(1, 'rookie', 2, SUMMIT_ROW), 0), result());
    const first = recordRun(newProfile(), won);
    expect(first.firsts).toEqual(expect.arrayContaining(['summit', 'win']));
    expect(first.patches).toBeGreaterThan(10);
    const again = recordRun(first.profile, won);
    expect(again.patches).toBeLessThan(first.patches);
  });

  it('beating a Summit grants a Lift Pass for the next mountain; a Lift Pass run starts there with Tokens', () => {
    const run: RunState = finishDescent(chooseNode(startAt(3, 'rookie', 0, SUMMIT_ROW), 0), result());
    const r = recordRun(newProfile(), run);
    expect(r.liftPass).toBe(true);
    expect(r.profile.liftPass).toBe(1);
    const lift = newRun(9, 'rookie', { startMountain: 2 });
    expect(lift.mountain).toBe(2);
    expect(lift.row).toBe(0);
    expect(lift.tokens).toBe(2 * LIFT_PASS_TOKENS);
  });

  it('a Lift Pass win does not raise Altitude', () => {
    const run = finishDescent(chooseNode({ ...startAt(1, 'rookie', 2, SUMMIT_ROW), startMountain: 2 }, 0), result());
    expect(recordRun(newProfile(), run).altitudeUp).toBe(false);
  });
});
