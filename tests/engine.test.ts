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

describe('new gear', () => {
  it('Twin Tips doubles trick Style', () => {
    const g = slope([], ['twin-tips']);
    run(g, 1);
    jumpOnce(g);
    run(g, 0.1);
    jumpOnce(g);
    run(g, 1);
    expect(g.events.find((e) => e.type === 'land')).toMatchObject({ tricks: 1, style: 100 });
  });

  it('Air Bag turns a botched landing into a safe one', () => {
    const g = slope([], ['air-bag']);
    run(g, 1);
    jumpOnce(g);
    run(g, CFG.hopAir - 0.1);
    jumpOnce(g);
    run(g, 0.5);
    expect(g.events.some((e) => e.type === 'safeLanding')).toBe(true);
    expect(g.skier.state).toBe('ski');
  });

  it('Stunt Double bounces off rocks every time; Insurance pays for real crashes', () => {
    const g = slope([ob('rock', 0, 10), ob('rock', 0, 20), ob('tree', 0, 30)], ['stunt-double', 'insurance']);
    run(g, 8);
    expect(g.events.filter((e) => e.type === 'bounce')).toHaveLength(2);
    expect(g.events.filter((e) => e.type === 'crash')).toHaveLength(1);
    expect(g.bonusTokens).toBe(1);
  });

  it('Helmet Cam keeps the combo through a crash', () => {
    const g = slope([ob('tree', 1.2, 30), ob('tree', 0, 45)], ['helmet-cam']);
    run(g, 6);
    expect(g.events.some((e) => e.type === 'crash')).toBe(true);
    expect(g.chain).toBe(1);
  });

  it('Snowshoes ride through moguls at full speed', () => {
    const g = slope([ob('moguls', 0, 12)], ['snowshoes']);
    run(g, 2);
    expect(g.events.some((e) => e.type === 'moguls')).toBe(false);
  });

  it('Ramp Rat pays a Token per ramp', () => {
    const g = slope([ob('ramp', 0, 10)], ['ramp-rat']);
    run(g, 3);
    expect(g.bonusTokens).toBe(1);
  });

  it('Downhill Suit fires a boost after 4 s of tuck; Carbon Poles accelerate faster', () => {
    const g = slope([], ['downhill-suit']);
    run(g, 4.1, tuck);
    expect(g.skier.boostT).toBeGreaterThan(0);
    const poles = slope([], ['carbon-poles']);
    run(poles, 1);
    const plain = slope();
    run(plain, 1);
    expect(poles.skier.speed).toBeGreaterThan(plain.skier.speed);
  });

  it('Close Call multiplies Style when you finish with the yeti close; Yeti Bait makes it ×3', () => {
    const params = { length: 300, difficulty: 1, mountain: 0, yetiSpeed: 14, grace: 3 };
    for (const [gear, mult] of [[[], 1.5], [['yeti-bait'], 3]] as const) {
      const g = newGame(1, { obstacles: [], params, mods: modsFor([...gear]) });
      while (g.skier.y < 290) step(g, tuck);
      g.yeti.y = g.skier.y - 5;
      g.yeti.x = g.skier.x;
      run(g, 2, tuck);
      expect(g.closeCall, `${gear}`).toBe(true);
      expect(style(g)).toBe(Math.floor((Math.floor(g.maxY) + Math.floor(g.skillStyle)) * mult));
    }
  });
});

describe('snacks', () => {
  it('Cocoa: instant tuck speed and a boost', () => {
    const g = newGame(1, { obstacles: [], snacks: ['cocoa'] });
    step(g, { ...NO_INPUT, snack: 0 });
    expect(g.skier.speed).toBeGreaterThan(CFG.tuck - 0.5);
    expect(g.skier.boostT).toBeGreaterThan(0);
    expect(g.snacks).toEqual([]);
  });

  it('Fish only works on a chasing yeti, and stops it', () => {
    const g = newGame(1, { obstacles: [], snacks: ['fish'] });
    step(g, { ...NO_INPUT, snack: 0 });
    expect(g.snacks).toEqual(['fish']);
    run(g, CFG.yeti.grace + 0.5, tuck);
    step(g, { ...tuck, snack: 0 });
    expect(g.snacks).toEqual([]);
    expect(g.yeti.stunT).toBeGreaterThan(1.9);
  });

  it('Hand Warmer shortens the next crash only', () => {
    const g = newGame(1, { obstacles: [ob('tree', 0, 10)], snacks: ['warmer'] });
    step(g, { ...NO_INPUT, snack: 0 });
    run(g, 2);
    expect(g.events.some((e) => e.type === 'crash')).toBe(true);
    expect(g.skier.state).toBe('ski');
    expect(g.warm).toBe(false);
  });

  it('Trail Map reveals the line on a generated slope', () => {
    const g = newGame(4, { params: { length: 600, difficulty: 3, mountain: 0, yetiSpeed: 14, grace: 8 }, snacks: ['map'] });
    step(g, { ...NO_INPUT, snack: 0 });
    expect(g.mapUntil).toBeGreaterThan(190);
  });
});

describe('bosses', () => {
  const summit = (boss: 'big' | 'twins' | 'old') => newGame(1, { obstacles: [], params: { length: 1200, difficulty: 3, mountain: 0, yetiSpeed: 17, grace: 3, boss } });

  it('a boss is visible from the start and holds until the grace ends', () => {
    const g = summit('big');
    run(g, 1, tuck);
    expect(g.yeti.state).toBe('holding');
    expect(g.yeti.look).toBe('big');
    run(g, 2.5, tuck);
    expect(g.yeti.state).toBe('chasing');
  });

  it('the Twins are two yetis; a clean tuck still outruns both', () => {
    const g = summit('twins');
    expect(g.yetis).toHaveLength(2);
    run(g, 80, tuck);
    expect(g.result).toBe('cleared');
  });

  it('the Old One buries a skier who stops', () => {
    const g = summit('old');
    expect(g.wall).not.toBeNull();
    run(g, 40, { ...NO_INPUT, targetAngle: Math.PI / 2 });
    expect(g.result).toBe('eaten');
  });

  it('a clean tuck beats every boss on an open slope', () => {
    for (const boss of ['big', 'twins', 'old'] as const) {
      const g = summit(boss);
      run(g, 90, tuck);
      expect(g.result, boss).toBe('cleared');
    }
  });
});

