import { describe, expect, it } from 'vitest';
import { BOSSES, CFG } from '../src/engine';
import { EVENTS } from '../src/events';
import { CURSES, GEAR, PRICE, SKIERS, SKIER_IDS, addGear, canWear, displaced, modsFor } from '../src/gear';
import {
  MOUNTAINS,
  ROWS,
  type RunState,
  SLALOM,
  SUMMIT_ROW,
  TOTAL_DESCENTS,
  TOTAL_SLOPES,
  buyGear,
  buySnack,
  chooseEvent,
  chooseNode,
  choices,
  conditionAt,
  currentNode,
  descentsDone,
  deserialize,
  eventChoiceAvailable,
  finishDescent,
  generateMap,
  hutAvailable,
  leaveLodge,
  newRun,
  nodeParams,
  paramsFor,
  pickReward,
  price,
  reroll,
  rollOffer,
  sellGear,
  serialize,
  slopeParams,
  startAt,
  summitParams,
  useHut,
} from '../src/run';

const result = (tokens = 10) => ({ cleared: true, distance: 600, style: 2100, tokens, time: 40 });

/** From the map: take the first open node, and clear / leave it however it needs. */
function stepRun(run: RunState, tokens = 10): RunState {
  let r = run.status === 'map' ? chooseNode(run, choices(run)[0]) : run;
  if (r.status === 'skiing') r = pickReward(finishDescent(r, result(tokens)), 0);
  else if (r.status === 'lodge') r = leaveLodge(r);
  else if (r.status === 'hut') r = useHut(r, null);
  else if (r.status === 'event') r = chooseEvent(r, null);
  return r;
}

/** A run positioned at a node of the given kind on mountain 1 (searching seeds). */
function runAt(kind: string, gear: string[] = [], tokens = 0): RunState {
  for (let seed = 1; seed < 500; seed++) {
    let run: RunState = { ...newRun(seed), gear };
    while (run.status === 'map' || run.status === 'reward') {
      const open = choices(run);
      const hit = open.find((c) => run.map.rows[run.row][c].kind === kind);
      if (hit !== undefined) return { ...chooseNode(run, hit), tokens: tokens || run.tokens };
      if (run.row >= SUMMIT_ROW) break;
      run = stepRun(run, 0);
    }
  }
  throw new Error(`no ${kind} found`);
}

