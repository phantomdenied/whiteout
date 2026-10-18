import { describe, expect, it } from 'vitest';
import {
  CFG,
  type Game,
  type Input,
  NO_INPUT,
  type Obstacle,
  type ObstacleKind,
  newGame,
  step,
  style,
  yetiProximity,
} from '../src/engine';
import { modsFor } from '../src/gear';
import { SLOPE, buildSlope } from '../src/slope';

let nextId = 1;
const ob = (kind: ObstacleKind, x: number, y: number): Obstacle => ({
  id: nextId++, kind, x, y, x0: x, phase: 0, hit: false, touched: false, passed: false, burning: false,
});

/** An endless empty slope with hand-placed obstacles, optionally with Gear. */
function slope(obstacles: Obstacle[] = [], gear: string[] = []): Game {
  return newGame(1, { obstacles, mods: modsFor(gear) });
}

const run = (g: Game, seconds: number, input: Input | ((g: Game) => Input) = NO_INPUT) => {
  for (let i = 0; i < Math.round(seconds / CFG.dt); i++) step(g, typeof input === 'function' ? input(g) : input);
};
const tuck: Input = { ...NO_INPUT, tuck: true };
const jumpOnce = (g: Game, input: Input = NO_INPUT) => step(g, { ...input, jump: true });

describe('rules the design depends on', () => {
  it('the pursuer cap sits above yeti speed and below clean tuck speed (yetis.md)', () => {
    expect(CFG.yeti.speed).toBeLessThanOrEqual(CFG.yeti.cap);
    expect(CFG.yeti.cap).toBeLessThan(CFG.tuck);
    expect(CFG.yeti.speed).toBeGreaterThan(CFG.cruise);
  });

  it('a clean tuck outruns the yeti forever; cruising gets caught', () => {
    const fast = slope();
    run(fast, 120, tuck);
    expect(fast.skier.state).toBe('ski');
    expect(fast.yeti.state).toBe('chasing');

    const slow = slope();
    run(slow, 120);
    expect(slow.skier.state).toBe('eaten');
  });
});

describe('determinism', () => {
  it('the slope is a pure function of the seed', () => {
    const p = { length: 600, difficulty: 3, mountain: 0, yetiSpeed: 14, grace: 8 };
    expect(buildSlope(42, p, CFG.tuck)).toEqual(buildSlope(42, p, CFG.tuck));
    expect(buildSlope(42, p, CFG.tuck).obstacles).not.toEqual(buildSlope(43, p, CFG.tuck).obstacles);
  });

  it('the same seed and inputs replay identically', () => {
    const inputs = (g: Game): Input => ({ ...NO_INPUT, turn: Math.sin(g.tick / 40), tuck: g.tick % 300 < 200, jump: g.tick % 97 === 0 });
    const a = newGame(7);
    const b = newGame(7);
    run(a, 30, inputs);
    run(b, 30, inputs);
    expect(a.skier).toEqual(b.skier);
    expect(a.yeti).toEqual(b.yeti);
    expect(style(a)).toBe(style(b));
  });

  it('the start is clear inside the slope edges', () => {
    const g = newGame(99);
    const inside = g.obstacles.filter((o) => Math.abs(o.x) < SLOPE.halfWidth && o.y < SLOPE.startClear);
    expect(inside).toEqual([]);
  });
});

describe('skiing', () => {
  it('tucking is faster than cruising, and sideways stops you', () => {
    const g = slope();
    run(g, 4);
    expect(g.skier.speed).toBeCloseTo(CFG.cruise, 1);
    run(g, 4, tuck);
    expect(g.skier.speed).toBeCloseTo(CFG.tuck, 1);
    run(g, 4, { ...NO_INPUT, targetAngle: Math.PI / 2 });
    expect(g.skier.speed).toBeLessThan(0.01);
  });

  it('hitting a tree crashes you for 1.4 s, then you ski on past it', () => {
    const g = slope([ob('tree', 0, 10)]);
    run(g, 2);
    expect(g.skier.state).toBe('crash');
    run(g, CFG.crashTime);
    expect(g.skier.state).toBe('ski');
    run(g, 1);
    expect(g.skier.state).toBe('ski');
    expect(g.skier.y).toBeGreaterThan(11);
  });

  it('a hop clears a rock but not a tree', () => {
    for (const [kind, crashed] of [['rock', false], ['tree', true]] as const) {
      const g = slope([ob(kind, 0, 13)]);
      run(g, 1.5); // ~12 m/s
      jumpOnce(g);
      run(g, 1);
      expect(g.skier.state === 'crash', kind).toBe(crashed);
    }
  });

  it('a ramp launches you over trees', () => {
    const g = slope([ob('ramp', 0, 10), ob('tree', 0, 14)]);
    run(g, 3);
    expect(g.events.some((e) => e.type === 'ramp')).toBe(true);
    expect(g.skier.state).toBe('ski');
    expect(g.skier.y).toBeGreaterThan(15);
  });

  it('moguls slow you down without crashing', () => {
    const g = slope([ob('moguls', 0, 12)]);
    run(g, 2);
    expect(g.events.some((e) => e.type === 'moguls')).toBe(true);
    expect(g.skier.state).toBe('ski');
  });

  it('a clean trick scores Style; landing mid-trick crashes', () => {
    const clean = slope();
    run(clean, 1);
    jumpOnce(clean);
    run(clean, 0.1);
    jumpOnce(clean); // trick early in the hop: finishes before landing
    run(clean, 1);
    expect(clean.events.find((e) => e.type === 'land')).toMatchObject({ tricks: 1, style: 50 });

    const botched = slope();
    run(botched, 1);
    jumpOnce(botched);
    run(botched, CFG.hopAir - 0.1);
    jumpOnce(botched); // too late to finish
    run(botched, 0.5);
    expect(botched.events.find((e) => e.type === 'crash')).toMatchObject({ kind: 'botched' });
  });

  it('a close pass at speed is a near miss and builds the combo', () => {
    const g = slope([ob('tree', 1.2, 30), ob('tree', -1.2, 50)]);
    run(g, 6);
    expect(g.events.filter((e) => e.type === 'nearMiss')).toHaveLength(2);
    expect(g.chain).toBe(2);
  });
});

