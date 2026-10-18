import { describe, expect, it } from 'vitest';
import { botInput } from '../src/bot';
import { CHUNKS, CHUNK_COLS, CHUNK_ROWS } from '../src/chunks';
import { CFG, newGame, step } from '../src/engine';
import { MOUNTAINS, SLOPES_PER_MOUNTAIN, TOTAL_SLOPES, diamondParams, slopeParams, summitParams } from '../src/run';
import { CONDITION_IDS, KINDS, LINE, type Obstacle, type ObstacleKind, SLOPE, buildSlope, chaseGap, findLine } from '../src/slope';

const CELL_KIND: Record<string, ObstacleKind> = { T: 'tree', D: 'deadtree', r: 'rock', s: 'stump', m: 'moguls', R: 'ramp', d: 'dog' };

describe('chunk library', () => {
  it('every chunk is 30 × 20 and draws inside the edge tree line', () => {
    for (const c of CHUNKS) {
      expect(c.rows, c.name).toHaveLength(CHUNK_ROWS);
      for (const row of c.rows) {
        expect(row, c.name).toHaveLength(CHUNK_COLS);
        expect(row.slice(0, 2) + row.slice(28), c.name).toBe('....');
      }
    }
  });

  it('every chunk has a clean line through it', () => {
    for (const c of CHUNKS) {
      const obs: Obstacle[] = [];
      c.rows.forEach((row, r) => {
        for (let col = 0; col < CHUNK_COLS; col++) {
          const kind = CELL_KIND[row[col]];
          if (kind) obs.push({ id: obs.length, kind, x: -29 + col * 2, y: 30 + 1 + r * 2, x0: -29 + col * 2, phase: 0, hit: false, touched: false, passed: false, burning: false });
        }
      });
      obs.sort((a, b) => a.y - b.y);
      expect(findLine(obs, 80), c.name).not.toBeNull();
    }
  });
});

describe('slope generation', () => {
  it('every slope of the run validates on the first few tries, without the fallback', () => {
    for (let i = 0; i < TOTAL_SLOPES; i++) {
      for (let seed = 1; seed <= 8; seed++) {
        const s = buildSlope(seed * 101 + i, slopeParams(i), CFG.tuck);
        expect(s.fallback, `slope ${i} seed ${seed}`).toBe(false);
        expect(s.attempts).toBeLessThan(10);
      }
    }
  });

  it('every Black Diamond, under every Condition, validates without the fallback', () => {
    MOUNTAINS.forEach((_, m) => {
      for (const c of CONDITION_IDS) {
        for (let seed = 1; seed <= 4; seed++) {
          const s = buildSlope(seed * 37 + m, diamondParams(m * SLOPES_PER_MOUNTAIN + SLOPES_PER_MOUNTAIN - 1, c), CFG.tuck);
          expect(s.fallback, `mountain ${m + 1} ${c} seed ${seed}`).toBe(false);
        }
      }
    });
  });

  it("the validated line keeps its clearance and stays ahead of the yeti", () => {
    const p = slopeParams(TOTAL_SLOPES - 1);
    const s = buildSlope(7, p, CFG.tuck);
    const line = s.line!;
    for (const o of s.obstacles) {
      const k = KINDS[o.kind];
      if (k.effect === 'slow' || o.y < 0 || o.y >= line.length - 1) continue;
      const x = line[Math.round(o.y)];
      const wander = o.kind === 'dog' ? SLOPE.dogWander : 0;
      expect(Math.max(0, Math.abs(x - o.x0) - wander)).toBeGreaterThan(k.r + SLOPE.skierR + LINE.margin - 1);
    }
    expect(chaseGap(line, CFG.tuck, p.yetiSpeed, p.grace)).toBeGreaterThanOrEqual(LINE.minGap);
  });

  it('the clean-skier bot clears every slope and Summit of a run, and Black Diamonds under every Condition', () => {
    const descents = [
      ...Array.from({ length: TOTAL_SLOPES }, (_, i) => ({ label: `slope ${i + 1}`, params: slopeParams(i) })),
      ...MOUNTAINS.map((_, m) => ({ label: `summit ${m + 1}`, params: summitParams(m) })),
      ...CONDITION_IDS.map((c) => ({ label: `mountain 2 diamond ${c}`, params: diamondParams(SLOPES_PER_MOUNTAIN + 3, c) })),
    ];
    descents.forEach(({ label, params }, i) => {
      const g = newGame(2024 + i, { params });
      while (!g.over && g.tick < 60 * 300) {
        step(g, botInput(g));
        g.events.length = 0;
      }
      expect(g.result, label).toBe('cleared');
    });
  });

  it('a skier who never tucks gets caught', () => {
    const g = newGame(5, { params: slopeParams(0) });
    while (!g.over) {
      step(g, botInput(g, { tuck: false }));
      g.events.length = 0;
    }
    expect(g.result).toBe('eaten');
  });
});