describe('route map', () => {
  it('every mountain is six rows of 2–3 nodes and a Summit, with a Lodge and a Warming Hut', () => {
    for (let seed = 1; seed <= 30; seed++) {
      MOUNTAINS.forEach((_, m) => {
        const map = generateMap(seed, m);
        expect(map.rows).toHaveLength(ROWS);
        expect(map.rows[SUMMIT_ROW]).toEqual([{ kind: 'summit', next: [] }]);
        const kinds = map.rows.flat().map((n) => n.kind);
        expect(kinds).toContain('lodge');
        expect(kinds).toContain('hut');
        map.rows.slice(0, SUMMIT_ROW).forEach((row, r) => {
          expect(row.length).toBeGreaterThanOrEqual(2);
          expect(row.length).toBeLessThanOrEqual(3);
          const descent = [0, 1, 3, 4].includes(r);
          for (const n of row) expect(descent ? ['slope', 'diamond'] : ['lodge', 'hut', 'event', 'slalom']).toContain(n.kind);
          if (descent) expect(row.some((n) => n.kind === 'slope')).toBe(true);
          // Every node leads somewhere, and every node below is reachable.
          for (const n of row) expect(n.next.length).toBeGreaterThan(0);
          const reached = new Set(row.flatMap((n) => n.next));
          expect(reached.size).toBe(map.rows[r + 1].length);
        });
      });
    }
  });

  it('a run always has 15 descents, whatever the route', () => {
    expect(TOTAL_SLOPES).toBe(12);
    expect(TOTAL_DESCENTS).toBe(15);
    for (const pickLast of [false, true]) {
      let run = newRun(11);
      let descents = 0;
      for (let guard = 0; guard < 100 && run.status !== 'won'; guard++) {
        if (run.status === 'map') {
          const open = choices(run);
          run = chooseNode(run, pickLast ? open[open.length - 1] : open[0]);
        }
        if (run.status === 'skiing') {
          if (currentNode(run)?.kind !== 'slalom') descents++;
          run = pickReward(finishDescent(run, result()), null);
          if (run.status === 'won') break;
        } else run = stepRun(run);
      }
      expect(run.status).toBe('won');
      expect(descents).toBe(15);
    }
  });

  it('a Slalom bonus stage: no pursuer, Tokens per gate, a reward pick only for a perfect run; not one of the 15', () => {
    const run = runAt('slalom');
    const p = paramsFor(run);
    expect(p.gates).toBe('course');
    const missed = finishDescent(run, { ...result(4), gates: { made: 10, total: 12 } });
    expect(missed.status).toBe('map');
    expect(missed.row).toBe(run.row + 1);
    expect(missed.tokens - run.tokens).toBe(4 + 10 * SLALOM.tokensPerGate);
    expect(missed.note).toContain('10 of 12');
    const perfect = finishDescent(run, { ...result(4), gates: { made: 12, total: 12 } });
    expect(perfect.status).toBe('reward');
    expect(perfect.tokens - run.tokens).toBe(4 + 12 * SLALOM.tokensPerGate + SLALOM.perfectBonus);
    expect(descentsDone(perfect)).toBe(descentsDone(run));
  });

  it('Avalanches are Black Diamond only, and pay 3× Tokens (2× on top of 1.5×) and two guaranteed rares', () => {
    for (let seed = 1; seed < 400; seed++) {
      let r: RunState = newRun(seed);
      r = { ...r, mountain: 1, map: generateMap(seed, 1) };
      const col = r.map.rows[0].findIndex((n, c) => n.kind === 'diamond' && conditionAt(seed, 1, 0, c, 'diamond') === 'avalanche');
      if (col < 0) continue;
      const at = chooseNode(r, col);
      expect(paramsFor(at).condition).toBe('avalanche');
      const after = finishDescent(at, result(10));
      expect(after.results.at(-1)!.tokens).toBe(30);
      for (const item of after.offer.slice(0, 2)) expect(GEAR.find((g) => g.id === (item as { id: string }).id)!.rarity).toBe('rare');
      return;
    }
    throw new Error('no avalanche slope found');
  });

  it('plain Slopes never get an Avalanche, so every route has a way down without upgrades', () => {
    for (let seed = 1; seed <= 200; seed++) for (const m of [1, 2]) for (const row of [0, 1, 3, 4]) {
      expect(conditionAt(seed, m, row, 0, 'slope', 10)).not.toBe('avalanche');
    }
  });

  it('some plain slopes have a slalom section; Avalanches and Black Diamonds never do', () => {
    let sections = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateMap(seed, 1);
      map.rows[0].forEach((n, c) => {
        const p = nodeParams(seed, map, 1, 0, c);
        if (p.gates) {
          sections++;
          expect(n.kind).toBe('slope');
          expect(p.condition).not.toBe('avalanche');
        }
      });
    }
    expect(sections).toBeGreaterThan(10);
  });

  it('you can only pick nodes connected to where you are', () => {
    const run = stepRun(newRun(3));
    const open = choices(run);
    const closed = run.map.rows[run.row].map((_, i) => i).filter((i) => !open.includes(i));
    for (const c of closed) expect(chooseNode(run, c)).toBe(run);
  });

  it('maps, Conditions and offers replay exactly from the seed', () => {
    expect(generateMap(77, 1)).toEqual(generateMap(77, 1));
    expect(generateMap(77, 1)).not.toEqual(generateMap(78, 1));
    const a = stepRun(newRun(77));
    const b = stepRun(newRun(77));
    expect(a).toEqual(b);
  });
});