describe('the yeti', () => {
  it('waits out the grace period, then appears behind you', () => {
    const g = slope();
    run(g, CFG.yeti.grace - 0.1, tuck);
    expect(g.yeti.state).toBe('waiting');
    run(g, 0.2, tuck);
    expect(g.yeti.state).toBe('chasing');
    expect(g.yeti.y).toBeLessThan(g.skier.y);
    expect(yetiProximity(g)).toBeGreaterThan(0);
  });

  it('is leashed to 1.5 screens', () => {
    const g = slope();
    run(g, 60, tuck);
    expect(g.skier.y - g.yeti.y).toBeLessThanOrEqual(CFG.yeti.leash + 1e-6);
  });

  it('eats a stopped skier and ends the run', () => {
    const g = slope();
    run(g, 30, { ...NO_INPUT, targetAngle: Math.PI / 2 });
    expect(g.skier.state).toBe('eaten');
    run(g, CFG.yeti.eatTime + 0.1);
    expect(g.over).toBe(true);
  });
});

describe('finish gate', () => {
  it('crossing the finish ends the slope as cleared', () => {
    const g = newGame(3, { obstacles: [], params: { length: 50, difficulty: 1, mountain: 0, yetiSpeed: 14, grace: 8 } });
    run(g, 10, tuck);
    expect(g.result).toBe('cleared');
    expect(g.over).toBe(true);
    expect(g.events.some((e) => e.type === 'finish')).toBe(true);
  });
});

describe('gear', () => {
  it('Spring Boots hops clear trees', () => {
    const g = slope([ob('tree', 0, 13)], ['spring-boots']);
    run(g, 1.5);
    jumpOnce(g);
    run(g, 1.5);
    expect(g.skier.state).toBe('ski');
    expect(g.skier.y).toBeGreaterThan(14);
  });

  it('Good Boy turns a dog into a boost', () => {
    // The dog wanders: start it 2.5 m left so it's back in the middle when the skier arrives.
    const dog = { ...ob('dog', 0, 12), x0: -2.5 };
    const g = slope([dog], ['good-boy']);
    run(g, 2);
    expect(g.events.some((e) => e.type === 'goodBoy')).toBe(true);
    expect(g.skier.state).toBe('ski');
  });

  it('Rubber Chicken bounces the first crash only', () => {
    const g = slope([ob('tree', 0, 10), ob('tree', 0, 25)], ['rubber-chicken']);
    run(g, 6);
    expect(g.events.filter((e) => e.type === 'bounce')).toHaveLength(1);
    expect(g.events.filter((e) => e.type === 'crash')).toHaveLength(1);
  });

  it('Bubble Wrap halves crash time', () => {
    const g = slope([ob('tree', 0, 10)], ['bubble-wrap']);
    run(g, 2);
    expect(g.skier.state).toBe('crash');
    expect(g.skier.crashT).toBeLessThanOrEqual(CFG.crashTime / 2);
  });

  it('Matchbook burns jumped dead trees and staggers the yeti, capped per slope', () => {
    const trees = [60, 80, 100, 120, 140, 160, 180, 200].map((y) => ob('deadtree', 0, y));
    const g = slope(trees, ['matchbook']);
    run(g, CFG.yeti.grace + 0.5, (game) => ({ ...tuck, jump: game.skier.y > 50 && game.tick % 45 === 0 }));
    run(g, 10, (game) => ({ ...tuck, jump: game.tick % 45 === 0 }));
    expect(g.events.filter((e) => e.type === 'burn').length).toBeGreaterThan(0);
    expect(g.staggerUsed).toBeLessThanOrEqual(CFG.yeti.staggerCap);
  });

  it('Mushroom Forager pays a Token per jumped stump', () => {
    const g = slope([ob('stump', 0, 13)], ['mushroom-forager']);
    run(g, 1.5);
    jumpOnce(g);
    run(g, 1);
    expect(g.bonusTokens).toBe(1);
  });

  it('Yeti Musk delays the yeti but never breaks the pursuer cap', () => {
    const g = slope([], ['yeti-musk']);
    run(g, CFG.yeti.grace + 1, tuck);
    expect(g.yeti.state).toBe('waiting');
    const fast = newGame(1, { obstacles: [], mods: modsFor(['yeti-musk']), params: { length: Infinity, difficulty: 1, mountain: 2, yetiSpeed: 17.4, grace: 3 } });
    run(fast, 30, tuck);
    expect(Math.hypot(fast.yeti.vx, fast.yeti.vy)).toBeLessThanOrEqual(CFG.yeti.cap + 1e-9);
  });
});

