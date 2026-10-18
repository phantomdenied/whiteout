// Balance simulator: bots ski every slope of the run for many seeds and print a table per slope.
// Usage: npm run sim [-- seeds]   (default 50 seeds × 12 slopes per bot)
import { botInput } from '../src/bot';
import { type Game, distance, newGame, step, style, tokens } from '../src/engine';
import { TOTAL_SLOPES, slopeParams } from '../src/run';

const seeds = Number(process.argv[2]) || 50;

interface Row {
  cleared: number;
  eaten: number;
  crashes: number;
  time: number;
  style: number;
  tokens: number;
  reached: number;
}

function ski(g: Game, tuck: boolean): number {
  let crashes = 0;
  const opts = { tuck };
  while (!g.over && g.tick < 60 * 600) {
    step(g, botInput(g, opts));
    for (const e of g.events) if (e.type === 'crash') crashes++;
    g.events.length = 0;
  }
  return crashes;
}

function simulate(label: string, tuck: boolean) {
  console.log(`\n${label} (${seeds} seeds per slope)`);
  console.log('slope  len  diff  yeti grace | clear  eaten  crashes  time  style  tokens  reached');
  for (let i = 0; i < TOTAL_SLOPES; i++) {
    const p = slopeParams(i);
    const row: Row = { cleared: 0, eaten: 0, crashes: 0, time: 0, style: 0, tokens: 0, reached: 0 };
    for (let seed = 1; seed <= seeds; seed++) {
      const g = newGame(seed * 7919 + i, { params: p });
      row.crashes += ski(g, tuck);
      if (g.result === 'cleared') {
        row.cleared++;
        row.time += g.time;
        row.style += style(g);
        row.tokens += tokens(g);
      } else row.eaten++;
      row.reached += distance(g) / p.length;
    }
    const c = Math.max(1, row.cleared);
    console.log(
      [
        String(i + 1).padStart(5),
        String(p.length).padStart(4),
        p.difficulty.toFixed(1).padStart(5),
        String(p.yetiSpeed).padStart(5),
        p.grace.toFixed(1).padStart(5),
        '|',
        pct(row.cleared / seeds).padStart(5),
        pct(row.eaten / seeds).padStart(6),
        (row.crashes / seeds).toFixed(2).padStart(8),
        (row.time / c).toFixed(1).padStart(5),
        String(Math.round(row.style / c)).padStart(6),
        (row.tokens / c).toFixed(1).padStart(7),
        pct(row.reached / seeds).padStart(8),
      ].join(' '),
    );
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

simulate('Clean skier: follows the validated line in a tuck, never jumps', true);
simulate('Cruiser: same line, never tucks (the yeti should win)', false);