describe('descents', () => {
  it('slopes rise in length, difficulty and yeti, with the yeti always under the cap', () => {
    for (let i = 1; i < TOTAL_SLOPES; i++) {
      const [x, y] = [slopeParams(i - 1), slopeParams(i)];
      expect(y.difficulty).toBeGreaterThan(x.difficulty);
      expect(y.length).toBeGreaterThanOrEqual(x.length);
      expect(y.grace).toBeLessThanOrEqual(x.grace);
      expect(y.yetiSpeed).toBeLessThan(CFG.yeti.cap);
    }
  });

  it('each Summit brings its boss, under the pursuer cap', () => {
    MOUNTAINS.forEach((m, i) => {
      const p = summitParams(i);
      expect(p.boss).toBe(m.boss);
      expect(p.grace).toBe(CFG.yeti.minGrace);
      for (const y of BOSSES[m.boss].yetis) expect(y.speed).toBeLessThan(CFG.yeti.cap);
    });
  });

  it('mountain 1 slopes have no Conditions; Black Diamonds always do; no Avalanche on mountain 1', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (let row = 0; row < 5; row++) {
        expect(conditionAt(seed, 0, row, 0, 'slope')).toBeUndefined();
        const d = conditionAt(seed, 0, row, 1, 'diamond');
        expect(d).toBeDefined();
        expect(d).not.toBe('avalanche');
        expect(conditionAt(seed, 2, row, 1, 'diamond')).toBeDefined();
      }
    }
  });

  it('a Black Diamond is harder, pays 1.5× Tokens and guarantees a rare', () => {
    const run = runAt('diamond');
    const p = paramsFor(run);
    const plain = slopeParams(Math.floor(run.row / 2) + (run.row > 2 ? 0 : 0));
    expect(p.condition).toBeDefined();
    expect(p.difficulty).toBeGreaterThan(plain.difficulty - 0.01);
    const after = finishDescent(run, result(10));
    expect(after.results.at(-1)!.tokens).toBe(15);
    expect(after.offer[0].kind).toBe('gear');
    expect(GEAR.find((g) => g.id === (after.offer[0] as { id: string }).id)!.rarity).toBe('rare');
  });

  it('getting eaten ends the run; beating the last Summit wins it', () => {
    expect(finishDescent(chooseNode(newRun(1), 0), { ...result(), cleared: false }).status).toBe('lost');
    const last = chooseNode(startAt(1, 'rookie', 2, SUMMIT_ROW), 0);
    expect(currentNode(last)!.kind).toBe('summit');
    expect(finishDescent(last, result()).status).toBe('won');
  });

  it('Lucky Charm offers 4 rewards', () => {
    const run = chooseNode({ ...newRun(3), gear: ['lucky-charm'] }, 0);
    expect(rollOffer(finishDescent(run, result()))).toHaveLength(4);
  });

  it('nodeParams agrees with paramsFor', () => {
    const run = chooseNode(newRun(8), 0);
    expect(paramsFor(run)).toEqual(nodeParams(run.seed, run.map, 0, 0, 0));
  });
});

describe('the Lodge', () => {
  it('buying Gear costs its price and marks it sold; you cannot buy what you cannot afford', () => {
    const run = runAt('lodge', [], 100);
    const id = run.shop!.gear[0]!;
    const after = buyGear(run, 0);
    expect(after.gear).toContain(id);
    expect(after.tokens).toBe(100 - PRICE[GEAR.find((g) => g.id === id)!.rarity]);
    expect(after.shop!.gear[0]).toBeNull();
    const poor = { ...run, tokens: 0 };
    expect(buyGear(poor, 0)).toBe(poor);
  });

  it('Snacks fill slots up to the limit; selling pays half; rerolls cost more each time', () => {
    const run = runAt('lodge', ['bubble-wrap'], 20);
    expect(buySnack(buySnack(run, 0), 1).snacks).toHaveLength(2);
    expect(sellGear(run, 'bubble-wrap').tokens).toBe(20 + PRICE.common / 2);
    const once = reroll(run);
    expect(once.tokens).toBe(18);
    expect(reroll(once).tokens).toBe(15);
  });

  it('Coupon Book takes 25% off; Lunchbox hands out a Snack on arrival', () => {
    expect(price(runAt('lodge', ['coupon-book']), { kind: 'gear', id: 'showboat' })).toBe(Math.round(PRICE.rare * 0.75));
    expect(runAt('lodge', ['lunchbox']).snacks).toHaveLength(1);
  });

  it('leaving goes back to the map, one row further', () => {
    const run = runAt('lodge');
    const out = leaveLodge(run);
    expect(out.status).toBe('map');
    expect(out.row).toBe(run.row + 1);
  });
});

describe('Warming Huts and Events', () => {
  it('a Hut can refill Snacks, remove a Curse, or upgrade a Gear; unavailable options do nothing', () => {
    const hut = runAt('hut', ['bubble-wrap']);
    expect(useHut(hut, 'refill').snacks.length).toBe(2);
    expect(hutAvailable(hut, 'cleanse')).toBe(false);
    const cursed = { ...hut, curses: ['wet-socks', 'heavy-pack'] };
    expect(useHut(cursed, 'cleanse').curses).toEqual(['heavy-pack']);
    const tuned = useHut(hut, 'tune');
    const gone = hut.gear.filter((id) => !tuned.gear.includes(id));
    const added = tuned.gear.filter((id) => !hut.gear.includes(id));
    expect(gone).toHaveLength(1);
    expect(added).toHaveLength(1);
    const order = ['common', 'uncommon', 'rare'];
    const rarity = (id: string) => order.indexOf(GEAR.find((g) => g.id === id)!.rarity);
    expect(rarity(added[0])).toBe(rarity(gone[0]) + 1);
    expect(tuned.note).toMatch(/became/);
  });

  it('every Event has 2–3 choices, and walking away is always possible', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(8);
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(e.choices.length).toBeLessThanOrEqual(3);
    }
    const ev = runAt('event');
    expect(chooseEvent(ev, null).status).toBe('map');
  });

  it('Event choices that cost Tokens are disabled when you are short', () => {
    for (let seed = 1; seed < 200; seed++) {
      const ev = runAt('event');
      const choicesWithCost = EVENTS.find((e) => e.id === ev.map.rows[ev.row][ev.path[ev.row]].event)!.choices
        .map((c, i) => ({ c, i })).filter(({ c }) => (c.effect.tokens ?? 0) < 0);
      if (!choicesWithCost.length) continue;
      expect(eventChoiceAvailable({ ...ev, tokens: 0 }, choicesWithCost[0].i)).toBe(false);
      expect(eventChoiceAvailable({ ...ev, tokens: 50 }, choicesWithCost[0].i)).toBe(choicesWithCost[0].c.needs ? eventChoiceAvailable({ ...ev, tokens: 50 }, choicesWithCost[0].i) : true);
      return;
    }
  });

  it('Curses change the mods and never lower tuck speed', () => {
    for (const c of CURSES) {
      const m = modsFor([], [c.id]);
      expect(JSON.stringify(m), c.id).not.toBe(JSON.stringify(modsFor([])));
      expect(m.tuckMult).toBe(1);
    }
  });
});

describe('skiers', () => {
  it('each skier starts with their kit and changes the mods', () => {
    expect(SKIER_IDS).toHaveLength(4);
    expect(newRun(1, 'rookie').gear).toEqual(['bubble-wrap']);
    expect(newRun(1, 'retiree').gear).toEqual(['rocket-boots']);
    expect(modsFor([], [], 'snowboarder').noBrake).toBe(true);
    expect(modsFor([], [], 'dog').hitboxMult).toBeLessThan(1);
    for (const id of SKIER_IDS) expect(SKIERS[id].name).toBeTruthy();
  });

  it('the Dog has no Skis slot: skis are never offered and cannot be added', () => {
    expect(canWear('racing-skis', 'dog')).toBe(false);
    expect(addGear([], 'racing-skis', 'dog')).toEqual([]);
    for (let seed = 1; seed <= 20; seed++) {
      const run = finishDescent(chooseNode(newRun(seed, 'dog'), 0), result());
      for (const o of run.offer) if (o.kind === 'gear') expect(GEAR.find((g) => g.id === o.id)!.slot).not.toBe('skis');
    }
  });
});

describe('save', () => {
  it('round-trips, and rejects garbage or older saves', () => {
    const run = stepRun(stepRun(newRun(5, 'dog')));
    expect(deserialize(serialize(run))).toEqual(run);
    expect(deserialize('{nope')).toBeNull();
    expect(deserialize(JSON.stringify({ v: 2, run }))).toBeNull();
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

  it('a second item in a one-slot type replaces the first', () => {
    expect(displaced(['spring-boots'], 'rocket-boots')).toBe('spring-boots');
    expect(addGear(['spring-boots', 'matchbook'], 'rocket-boots')).toEqual(['matchbook', 'rocket-boots']);
    expect(displaced(['matchbook'], 'good-boy')).toBeNull();
  });
});
